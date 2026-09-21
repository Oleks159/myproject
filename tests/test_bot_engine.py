"""Real frozen-model hands, persistence, isolation and legal-action contract."""
import copy
import json
import statistics
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'bot_engine'))
from worker import BotTables, TIERS
from game import Table, Conflict, load_models
from model_catalog import catalog


class BotEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.models = load_models()
        (ROOT / 'qa').mkdir(exist_ok=True)
        cls.timings = []

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='bot-tests-', dir=ROOT / 'qa')
        self.addCleanup(self.temp.cleanup)
        self.service = BotTables(self.temp.name, self.models)

    def call(self, operation, tier='high', account='alice', **payload):
        return self.service.dispatch(dict(operation=operation, tier=tier, account=account, payload=payload))

    def finish(self, table, profile='mixed'):
        s = table.mutate('next', dict(request_id=f'next-{table.revision}-test', revision=table.revision, profile=profile, rebuy_hero=True))
        for _ in range(200):
            self.timings.append(s['timing']['server_ms'])
            if s['status'] == 'finished':
                return s
            self.assertEqual(s['status'], 'hero_turn')
            self.assertTrue(s['legal_actions'])
            self.assertTrue(all(seat['cards'] is None for seat in s['seats'][1:]))
            self.assertEqual(len(s['seats'][0]['cards']), 2)
            self.assertEqual(sum(seat['stack'] for seat in s['seats']) + s['pot'], sum(s['starting_stacks']))
            s = table.mutate('action', dict(request_id=f'move-{table.revision}-test', revision=table.revision,
                                          action='check' if 'check' in s['legal_actions'] else 'call'))
        self.fail('Hand did not finish')

    def test_all_profiles_at_all_seven_stakes(self):
        profiles = catalog(self.models)['profiles']
        self.assertEqual(len(profiles), 16)
        self.assertEqual(len({id(m) for m in self.models.values()}), 11)
        for tier in TIERS:
            for row in profiles:
                with self.subTest(tier=tier['id'], profile=row['value']):
                    table = Table(self.models, seed=71, big_blind=tier['big'])
                    s = self.finish(table, row['value'])
                    self.assertEqual((s['small_blind'], s['big_blind']), (tier['small'], tier['big']))
                    self.assertEqual(sum(seat['stack'] for seat in s['seats']), 6 * tier['buyIn'])
                    self.assertAlmostEqual(sum(s['payoffs_bb']), 0)
                    self.assertEqual(len(s['recent_hands']), 1)
                    self.assertEqual(s['showdown'], len(s['board']) == 5 and sum(not seat['folded'] for seat in s['seats']) > 1)
                    for seat in s['seats']:
                        should_reveal = seat['seat'] == 0 or (s['showdown'] and not seat['folded'])
                        self.assertEqual(seat['revealed'], should_reveal)
                        self.assertEqual(seat['cards'] is not None, should_reveal)
                        if should_reveal:
                            self.assertEqual(len(seat['cards']), 2)
                    self.assertNotIn('seed', s)

    def test_checkpoint_open_hand_replay_conflicts_and_isolation(self):
        request = dict(request_id='initial-hand-test', revision=0, profile='depth_best')
        first = self.call('next', tier='micro', **request)['state']
        self.assertEqual(self.call('next', tier='micro', **request)['state'], first)
        with self.assertRaises(ValueError):
            self.call('next', tier='micro', **{**request, 'profile': 'mixed'})
        self.assertEqual(self.call('state', account='bob', tier='micro')['state']['status'], 'empty')
        self.assertEqual(self.call('state', tier='legend')['state']['status'], 'empty')
        self.assertTrue(all(t.models is self.models for t in self.service.tables.values()))
        self.service = BotTables(self.temp.name, self.models)
        self.assertEqual(self.call('state', tier='micro')['state'], first)
        with self.assertRaises(Conflict):
            self.call('action', tier='micro', request_id='stale-revision-test', revision=0, action='call')
        with self.assertRaises(ValueError):
            self.call('action', tier='micro', request_id='illegal-raise-test', revision=first['revision'], action='raise', to_total=10**12)
        self.assertEqual(self.call('state', tier='micro')['state'], first)

    def test_bankroll_carry_reset_archive_and_failed_save_rollback(self):
        path = Path(self.temp.name) / 'table.json'
        table = Table(self.models, seed=23, checkpoint=path, big_blind=20)
        s = self.finish(table, 'mixed_depth')
        archive = copy.deepcopy(table.completed_hands)
        ending = [seat['stack'] for seat in s['seats']]
        s = table.mutate('next', dict(request_id='second-hand-test', revision=s['revision'], profile='mixed_rl'))
        self.assertEqual(s['starting_stacks'], ending)
        before = copy.deepcopy(s)
        with patch.object(table, 'save', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                table.mutate('action', dict(request_id='failed-write-test', revision=s['revision'], action='check' if 'check' in s['legal_actions'] else 'call'))
        self.assertEqual(table.snapshot(), before)
        while s['status'] != 'finished':
            s = table.mutate('action', dict(request_id=f'end-{s["revision"]}-test', revision=s['revision'], action='check' if 'check' in s['legal_actions'] else 'call'))
        s = table.mutate('reset', dict(request_id='reset-stack-test', revision=s['revision'], confirm=True, stack_chips=8000))
        self.assertEqual(s['bankrolls'], [8000] * 6)
        self.assertEqual(s['total_bb'], 0)
        self.assertEqual(table.completed_hands[0], archive[0])
        self.assertEqual(Table(self.models, checkpoint=path, big_blind=20).snapshot(), s)

    def test_explicit_hero_rebuy(self):
        table = Table(self.models, seed=91, big_blind=50)
        self.finish(table)
        table.bankrolls[0] = 0
        request = dict(request_id='rebuy-hand-test', revision=table.revision)
        with self.assertRaises(Conflict):
            table.mutate('next', request)
        s = table.mutate('next', {**request, 'rebuy_hero': True})
        self.assertEqual(s['starting_stacks'][0], 5000)
        self.assertEqual(s['rebuys'][0], dict(seat=0, chips=5000, kind='play_chip_rebuy'))

    def test_terminal_reveal_contract(self):
        seats = [dict(seat=seat, folded=seat in (1, 3, 4, 5), cards=['As', 'Kd']) for seat in range(6)]
        public, showdown = Table._public_terminal_seats(['2c', '3d', '4h', '5s', '6c'], seats)
        self.assertTrue(showdown)
        self.assertEqual([seat['revealed'] for seat in public], [True, False, True, False, False, False])
        self.assertEqual([seat['cards'] is not None for seat in public], [True, False, True, False, False, False])

        public, showdown = Table._public_terminal_seats(['2c', '3d', '4h'], seats)
        self.assertFalse(showdown)
        self.assertEqual([seat['cards'] is not None for seat in public], [True, False, False, False, False, False])

        river_fold = [dict(seat=seat, folded=seat != 2, cards=['As', 'Kd']) for seat in range(6)]
        public, showdown = Table._public_terminal_seats(['2c', '3d', '4h', '5s', '6c'], river_fold)
        self.assertFalse(showdown)
        self.assertEqual([seat['cards'] is not None for seat in public], [True, False, False, False, False, False])

    @classmethod
    def tearDownClass(cls):
        if cls.timings:
            result = dict(requests=len(cls.timings), median_server_ms=statistics.median(cls.timings), max_server_ms=max(cls.timings), profiles=16, tiers=7)
            print('Real-model verification:', json.dumps(result))


if __name__ == '__main__':
    unittest.main(verbosity=2)
