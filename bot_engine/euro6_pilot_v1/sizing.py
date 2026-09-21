"""Conditional sizing policy. Raise target is TOTAL committed on this street."""
from pathlib import Path
import math
import numpy as np
import euro6_train_policy_v3 as v3

ROOT = Path(__file__).resolve().parent
HEADS = ("preflop_open", "preflop_reraise", "postflop_bet", "postflop_raise")
OPEN_SIZES = (2.0, 2.5, 3.0, 4.0, 5.0, 7.0)
FRACTIONS = (0.25, 1/3, 0.5, 0.75, 1.0, 1.5)
LABELS = tuple(str(i) for i in range(6)) + ("all_in",)


def head_for(packet, action):
    if action not in ("bet", "raise"):
        raise ValueError("sizing requires bet or raise")
    if packet["street"] != "preflop":
        return "postflop_" + action
    return "preflop_open" if packet["table"]["current_bet_bb"] <= 1.000001 else "preflop_reraise"


def target_class(packet):
    label, hero, table = packet["label"], packet["hero"], packet["table"]
    head = head_for(packet, label["action"])
    if label["amount_added_bb"] >= hero["stack_bb"] - 1e-5:
        return head, 6, 0.0
    if head == "preflop_open":
        value = label["to_total_bb"]
        choices = OPEN_SIZES
    else:
        denominator = table["pot_bb"] + (hero["to_call_bb"] if label["action"] == "raise" else 0)
        value = label["aggressive_increment_bb"] / max(denominator, 1e-9)
        choices = FRACTIONS
    if value <= 0 or not math.isfinite(value):
        raise ValueError("invalid aggression label")
    index = min(range(6), key=lambda k: abs(math.log(value / choices[k])))
    return head, index, value


class SizingPolicy:
    def __init__(self, profile):
        with np.load(ROOT / "models" / profile / "sizing.npz", allow_pickle=False) as data:
            self.data = {k: data[k].copy() for k in data.files}

    def options(self, packet, observation, action):
        head = head_for(packet, action)
        d = self.data
        vector = v3.packet_to_features(packet, v3.feature_spec())
        X = ((vector - d[head + "_mean"]) / d[head + "_std"])[None, :]
        model = tuple(d[head+"_"+key] for key in ("W1", "b1", "W2", "b2", "W3", "b3"))
        probs = v3.masked_softmax(v3.predict_logits(X, model), np.ones((1, 7), bool), float(d[head+"_temperature"]))[0]
        minimum, maximum = observation.get("min_raise_to"), observation.get("max_raise_to")
        if minimum is None or maximum is None:
            raise ValueError("min_raise_to and max_raise_to from game engine required for sizing")
        if not all(math.isfinite(v) for v in (minimum, maximum)) or minimum <= 0 or maximum < minimum:
            raise ValueError("invalid betting bounds")
        if maximum > observation['hero']['stack'] + observation['hero']['current_bet'] or minimum <= observation['current_bet']:
            raise ValueError("betting bounds exceed stack or do not increase the wager")
        bb, current, pot, call = (observation[k] for k in ("big_blind", "current_bet", "pot", "to_call"))
        unit = observation.get("chip_unit", 1)
        if unit <= 0 or not math.isfinite(unit):
            raise ValueError("invalid chip_unit")
        rows = {}
        for k, p in enumerate(probs):
            if k == 6:
                raw = maximum
            elif head == "preflop_open":
                raw = OPEN_SIZES[k] * bb
            else:
                raw = (current if action == "raise" else 0) + FRACTIONS[k] * (pot + (call if action == "raise" else 0))
            amount = min(maximum, max(minimum, math.ceil((raw - 1e-9) / unit) * unit))
            if float(amount).is_integer():
                amount = int(amount)
            rows[amount] = rows.get(amount, 0.0) + float(p)
        total = sum(rows.values())
        return [dict(to_total=amount, amount_added=amount-observation["hero"]["current_bet"],
                     probability=prob/total, head=head) for amount, prob in sorted(rows.items())]
