"""Private JSON-lines worker. Frozen models are shared by all training tables."""
import hashlib
import json
import os
from pathlib import Path
import sys
import traceback

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'euro6_pilot_v1' / 'mini_app'))
from game import Table, Conflict, load_models

TIERS = [
    dict(id='micro', name='Micro', big=10, tone='bronze'),
    dict(id='low', name='Low', big=20, tone='silver'),
    dict(id='mid', name='Mid', big=50, tone='blue'),
    dict(id='high', name='High', big=100, tone='red'),
    dict(id='elite', name='Elite', big=200, tone='teal'),
    dict(id='premier', name='Premier', big=500, tone='purple'),
    dict(id='legend', name='Legend', big=1000, tone='gold'),
]
for tier in TIERS:
    tier.update(small=tier['big'] // 2, buyIn=tier['big'] * 100, bots=5)


class BotTables:
    def __init__(self, data_dir, models=None):
        self.models = load_models() if models is None else models
        if 'depth_champion' not in self.models:
            raise RuntimeError('Das freigegebene Multi-Stack-Champion-Modell fehlt.')
        self.data_dir = Path(data_dir).resolve()
        self.tables = {}

    def dispatch(self, request):
        operation = request.get('operation')
        if operation == 'catalog':
            return dict(tiers=TIERS, bots=5, mode='practice')
        account = request.get('account')
        if not isinstance(account, str) or not 1 <= len(account) <= 100:
            raise ValueError('Konto fehlt.')
        tier = next((t for t in TIERS if t['id'] == request.get('tier')), None)
        if tier is None:
            raise ValueError('Unbekannter Bot-Tisch.')
        key = hashlib.sha256((account + ':' + tier['id']).encode()).hexdigest()
        if key not in self.tables:
            # Eviction is safe: every confirmed mutation is already checkpointed.
            if len(self.tables) >= 64:
                self.tables.pop(next(iter(self.tables)))
            self.tables[key] = Table(self.models, checkpoint=self.data_dir / (key + '.json'), big_blind=tier['big'])
        table = self.tables[key]
        payload = request.get('payload') or {}
        if operation == 'next':
            if payload.get('profile', 'depth_best') != 'depth_best':
                raise ValueError('Die Gegner werden automatisch bereitgestellt; Modellwahl ist nicht verfügbar.')
            payload = dict(payload, profile='depth_best')
        if operation == 'state':
            state = table.snapshot()
        elif operation in ('action', 'next', 'reset'):
            state = table.mutate(operation, payload)
        elif operation == 'hand':
            hand = table.hand_detail(payload.get('hand_id'))
            if hand is None:
                raise ValueError('Hand nicht gefunden.')
            return dict(hand=hand, tier=tier)
        else:
            raise ValueError('Unbekannte Bot-Aktion.')
        return dict(state=state, tier=tier)


def main():
    service = BotTables(os.environ.get('TPF_BOT_DATA_DIR', str(ROOT.parent / 'data' / 'bot_tables')))
    print(json.dumps(dict(ready=True)), flush=True)
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            result = service.dispatch(request)
            reply = dict(id=request['id'], result=result)
        except Conflict as exc:
            reply = dict(id=request.get('id'), status=409, error=str(exc))
        except (ValueError, TypeError, KeyError) as exc:
            reply = dict(id=request.get('id'), status=400, error=str(exc))
        except Exception:
            traceback.print_exc(file=sys.stderr)
            reply = dict(id=request.get('id'), status=500, error='Bot-Tisch konnte den Zug nicht speichern. Bitte neu laden.')
        print(json.dumps(reply, ensure_ascii=False, allow_nan=False), flush=True)


if __name__ == '__main__':
    main()
