#!/usr/bin/env python3
from __future__ import annotations

import argparse
import itertools
import json
import math
import time
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np


ACTIONS = ["fold", "check", "call", "bet", "raise"]
ACTION_TO_ID = {action: index for index, action in enumerate(ACTIONS)}
STREETS = ["preflop", "flop", "turn", "river"]
POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"]
RANKS = "23456789TJQKA"
RANK_VALUE = {rank: index + 2 for index, rank in enumerate(RANKS)}
SOURCE_TO_ID = {"pluribus_all_player": 0, "pokerstars_hero_only": 1}


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        return number if math.isfinite(number) else default
    except Exception:
        return default


def log_value(value: Any) -> float:
    return math.log1p(max(0.0, safe_float(value)))


def card_rank(card: str) -> int:
    return RANK_VALUE.get(str(card)[:1].upper(), 0)


def card_suit(card: str) -> str:
    text = str(card)
    return text[1].lower() if len(text) == 2 and text[1].lower() in "cdhs" else ""


def five_card_category(cards: List[str]) -> int:
    ranks = sorted((card_rank(card) for card in cards), reverse=True)
    counts = Counter(ranks)
    groups = sorted(counts.values(), reverse=True)
    suits = [card_suit(card) for card in cards]
    flush = len(set(suits)) == 1
    unique = sorted(set(ranks))
    if 14 in unique:
        unique = [1] + unique
    straight = any(all(value in unique for value in range(start, start + 5)) for start in range(1, 11))
    if straight and flush:
        return 8
    if groups == [4, 1]:
        return 7
    if groups == [3, 2]:
        return 6
    if flush:
        return 5
    if straight:
        return 4
    if groups == [3, 1, 1]:
        return 3
    if groups == [2, 2, 1]:
        return 2
    if groups == [2, 1, 1, 1]:
        return 1
    return 0


def best_made_category(cards: List[str]) -> int:
    if len(cards) < 5:
        return 0
    return max(five_card_category(list(combo)) for combo in itertools.combinations(cards, 5))


def preflop_combo_index(cards: List[str]) -> int:
    if len(cards) != 2:
        return -1
    first, second = card_rank(cards[0]), card_rank(cards[1])
    if not first or not second:
        return -1
    high, low = max(first, second) - 2, min(first, second) - 2
    if high == low:
        row, col = high, low
    elif card_suit(cards[0]) == card_suit(cards[1]):
        row, col = high, low
    else:
        row, col = low, high
    return row * 13 + col


def feature_spec() -> List[str]:
    names = [
        "rank_high", "rank_low", "pocket_pair", "premium_pair", "suited", "connected",
        "gap", "broadway_count", "ace_high", "stack_log", "effective_stack_log",
        "shortest_effective_stack_log", "pot_log", "to_call_log", "nominal_to_call_log",
        "current_bet_log", "invested_log", "pot_odds", "spr_log", "stack_to_pot_log",
        "effective_stack_to_pot_log", "shortest_effective_stack_to_pot_log",
        "to_call_to_pot", "to_call_to_stack", "facing_wager", "facing_bet", "facing_raise",
        "hero_has_acted", "call_is_all_in", "players_in_hand", "players_all_in",
        "decision_index_in_hand", "decision_index_on_street", "betting_cycle_index",
        "board_count", "board_high", "board_pair_count", "board_trips", "board_max_suit",
        "flush_draw", "straight_draw", "hero_pair_with_board", "overpair", "top_pair",
        "two_pair_plus", "action_count_hand", "action_count_street", "folds_hand",
        "checks_hand", "calls_hand", "bets_hand", "raises_hand", "folds_street",
        "checks_street", "calls_street", "bets_street", "raises_street",
        "last_aggressive_fraction", "last_aggressive_increment_log",
    ]
    names += [f"street_{street}" for street in STREETS]
    names += [f"position_{position}" for position in POSITIONS]
    names += [f"rank_high_{rank}" for rank in RANKS]
    names += [f"rank_low_{rank}" for rank in RANKS]
    names += [f"pair_rank_{rank}" for rank in RANKS]
    names += [f"preflop_combo_{index}" for index in range(169)]
    names += [f"board_rank_count_{rank}" for rank in RANKS]
    names += [f"made_category_{index}" for index in range(9)]
    names += [f"last_aggressor_{position}" for position in POSITIONS]
    names += [f"last_action_{action}" for action in ACTIONS]
    names += [f"legal_{action}" for action in ACTIONS]
    return names


def packet_feature_dict(packet: Dict[str, Any]) -> Dict[str, float]:
    hero = packet.get("hero") or {}
    board = packet.get("board") or {}
    table = packet.get("table") or {}
    pressure = packet.get("pressure") or {}
    ratios = packet.get("ratios") or {}
    cards = list(hero.get("cards") or [])
    board_cards = list(board.get("cards") or [])
    street = str(packet.get("street") or "preflop")
    position = str(hero.get("position") or "")
    stack = safe_float(hero.get("stack_bb"))
    effective = safe_float(hero.get("effective_stack_bb"), stack)
    shortest = safe_float(hero.get("shortest_active_effective_stack_bb"), effective)
    pot = safe_float(table.get("pot_bb"))
    all_rows: List[Dict[str, Any]] = []
    street_rows: List[Dict[str, Any]] = []
    sequence = packet.get("action_sequence") or {}
    for name in STREETS:
        rows = [row for row in (sequence.get(name) or []) if isinstance(row, dict)]
        all_rows.extend(rows)
        if name == street:
            street_rows = rows

    action_counts = Counter(str(row.get("action") or "") for row in all_rows)
    street_counts = Counter(str(row.get("action") or "") for row in street_rows)
    last_row = street_rows[-1] if street_rows else {}
    last_aggressive = next(
        (row for row in reversed(street_rows) if row.get("action") in ("bet", "raise")),
        {},
    )

    board_ranks = [card_rank(card) for card in board_cards if card_rank(card)]
    board_suits = Counter(card_suit(card) for card in board_cards if card_suit(card))
    board_rank_counts = Counter(board_ranks)
    all_cards = cards + board_cards
    all_ranks = set(card_rank(card) for card in all_cards if card_rank(card))
    wheel_ranks = set(all_ranks)
    if 14 in wheel_ranks:
        wheel_ranks.add(1)
    all_suits = Counter(card_suit(card) for card in all_cards if card_suit(card))
    made_category = best_made_category(all_cards)
    flush_draw = float(made_category < 5 and any(count >= 4 for count in all_suits.values()))
    straight_draw = float(
        made_category < 4
        and any(len(wheel_ranks.intersection(set(range(start, start + 5)))) >= 4 for start in range(1, 11))
    )
    hero_ranks = [card_rank(card) for card in cards if card_rank(card)]
    board_high = max(board_ranks) if board_ranks else 0
    hero_pair_with_board = any(rank in board_rank_counts for rank in hero_ranks)
    pocket_pair = bool(hero.get("pocket_pair"))
    pair_rank = int(hero.get("pocket_pair_rank") or 0)
    overpair = bool(pocket_pair and board_high and pair_rank > board_high)
    top_pair = bool(hero_pair_with_board and board_high in hero_ranks)

    values: Dict[str, float] = {
        "rank_high": safe_float(hero.get("rank_high")) / 14.0,
        "rank_low": safe_float(hero.get("rank_low")) / 14.0,
        "pocket_pair": float(pocket_pair),
        "premium_pair": float(bool(hero.get("premium_pair"))),
        "suited": float(bool(hero.get("suited"))),
        "connected": float(bool(hero.get("connected"))),
        "gap": min(12.0, max(0.0, safe_float(hero.get("gap")))) / 12.0,
        "broadway_count": safe_float(hero.get("broadway_count")) / 2.0,
        "ace_high": float(bool(hero.get("ace_high"))),
        "stack_log": log_value(stack),
        "effective_stack_log": log_value(effective),
        "shortest_effective_stack_log": log_value(shortest),
        "pot_log": log_value(pot),
        "to_call_log": log_value(hero.get("to_call_bb")),
        "nominal_to_call_log": log_value(hero.get("nominal_to_call_bb")),
        "current_bet_log": log_value(table.get("current_bet_bb")),
        "invested_log": log_value(hero.get("invested_this_street_bb")),
        "pot_odds": safe_float(ratios.get("pot_odds")),
        "spr_log": log_value(ratios.get("spr")),
        "stack_to_pot_log": log_value(ratios.get("stack_to_pot")),
        "effective_stack_to_pot_log": log_value(ratios.get("effective_stack_to_pot")),
        "shortest_effective_stack_to_pot_log": log_value(ratios.get("shortest_effective_stack_to_pot")),
        "to_call_to_pot": min(10.0, safe_float(ratios.get("to_call_to_pot"))) / 10.0,
        "to_call_to_stack": min(1.0, safe_float(ratios.get("to_call_to_stack"))),
        "facing_wager": float(bool(pressure.get("facing_wager"))),
        "facing_bet": float(bool(pressure.get("facing_bet"))),
        "facing_raise": float(bool(pressure.get("facing_raise"))),
        "hero_has_acted": float(bool(pressure.get("hero_has_acted_this_street"))),
        "call_is_all_in": float(bool(pressure.get("call_is_all_in"))),
        "players_in_hand": safe_float(table.get("players_in_hand_count")) / 6.0,
        "players_all_in": safe_float(table.get("players_all_in_count")) / 6.0,
        "decision_index_in_hand": min(20.0, safe_float(packet.get("decision_index_in_hand"))) / 20.0,
        "decision_index_on_street": min(10.0, safe_float(packet.get("decision_index_on_street"))) / 10.0,
        "betting_cycle_index": min(5.0, safe_float(packet.get("betting_cycle_index"))) / 5.0,
        "board_count": len(board_cards) / 5.0,
        "board_high": board_high / 14.0,
        "board_pair_count": sum(1 for count in board_rank_counts.values() if count >= 2) / 2.0,
        "board_trips": float(any(count >= 3 for count in board_rank_counts.values())),
        "board_max_suit": (max(board_suits.values()) if board_suits else 0) / 5.0,
        "flush_draw": flush_draw,
        "straight_draw": straight_draw,
        "hero_pair_with_board": float(hero_pair_with_board),
        "overpair": float(overpair),
        "top_pair": float(top_pair),
        "two_pair_plus": float(made_category >= 2),
        "action_count_hand": min(40, len(all_rows)) / 40.0,
        "action_count_street": min(20, len(street_rows)) / 20.0,
        "last_aggressive_fraction": min(10.0, safe_float(last_aggressive.get("aggressive_increment_bb")) / max(1e-9, safe_float(last_aggressive.get("pot_before_bb"), pot))) / 10.0,
        "last_aggressive_increment_log": log_value(last_aggressive.get("aggressive_increment_bb")),
    }
    for action in ACTIONS:
        values[f"{action}s_hand"] = min(10, action_counts[action]) / 10.0
        values[f"{action}s_street"] = min(10, street_counts[action]) / 10.0
        values[f"last_action_{action}"] = float(last_row.get("action") == action)
        values[f"legal_{action}"] = float(action in set(hero.get("legal_actions") or []))
    for name in STREETS:
        values[f"street_{name}"] = float(street == name)
    for name in POSITIONS:
        values[f"position_{name}"] = float(position == name)
        values[f"last_aggressor_{name}"] = float(table.get("last_aggressor_position") == name)
    high = int(hero.get("rank_high") or 0)
    low = int(hero.get("rank_low") or 0)
    for rank in RANKS:
        value = RANK_VALUE[rank]
        values[f"rank_high_{rank}"] = float(high == value)
        values[f"rank_low_{rank}"] = float(low == value)
        values[f"pair_rank_{rank}"] = float(pair_rank == value)
        values[f"board_rank_count_{rank}"] = board_rank_counts[value] / 4.0
    combo = preflop_combo_index(cards)
    if combo >= 0:
        values[f"preflop_combo_{combo}"] = 1.0
    values[f"made_category_{made_category}"] = 1.0
    return values


def packet_to_features(packet: Dict[str, Any], features: List[str]) -> np.ndarray:
    values = packet_feature_dict(packet)
    return np.asarray([values.get(name, 0.0) for name in features], dtype=np.float32)


def count_jsonl(path: Path, maximum: int) -> int:
    count = 0
    with path.open("r", encoding="utf-8-sig", errors="replace") as handle:
        for line in handle:
            if line.strip():
                count += 1
                if maximum and count >= maximum:
                    break
    return count


def is_unopened(packet: Dict[str, Any]) -> bool:
    rows = (packet.get("action_sequence") or {}).get("preflop") or []
    return not any(row.get("action") in ("call", "bet", "raise") for row in rows if isinstance(row, dict))


def load_split(path: Path, features: List[str], maximum: int = 0) -> Dict[str, np.ndarray]:
    count = count_jsonl(path, maximum)
    X = np.empty((count, len(features)), dtype=np.float32)
    y = np.empty(count, dtype=np.int64)
    legal = np.zeros((count, len(ACTIONS)), dtype=bool)
    source = np.empty(count, dtype=np.int8)
    street = np.empty(count, dtype=np.int8)
    pair_rank = np.zeros(count, dtype=np.int8)
    unopened = np.zeros(count, dtype=bool)
    with path.open("r", encoding="utf-8-sig", errors="replace") as handle:
        index = 0
        for line in handle:
            if not line.strip():
                continue
            packet = json.loads(line)
            X[index] = packet_to_features(packet, features)
            action = packet["label"]["action"]
            y[index] = ACTION_TO_ID[action]
            for legal_action in packet["hero"]["legal_actions"]:
                if legal_action in ACTION_TO_ID:
                    legal[index, ACTION_TO_ID[legal_action]] = True
            source[index] = SOURCE_TO_ID[packet["source"]["dataset"]]
            street[index] = int(packet["street_id"])
            pair_rank[index] = int(packet["hero"].get("pocket_pair_rank") or 0)
            unopened[index] = bool(packet["street"] == "preflop" and is_unopened(packet))
            index += 1
            if maximum and index >= maximum:
                break
    return {"X": X, "y": y, "legal": legal, "source": source, "street": street, "pair_rank": pair_rank, "unopened": unopened}


def relu(values: np.ndarray) -> np.ndarray:
    return np.maximum(values, 0.0)


def masked_softmax(logits: np.ndarray, legal: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    masked = np.where(legal, logits / temperature, -1e9)
    masked -= masked.max(axis=1, keepdims=True)
    exp = np.exp(masked) * legal
    return exp / np.maximum(exp.sum(axis=1, keepdims=True), 1e-12)


def forward(X, W1, b1, W2, b2, W3, b3):
    h1_pre = X @ W1 + b1
    h1 = relu(h1_pre)
    h2_pre = h1 @ W2 + b2
    h2 = relu(h2_pre)
    return h1_pre, h1, h2_pre, h2, h2 @ W3 + b3


def nll(probs: np.ndarray, y: np.ndarray, weights: np.ndarray | None = None) -> float:
    losses = -np.log(probs[np.arange(len(y)), y] + 1e-12)
    return float(np.average(losses, weights=weights)) if len(y) else 0.0


def predict_logits(X, model):
    return forward(X, *model)[-1]


def train_one(X, y, legal, sample_weights, X_val, y_val, legal_val, val_weights, hidden1, hidden2, epochs, batch, lr, seed, num_outputs=None):
    rng = np.random.default_rng(seed)
    W1 = rng.normal(0, math.sqrt(2 / X.shape[1]), (X.shape[1], hidden1)).astype(np.float32)
    b1 = np.zeros(hidden1, dtype=np.float32)
    W2 = rng.normal(0, math.sqrt(2 / hidden1), (hidden1, hidden2)).astype(np.float32)
    b2 = np.zeros(hidden2, dtype=np.float32)
    width = len(ACTIONS) if num_outputs is None else num_outputs
    W3 = rng.normal(0, math.sqrt(2 / hidden2), (hidden2, width)).astype(np.float32)
    b3 = np.zeros(width, dtype=np.float32)
    params = [W1, b1, W2, b2, W3, b3]
    moments = [[np.zeros_like(value), np.zeros_like(value)] for value in params]
    beta1, beta2, step = 0.9, 0.999, 0
    indices = np.arange(len(X))
    best, best_loss, stale = None, float("inf"), 0
    history = []
    for epoch in range(1, epochs + 1):
        rng.shuffle(indices)
        for start in range(0, len(indices), batch):
            idx = indices[start:start + batch]
            xb, yb, lb = X[idx], y[idx], legal[idx]
            wb = sample_weights[idx]
            h1_pre, h1, h2_pre, h2, logits = forward(xb, *params)
            probs = masked_softmax(logits, lb)
            dlogits = probs
            dlogits[np.arange(len(yb)), yb] -= 1.0
            dlogits *= (wb / max(1e-9, wb.sum()))[:, None]
            dW3 = h2.T @ dlogits + 1e-5 * W3
            db3 = dlogits.sum(axis=0)
            dh2 = dlogits @ W3.T
            dh2_pre = dh2 * (h2_pre > 0)
            dW2 = h1.T @ dh2_pre + 1e-5 * W2
            db2 = dh2_pre.sum(axis=0)
            dh1 = dh2_pre @ W2.T
            dh1_pre = dh1 * (h1_pre > 0)
            dW1 = xb.T @ dh1_pre + 1e-5 * W1
            db1 = dh1_pre.sum(axis=0)
            step += 1
            for parameter, gradient, (m, v) in zip(params, [dW1, db1, dW2, db2, dW3, db3], moments):
                m[:] = beta1 * m + (1 - beta1) * gradient
                v[:] = beta2 * v + (1 - beta2) * gradient * gradient
                mhat = m / (1 - beta1 ** step)
                vhat = v / (1 - beta2 ** step)
                parameter[:] -= lr * mhat / (np.sqrt(vhat) + 1e-8)
        if epoch == 1 or epoch % 2 == 0 or epoch == epochs:
            val_probs = masked_softmax(predict_logits(X_val, params), legal_val)
            val_loss = nll(val_probs, y_val, val_weights)
            val_acc = float((val_probs.argmax(axis=1) == y_val).mean())
            history.append({"epoch": epoch, "val_weighted_nll": val_loss, "val_accuracy": val_acc})
            print(f"[SEED {seed} EPOCH {epoch:03d}] val_nll={val_loss:.5f} val_acc={val_acc:.4f}", flush=True)
            if val_loss < best_loss - 1e-5:
                best_loss = val_loss
                best = tuple(value.copy() for value in params)
                stale = 0
            else:
                stale += 1
                if stale >= 5:
                    break
    return best or tuple(params), history


def ensemble_logits(X: np.ndarray, models: List[Tuple[np.ndarray, ...]]) -> np.ndarray:
    return np.mean([predict_logits(X, model) for model in models], axis=0)


def metric_block(y, probs, source=None, street=None) -> Dict[str, Any]:
    pred = probs.argmax(axis=1)
    block: Dict[str, Any] = {
        "count": int(len(y)),
        "accuracy": float((pred == y).mean()) if len(y) else None,
        "nll": nll(probs, y),
        "confusion": [[int(np.sum((y == actual) & (pred == predicted))) for predicted in range(len(ACTIONS))] for actual in range(len(ACTIONS))],
        "per_action_accuracy": {},
    }
    for action, action_id in ACTION_TO_ID.items():
        mask = y == action_id
        block["per_action_accuracy"][action] = float((pred[mask] == action_id).mean()) if mask.any() else None
    if source is not None:
        block["by_source"] = {}
        for name, source_id in SOURCE_TO_ID.items():
            mask = source == source_id
            block["by_source"][name] = metric_block(y[mask], probs[mask]) if mask.any() else {"count": 0}
    if street is not None:
        block["by_street"] = {}
        for street_name, street_id in zip(STREETS, range(4)):
            mask = street == street_id
            block["by_street"][street_name] = metric_block(y[mask], probs[mask]) if mask.any() else {"count": 0}
    return block


def critical_sanity(data: Dict[str, np.ndarray], probs: np.ndarray) -> Dict[str, Any]:
    pred = probs.argmax(axis=1)
    result = {}
    for minimum, name in ((10, "unopened_TT_plus"), (12, "unopened_QQ_plus"), (14, "unopened_AA")):
        mask = data["unopened"] & (data["pair_rank"] >= minimum)
        result[name] = {
            "count": int(mask.sum()),
            "predicted_fold_count": int(np.sum(pred[mask] == ACTION_TO_ID["fold"])),
            "mean_fold_probability": float(probs[mask, ACTION_TO_ID["fold"]].mean()) if mask.any() else None,
        }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Train audited EURO6 Policy V3 imitation ensemble.")
    parser.add_argument("--data-dir", default=r"agent_runtime\policy_v3_decision_packet_v2")
    parser.add_argument("--out-dir", default=r"agent_runtime\policy_training_v3")
    parser.add_argument("--epochs", type=int, default=36)
    parser.add_argument("--batch", type=int, default=1024)
    parser.add_argument("--hidden1", type=int, default=192)
    parser.add_argument("--hidden2", type=int, default=96)
    parser.add_argument("--lr", type=float, default=0.0015)
    parser.add_argument("--seeds", default="7,17,29")
    parser.add_argument("--pokerstars-weight", type=float, default=0.35)
    parser.add_argument("--max-rows-per-split", type=int, default=0)
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    data_dir = (root / args.data_dir).resolve() if not Path(args.data_dir).is_absolute() else Path(args.data_dir).resolve()
    out_dir = (root / args.out_dir).resolve() if not Path(args.out_dir).is_absolute() else Path(args.out_dir).resolve()
    audit = json.loads((data_dir / "decision_packets_v2_audit.json").read_text(encoding="utf-8"))
    if not audit.get("audit_pass"):
        raise SystemExit("Decision Packet V2 audit did not pass; Policy V3 training is blocked.")
    out_dir.mkdir(parents=True, exist_ok=True)
    features = feature_spec()
    print(f"[FEATURES] {len(features)}", flush=True)
    datasets = {}
    for split in ("train", "validation", "test"):
        path = data_dir / f"decision_packets_v2_{split}.jsonl"
        print(f"[LOAD] {split}: {path}", flush=True)
        datasets[split] = load_split(path, features, args.max_rows_per_split)
        print(f"[ROWS] {split}={len(datasets[split]['y'])}", flush=True)

    train, val, test = datasets["train"], datasets["validation"], datasets["test"]
    mean = train["X"].mean(axis=0)
    std = train["X"].std(axis=0)
    std = np.where(std < 1e-6, 1.0, std)
    for data in datasets.values():
        data["X"] = ((data["X"] - mean) / std).astype(np.float32)
    source_weight = np.asarray([1.0, args.pokerstars_weight], dtype=np.float32)
    train_weights = source_weight[train["source"]]
    val_weights = source_weight[val["source"]]
    train_weights /= train_weights.mean()
    val_weights /= val_weights.mean()

    started = time.time()
    models = []
    histories = {}
    for seed in [int(value) for value in args.seeds.split(",") if value.strip()]:
        model, history = train_one(
            train["X"], train["y"], train["legal"], train_weights,
            val["X"], val["y"], val["legal"], val_weights,
            args.hidden1, args.hidden2, args.epochs, args.batch, args.lr, seed,
        )
        models.append(model)
        histories[str(seed)] = history

    val_logits = ensemble_logits(val["X"], models)
    temperatures = np.linspace(0.5, 3.0, 101)
    temperature = min(temperatures, key=lambda value: nll(masked_softmax(val_logits, val["legal"], float(value)), val["y"], val_weights))
    probabilities = {}
    for split, data in datasets.items():
        probabilities[split] = masked_softmax(ensemble_logits(data["X"], models), data["legal"], float(temperature))

    model_values: Dict[str, Any] = {
        "mean": mean.astype(np.float32),
        "std": std.astype(np.float32),
        "temperature": np.asarray(float(temperature), dtype=np.float32),
        "action_classes": np.asarray(ACTIONS),
    }
    for model_index, model in enumerate(models):
        for name, value in zip(("W1", "b1", "W2", "b2", "W3", "b3"), model):
            model_values[f"{name}_{model_index}"] = value.astype(np.float32)
    model_path = out_dir / "decision_policy_model_v3.npz"
    np.savez_compressed(model_path, **model_values)

    metadata = {
        "schema_version": "euro6_policy_v3_features_v1",
        "input_schema": "euro6_decision_packet_v2",
        "features": features,
        "actions": ACTIONS,
        "activation": "relu",
        "legal_action_masking": True,
        "ensemble_size": len(models),
        "pokerstars_training_weight": args.pokerstars_weight,
        "mode": "offline_review_only",
    }
    (out_dir / "decision_policy_model_v3_features.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    report = {
        "schema_version": "euro6_policy_v3_training_report_v1",
        "input_audit": str(data_dir / "decision_packets_v2_audit.json"),
        "elapsed_sec": round(time.time() - started, 3),
        "temperature": float(temperature),
        "split_counts": {split: int(len(data["y"])) for split, data in datasets.items()},
        "source_weights": {"pluribus_all_player": 1.0, "pokerstars_hero_only": args.pokerstars_weight},
        "history": histories,
        "metrics": {
            split: metric_block(data["y"], probabilities[split], data["source"], data["street"])
            for split, data in datasets.items()
        },
        "critical_sanity": {split: critical_sanity(data, probabilities[split]) for split, data in datasets.items()},
        "important": [
            "Policy V3 is imitation-only; it does not estimate EV or reward.",
            "Pluribus is the primary expert teacher; PokerStars population actions are down-weighted.",
            "Illegal actions are masked during both training and evaluation.",
            "Activation is ReLU in both training and inference.",
            "Model is not connected to live advisor or auto-click.",
        ],
    }
    report_path = out_dir / "decision_policy_model_v3_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "model": str(model_path),
        "report": str(report_path),
        "temperature": float(temperature),
        "test_accuracy": report["metrics"]["test"]["accuracy"],
        "test_nll": report["metrics"]["test"]["nll"],
        "test_sanity": report["critical_sanity"]["test"],
    }, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
