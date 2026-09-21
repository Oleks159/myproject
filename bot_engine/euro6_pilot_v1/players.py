"""Cached frozen policies. Only public observation + own cards enter the model."""
import json
from pathlib import Path
import numpy as np
import euro6_train_policy_v3 as v3
from runtime_adapter import adapt_runtime_state
from sizing import SizingPolicy

ROOT = Path(__file__).resolve().parent


class ModelPlayer:
    def __init__(self, profile):
        registry = json.loads((ROOT / "model_registry.json").read_text(encoding="utf-8"))
        if profile not in registry["profiles"]:
            raise ValueError(f"unknown profile {profile!r}")
        self.profile = profile
        directory = ROOT / registry["profiles"][profile]["directory"]
        self.meta = json.loads((directory / "decision_policy_model_v3_features.json").read_text())
        with np.load(directory / "decision_policy_model_v3.npz", allow_pickle=False) as data:
            self.data = {k: data[k].copy() for k in data.files}
        self.models = [tuple(self.data[f"{k}_{i}"] for k in ("W1", "b1", "W2", "b2", "W3", "b3"))
                       for i in range(int(self.meta["ensemble_size"]))]
        self.sizing = SizingPolicy(profile)

    def distribution(self, observation):
        packet, warnings = adapt_runtime_state(observation)
        vector = v3.packet_to_features(packet, self.meta["features"])
        X = ((vector-self.data["mean"])/self.data["std"]).astype(np.float32)[None, :]
        legal = np.array([[a in packet["hero"]["legal_actions"] for a in v3.ACTIONS]])
        probs = v3.masked_softmax(v3.ensemble_logits(X, self.models), legal, float(self.data["temperature"]))[0]
        rows = [dict(action=a, probability=float(p)) for a, p in zip(v3.ACTIONS, probs) if a in packet["hero"]["legal_actions"]]
        return packet, warnings, rows

    def choose(self, observation, rng):
        packet, _, rows = self.distribution(observation)
        probs = np.array([r["probability"] for r in rows], dtype=float)
        action = rows[int(rng.choice(len(rows), p=probs/probs.sum()))]["action"]
        if action not in ("bet", "raise"):
            return action, None
        sizes = self.sizing.options(packet, observation, action)
        probs = np.array([r["probability"] for r in sizes])
        return action, sizes[int(rng.choice(len(sizes), p=probs/probs.sum()))]["to_total"]


class BaselinePlayer:
    def __init__(self, name):
        if name not in ("check_call", "random"):
            raise ValueError(name)
        self.name = name

    def choose(self, observation, rng):
        legal = observation["legal_actions"]
        action = ("check" if "check" in legal else "call") if self.name == "check_call" else str(rng.choice(legal))
        amount = None
        if action in ("bet", "raise"):
            lo, hi = observation["min_raise_to"], observation["max_raise_to"]
            options = sorted(set([lo, hi, int(min(hi, max(lo, observation["current_bet"] + observation["pot"]*.5)))]))
            amount = int(rng.choice(options))
        return action, amount


def make_player(name):
    return BaselinePlayer(name) if name in ("check_call", "random") else ModelPlayer(name)
