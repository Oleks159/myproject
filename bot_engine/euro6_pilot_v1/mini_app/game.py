"""Server-authoritative Hero table; one request advances all intervening bots."""
from collections import OrderedDict
import copy
import json
import os
import secrets
import sys
from pathlib import Path
import threading
import time
import tempfile
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from poker_env import PokerEnv, POSITIONS
from players import ModelPlayer
from model_catalog import PRESETS, load_optional

PROFILES = ('human_emphasis', 'balanced', 'pluribus_emphasis')


class Conflict(ValueError):
    pass


class Table:
    def __init__(self, models, seed=None, checkpoint=None, big_blind=100):
        self.models = models
        self.big_blind = big_blind
        self.rng = np.random.default_rng(secrets.randbits(128) if seed is None else seed)
        self.env = None
        self.hand_number = 0
        self.hand_id = None
        self.revision = 0
        self.total_bb = 0
        self.profile = 'mixed'
        self.lineup = PRESETS[self.profile]
        self.last_ms = 0
        self.last_inference_ms = []
        self.lock = threading.RLock()
        self.replies = OrderedDict()
        self.bankrolls = [100 * self.big_blind] * 6
        self.deposits = list(self.bankrolls)
        self.hand_rebuys = []
        self.completed_hands = []
        self.legacy_state = None
        self.reset_ready = False
        self.checkpoint = Path(checkpoint) if checkpoint is not None else None
        if self.checkpoint is not None and self.checkpoint.exists():
            self.restore(json.loads(self.checkpoint.read_text(encoding='utf-8')))

    def restore(self, data):
        if data['version'] not in (2, 3):
            raise ValueError('Unbekannter Spielstand. Nicht überschreiben.')
        if data.get('big_blind', 100) != self.big_blind:
            raise ValueError('Blinds des gespeicherten Tisches stimmen nicht überein.')
        for key in ('hand_number', 'hand_id', 'revision', 'total_bb', 'profile', 'bankrolls',
                    'deposits', 'hand_rebuys', 'completed_hands', 'last_ms', 'last_inference_ms'):
            setattr(self, key, copy.deepcopy(data[key]))
        self.lineup = PRESETS[self.profile]
        self.legacy_state = copy.deepcopy(data.get('legacy_state'))
        self.reset_ready = data.get('reset_ready', False)
        self.rng.bit_generator.state = data['rng']
        self.replies = OrderedDict((key, tuple(signature)+(None,None) if len(signature)==6 else tuple(signature)) for key, signature in data['requests'])
        record = data['env']
        if record is not None:
            e = PokerEnv(seed=record['seed'], button_seat=record['button'], starting_stacks=record['starting_stacks'], big_blind=self.big_blind)
            for event in record['history'][2:]:
                if e.actor_seat != event['seat']:
                    raise ValueError('Spielstand ist nicht konsistent.')
                e.step(event['action'], event['to_total'] if event['action'] in ('bet', 'raise') else None)
            if e.history != record['history']:
                raise ValueError('Spielstand konnte nicht exakt wiederhergestellt werden.')
            self.env = e

    def save(self):
        if self.checkpoint is None:
            return
        e = self.env
        data = {key: getattr(self, key) for key in ('hand_number', 'hand_id', 'revision', 'total_bb',
            'profile', 'bankrolls', 'deposits', 'hand_rebuys', 'completed_hands', 'last_ms', 'last_inference_ms')}
        data.update(version=3, big_blind=self.big_blind, legacy_state=self.legacy_state, reset_ready=self.reset_ready, rng=self.rng.bit_generator.state, requests=list(self.replies.items()),
                    env=None if e is None else dict(seed=e.seed, button=e.button,
                        starting_stacks=e.starting_stacks, history=e.history))
        # Server-owned JSON, never pickle. Replace only after the complete checkpoint is flushed.
        self.checkpoint.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix='.table-', suffix='.tmp', dir=self.checkpoint.parent)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                json.dump(data, stream, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.checkpoint)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def hand_summaries(self):
        return [dict(hand_id=h['hand_id'], hand_number=h['hand_number'], board=list(h['board']),
                     payoff_bb=h['payoffs_bb'][0], hero_cards=list(h['seats'][0]['cards']), legacy=h.get('legacy', False))
                for h in reversed(self.completed_hands)]

    @staticmethod
    def _is_showdown(board, seats):
        """A reveal needs a complete board and at least two live players."""
        return len(board) == 5 and sum(not seat.get('folded', False) for seat in seats) > 1

    @classmethod
    def _public_terminal_seats(cls, board, seats):
        """Never expose folded or uncontested opponents' private cards."""
        public = copy.deepcopy(seats)
        showdown = cls._is_showdown(board, public)
        for seat in public:
            revealed = seat.get('seat') == 0 or (showdown and not seat.get('folded', False))
            seat['revealed'] = revealed
            if not revealed:
                seat['cards'] = None
        return public, showdown

    def hand_detail(self, hand_id):
        with self.lock:
            hand = copy.deepcopy(next((h for h in self.completed_hands if h['hand_id'] == hand_id), None))
            if hand is None:
                return None
            hand['seats'], hand['showdown'] = self._public_terminal_seats(hand['board'], hand['seats'])
            return hand

    def import_legacy(self, state):
        """One-time import of a FINISHED v1 hand, without inventing hidden cards.

        V1 reset stacks each hand. Its cumulative Hero result becomes the opening
        balance adjustment; opponents retain only their last known final stacks.
        """
        if self.env is not None or self.hand_number or (self.checkpoint and self.checkpoint.exists()):
            raise ValueError('Zieltisch enthält bereits einen Spielstand.')
        if state.get('status') != 'finished' or state.get('payoff_bb') is None:
            raise ValueError('Die laufende Hand muss zuerst beendet werden.')
        hero_balance = 10000 + round(state['total_bb'] * 100)
        if hero_balance < 0:
            raise ValueError('Negativer Altbestand braucht eine ausdrückliche Nachkauf-Festlegung.')
        self.hand_number, self.hand_id, self.revision = state['hand_number'], state['hand_id'], state['revision']
        self.profile, self.total_bb = state['profile'], state['total_bb']
        self.lineup = PRESETS[self.profile]
        self.bankrolls = [s['stack'] for s in state['seats']]
        self.bankrolls[0] = hero_balance
        self.completed_hands = [dict(hand_id=self.hand_id, hand_number=self.hand_number, legacy=True,
            board=copy.deepcopy(state['board']), seats=copy.deepcopy(state['seats']),
            history=copy.deepcopy(state['history']), button_seat=state['button_seat'],
            big_blind=100, small_blind=50, starting_stacks=[10000]*6,
            ending_stacks=[s['stack'] for s in state['seats']], payoffs_bb=list(state['payoffs_bb']),
            rewards_bb=list(state['payoffs_bb']), final_pot=state['final_pot'], rebuys=[])]
        self.legacy_state = copy.deepcopy(state)
        self.legacy_state.update(legacy=True, small_blind=50, rebuys=[], hero_deposits_bb=100)
        self.legacy_state['seats'][0]['stack'] = hero_balance
        self.save()

    def advance(self):
        self.last_inference_ms = []
        while not self.env.done and self.env.actor_seat != 0:
            obs = self.env.observation()
            model = self.models[self.lineup[self.env.actor_seat - 1]]
            start = time.perf_counter()
            action, amount = model.choose(obs, self.rng)
            self.last_inference_ms.append(1000*(time.perf_counter()-start))
            self.env.step(action, amount)
        if self.env.done:
            result = self.env.result()
            self.total_bb += result['payoffs_bb'][0]
            self.bankrolls = [self.env.state.stacks[self.env.seats.index(s)] for s in range(6)]
            final = self.snapshot()
            self.completed_hands = (self.completed_hands + [dict(
                hand_id=self.hand_id, hand_number=self.hand_number, board=list(self.env.board),
                button_seat=self.env.button, big_blind=self.big_blind, small_blind=self.big_blind // 2,
                seats=final['seats'], history=copy.deepcopy(self.env.history),
                starting_stacks=list(self.env.starting_stacks), ending_stacks=list(self.bankrolls),
                payoffs_bb=list(result['payoffs_bb']), rewards_bb=list(result['payoffs_bb']),
                final_pot=final['final_pot'], rebuys=copy.deepcopy(self.hand_rebuys))])[-100:]

    def mutate(self, operation, payload):
        with self.lock:
            request_id = payload.get('request_id')
            if not isinstance(request_id, str) or not 8 <= len(request_id) <= 80:
                raise ValueError('request_id fehlt.')
            signature = (operation, payload.get('revision'), payload.get('action'), payload.get('to_total'), payload.get('profile'), payload.get('rebuy_hero'), payload.get('stack_chips'), payload.get('confirm'))
            if request_id in self.replies:
                if signature != self.replies[request_id]:
                    raise Conflict('Request-ID wurde bereits für einen anderen Zug verwendet.')
                return self.snapshot()
            if type(payload.get('revision')) is not int or payload['revision'] != self.revision:
                raise Conflict('Der Tisch hat sich geändert. Zustand neu laden.')
            if operation == 'next':
                if self.env and not self.env.done:
                    raise Conflict('Die aktuelle Hand läuft noch.')
                profile = payload.get('profile', self.profile)
                if profile not in PRESETS or not all(p in self.models for p in PRESETS[profile]):
                    raise ValueError('Unbekannte Gegnerauswahl.')
                if 'rebuy_hero' in payload and type(payload['rebuy_hero']) is not bool:
                    raise ValueError('Nachkauf muss bestätigt werden.')
                if self.bankrolls[0] == 0 and payload.get('rebuy_hero') is not True:
                    raise Conflict('Hero hat keine Chips mehr. 100 BB Spielchips nachkaufen, um fortzufahren.')
            elif operation == 'reset':
                if self.env and not self.env.done:
                    raise Conflict('Die aktuelle Hand muss zuerst beendet werden.')
                if payload.get('confirm') is not True:
                    raise ValueError('Stack-Neustart muss bestätigt werden.')
                amount = payload.get('stack_chips')
                if type(amount) is not int or not self.big_blind <= amount <= self.big_blind * 10000:
                    raise ValueError('Stack muss zwischen 1 und 10.000 BB liegen.')
            elif operation == 'action':
                if self.env is None or self.env.done or self.env.actor_seat != 0:
                    raise Conflict('Hero ist nicht am Zug.')
            else:
                raise ValueError('Unbekannte Operation.')
            start = time.perf_counter()
            # Roll back the entire transaction on model/engine failure, not just the Hero action.
            backup = {key: value for key, value in self.__dict__.items()
                      if key not in ('models', 'lock', 'checkpoint')}
            for key in ('env', 'rng', 'replies'):
                backup[key] = copy.deepcopy(backup[key])
            try:
                if operation == 'next':
                    self.reset_ready = False
                    self.legacy_state = None
                    self.profile, self.lineup = profile, PRESETS[profile]
                    self.bankrolls, self.deposits = list(self.bankrolls), list(self.deposits)
                    self.hand_rebuys = []
                    for seat in range(6):
                        if self.bankrolls[seat] == 0:
                            self.bankrolls[seat] = self.big_blind * 100
                            self.deposits[seat] += self.big_blind * 100
                            self.hand_rebuys.append(dict(seat=seat, chips=self.big_blind * 100, kind='play_chip_rebuy'))
                    self.env = PokerEnv(seed=int(self.rng.integers(0, 2**63)), button_seat=(5+self.hand_number)%6,
                                        starting_stacks=self.bankrolls, big_blind=self.big_blind)
                    self.hand_number += 1
                    self.hand_id = secrets.token_hex(8)  # Never expose the deck seed.
                elif operation == 'reset':
                    self.bankrolls = [payload['stack_chips']] * 6
                    self.deposits = list(self.bankrolls)
                    self.total_bb = 0
                    self.env, self.hand_id, self.legacy_state = None, None, None
                    self.hand_rebuys, self.last_inference_ms = [], []
                    self.reset_ready = True
                else:
                    action, amount = payload.get('action'), payload.get('to_total')
                    if action not in ('bet', 'raise') and amount is not None:
                        raise ValueError('Nur Bet/Raise akzeptiert einen Betrag.')
                    self.env.step(action, amount)
                if operation != 'reset':
                    self.advance()
                self.revision += 1
                self.last_ms = 1000*(time.perf_counter()-start)
                self.replies[request_id] = signature
                while len(self.replies) > 16:
                    self.replies.popitem(last=False)
                self.save()
            except Exception:
                self.__dict__.update(backup)
                raise
            return self.snapshot()

    def snapshot(self):
        with self.lock:
            e = self.env
            if e is None:
                if self.reset_ready:
                    button = (5+self.hand_number)%6
                    order = [(button+i)%6 for i in range(1,7)]
                    return dict(revision=self.revision, status='ready', hand_id=None, hand_number=self.hand_number,
                        profile=self.profile, total_bb=0, recent_hands=self.hand_summaries(),
                        bankrolls=list(self.bankrolls), starting_stacks=list(self.bankrolls),
                        starting_stack_bb=self.bankrolls[0]/self.big_blind, hero_deposits_bb=self.deposits[0]/self.big_blind,
                        seats=[dict(seat=s,position=POSITIONS[order.index(s)],stack=self.bankrolls[s],
                            current_bet=0,folded=False,all_in=False,profile='hero' if s==0 else self.lineup[s-1],
                            cards=None,last_action=None) for s in range(6)],
                        button_seat=button,board=[],small_blind=self.big_blind//2,big_blind=self.big_blind,street='ready',pot=0,final_pot=0,
                        to_call=0,legal_actions=[],min_raise_to=None,max_raise_to=None,payoff_bb=0,
                        payoffs_bb=[0]*6,history=[],rebuys=[],
                        timing=dict(server_ms=round(self.last_ms,2),bot_decisions=0,inference_ms=0))
                if self.legacy_state is not None:
                    state = copy.deepcopy(self.legacy_state)
                    state['seats'], state['showdown'] = self._public_terminal_seats(state.get('board', []), state['seats'])
                    state['street'] = 'showdown' if state['showdown'] else 'finished'
                    state.update(revision=self.revision, recent_hands=self.hand_summaries())
                    return state
                return dict(revision=self.revision, status='empty', profile=self.profile,
                            total_bb=self.total_bb, recent_hands=self.hand_summaries(), bankrolls=list(self.bankrolls))
            obs = e.observation() if not e.done else None
            if obs is not None and obs['hero']['seat'] != 0:
                raise RuntimeError('Bot turn escaped the server loop.')
            seats = []
            for seat in range(6):
                index = e.seats.index(seat)
                last = next((r for r in reversed(e.history) if r['seat'] == seat), None)
                seats.append(dict(seat=seat, position=POSITIONS[index], stack=e.state.stacks[index],
                    current_bet=e.state.bets[index], folded=index in e.folded,
                    all_in=e.state.stacks[index] == 0 and index not in e.folded,
                    profile='hero' if seat == 0 else self.lineup[seat-1],
                    cards=list(e.hole_cards[index]) if seat == 0 else None,
                    last_action=copy.deepcopy(last)))
            showdown = e.done and self._is_showdown(e.board, seats)
            if showdown:
                for seat in seats:
                    if seat['seat'] != 0 and not seat['folded']:
                        index = e.seats.index(seat['seat'])
                        seat['cards'] = list(e.hole_cards[index])
            for seat in seats:
                seat['revealed'] = seat['seat'] == 0 or (showdown and not seat['folded'])
            result = e.result() if e.done else None
            return dict(revision=self.revision, hand_id=self.hand_id, hand_number=self.hand_number,
                status='finished' if e.done else 'hero_turn', profile=self.profile, seats=seats,
                button_seat=e.button, board=e.board, small_blind=self.big_blind//2, big_blind=self.big_blind,
                starting_stack_bb=e.starting_stacks[0]/self.big_blind, starting_stacks=list(e.starting_stacks),
                street=('showdown' if showdown else 'finished') if e.done else obs['street'], showdown=showdown,
                pot=e.state.total_pot_amount,
                final_pot=sum(sum(op.amounts) for op in e.state.operations if type(op).__name__ == 'ChipsPushing') if e.done else None,
                to_call=0 if e.done else obs['to_call'], legal_actions=[] if e.done else obs['legal_actions'],
                min_raise_to=None if e.done else obs['min_raise_to'], max_raise_to=None if e.done else obs['max_raise_to'],
                total_bb=round(self.total_bb, 2), payoff_bb=result['payoffs_bb'][0] if result else None,
                payoffs_bb=result['payoffs_bb'] if result else None, history=copy.deepcopy(e.history),
                recent_hands=self.hand_summaries(), rebuys=copy.deepcopy(self.hand_rebuys),
                hero_deposits_bb=self.deposits[0]/self.big_blind,
                timing=dict(server_ms=round(self.last_ms, 2), bot_decisions=len(self.last_inference_ms),
                    inference_ms=round(sum(self.last_inference_ms), 2)))


def load_models():
    return {**{profile: ModelPlayer(profile) for profile in PROFILES}, **load_optional()}
