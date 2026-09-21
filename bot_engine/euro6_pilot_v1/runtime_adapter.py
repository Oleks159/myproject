from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Mapping, Tuple


STREETS = ("preflop", "flop", "turn", "river")
POSITIONS = ("UTG", "HJ", "CO", "BTN", "SB", "BB")
POSITION_ID_FALLBACK = {index: position for index, position in enumerate(POSITIONS)}
RANK_VALUE = {rank: index + 2 for index, rank in enumerate("23456789TJQKA")}


class StateValidationError(ValueError):
    pass


def _number(value: Any, name: str, *, minimum: float | None = None) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise StateValidationError(f"{name} must be numeric") from exc
    if not math.isfinite(result):
        raise StateValidationError(f"{name} must be finite")
    if minimum is not None and result < minimum:
        raise StateValidationError(f"{name} must be >= {minimum}")
    return result


def _card(value: Any, name: str) -> str:
    text = str(value).strip()
    if len(text) != 2 or text[0].upper() not in RANK_VALUE or text[1].lower() not in "cdhs":
        raise StateValidationError(f"{name} has invalid card {value!r}")
    return text[0].upper() + text[1].lower()


def _cards(values: Iterable[Any], name: str, expected: int | None = None) -> List[str]:
    result = [_card(value, name) for value in values]
    if expected is not None and len(result) != expected:
        raise StateValidationError(f"{name} must contain {expected} cards")
    if len(set(result)) != len(result):
        raise StateValidationError(f"{name} contains duplicate cards")
    return result


def _position(payload: Mapping[str, Any], hero: Mapping[str, Any], warnings: List[str]) -> str:
    candidates = (hero.get("position_name"), hero.get("position"), payload.get("position_name"))
    for value in candidates:
        if isinstance(value, str) and value.upper() in POSITIONS:
            return value.upper()
    raw_id = hero.get("position_id", payload.get("position_id", payload.get("position")))
    try:
        position_id = int(raw_id)
    except (TypeError, ValueError):
        position_id = -1
    if position_id in POSITION_ID_FALLBACK:
        warnings.append(
            "position_name missing; temporary fallback mapping 0=UTG,1=HJ,2=CO,3=BTN,4=SB,5=BB was used"
        )
        return POSITION_ID_FALLBACK[position_id]
    raise StateValidationError("position_name (UTG/HJ/CO/BTN/SB/BB) is required")


def _canonical_action(value: Any, *, to_call: float, legal: bool = False) -> str:
    action = str(value).strip().lower()
    aliases = {
        "f": "fold",
        "x": "check",
        "check/call": "call" if to_call > 0 else "check",
        "c": "call" if to_call > 0 else "check",
        "r": "raise",
        "b": "bet",
        "all-in": "raise" if to_call > 0 else "bet",
        "all_in": "raise" if to_call > 0 else "bet",
    }
    action = aliases.get(action, action)
    if action not in {"fold", "check", "call", "bet", "raise"}:
        raise StateValidationError(f"unknown action {value!r}")
    return action


def _action_sequence(payload: Mapping[str, Any], bb: float, street: str, to_call: float) -> Dict[str, List[Dict[str, Any]]]:
    sequence = {name: [] for name in STREETS}
    raw_rows = payload.get("action_history", payload.get("actions", [])) or []
    if not isinstance(raw_rows, list):
        raise StateValidationError("action_history must be an array")
    for row in raw_rows:
        if not isinstance(row, Mapping):
            raise StateValidationError("history entries must be objects")
        row_street = str(row.get("phase", row.get("street", street))).lower()
        if row_street not in sequence:
            raise StateValidationError("invalid history street")
        if STREETS.index(row_street) > STREETS.index(street):
            raise StateValidationError("history contains future actions")
        raw_action = str(row.get("action", "")).lower()
        action = raw_action if raw_action in {"small_blind", "big_blind"} else _canonical_action(raw_action, to_call=to_call)
        amount_to = _number(row.get("to_total", row.get("amount", 0)), "action amount", minimum=0) / bb
        amount_added = _number(row.get("amount_added", 0), "action amount_added", minimum=0) / bb
        aggressive_increment = _number(
            row.get("aggressive_increment", row.get("raise_increment", 0)),
            "action aggressive_increment",
            minimum=0,
        ) / bb
        pot_before = _number(row.get("pot_before", 0), "action pot_before", minimum=0) / bb
        sequence[row_street].append(
            {
                "actor_id": str(row.get("actor_id", row.get("seat", "unknown"))),
                "position": row.get("position_name", row.get("position")),
                "action": action,
                "amount_added_bb": amount_added,
                "to_total_bb": amount_to,
                "aggressive_increment_bb": aggressive_increment,
                "pot_before_bb": pot_before,
            }
        )
    return sequence


def adapt_runtime_state(payload: Mapping[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    warnings: List[str] = []
    if not isinstance(payload, Mapping):
        raise StateValidationError("state must be an object")
    if payload.get("schema_version") not in ("1.0", "1.1", "euro6_runtime_state_v1"):
        raise StateValidationError("unsupported schema_version")
    street = str(payload.get("street", payload.get("phase", ""))).lower()
    if street not in STREETS:
        raise StateValidationError("street/phase must be preflop, flop, turn, or river")

    bb = _number(payload.get("big_blind"), "big_blind", minimum=1e-9)
    sb = _number(payload.get("small_blind", bb / 2), "small_blind", minimum=0)
    hero_raw = payload.get("hero") if isinstance(payload.get("hero"), Mapping) else {}
    hero_cards = _cards(payload.get("hole_cards", payload.get("hero_cards", [])), "hole_cards", expected=2)
    board_cards = _cards(payload.get("board", payload.get("board_cards", [])), "board")
    expected_board = {"preflop": 0, "flop": 3, "turn": 4, "river": 5}[street]
    if len(board_cards) != expected_board:
        raise StateValidationError(f"{street} requires {expected_board} board cards")
    if set(hero_cards).intersection(board_cards):
        raise StateValidationError("hole_cards and board contain the same card")

    hero_stack_chips = _number(hero_raw.get("stack"), "hero.stack", minimum=0)
    if hero_stack_chips == 0:
        raise StateValidationError("all-in player cannot take another action")
    hero_invested_chips = _number(hero_raw.get("current_bet", 0), "hero.current_bet", minimum=0)
    pot_chips = _number(payload.get("pot"), "pot", minimum=0)
    table_bet_chips = _number(payload.get("current_bet", 0), "current_bet", minimum=0)
    nominal_call = max(0.0, table_bet_chips - hero_invested_chips)
    supplied_call = _number(payload.get("to_call", nominal_call), "to_call", minimum=0)
    if not (math.isclose(supplied_call, nominal_call, abs_tol=1e-7) or math.isclose(supplied_call, min(nominal_call, hero_stack_chips), abs_tol=1e-7)):
        raise StateValidationError("to_call conflicts with current_bet and hero.current_bet")
    to_call_chips = min(nominal_call, hero_stack_chips)

    opponents = [row for row in (payload.get("opponents") or []) if isinstance(row, Mapping) and not row.get("folded")]
    opponent_stacks = [_number(row.get("stack", 0), "opponent.stack", minimum=0) for row in opponents]
    effective_candidates = [min(hero_stack_chips, stack) for stack in opponent_stacks]
    effective_stack_chips = max(effective_candidates, default=hero_stack_chips)
    shortest_effective_chips = min(effective_candidates, default=hero_stack_chips)

    position = _position(payload, hero_raw, warnings)
    legal_raw = payload.get("legal_actions") or []
    if not isinstance(legal_raw, list) or not legal_raw:
        raise StateValidationError("legal_actions must be a non-empty array")
    legal_actions: List[str] = []
    for value in legal_raw:
        action = _canonical_action(value, to_call=to_call_chips, legal=True)
        if action not in legal_actions:
            legal_actions.append(action)
    if to_call_chips > 0 and "check" in legal_actions:
        raise StateValidationError("check cannot be legal when to_call > 0")
    if to_call_chips <= 0 and "fold" in legal_actions:
        warnings.append("fold is legal while to_call is zero; verify the upstream game state")
    if to_call_chips <= 0 and "call" in legal_actions:
        raise StateValidationError("call cannot be legal when to_call is zero")
    if ("bet" in legal_actions and table_bet_chips > 0) or ("raise" in legal_actions and table_bet_chips == 0):
        raise StateValidationError("bet/raise conflicts with current_bet")

    action_sequence = _action_sequence(payload, bb, street, to_call_chips)
    if not payload.get("history_complete", False):
        warnings.append("history completeness unconfirmed; missing action context reduces reliability")
    current_rows = action_sequence[street]
    raises = [row for row in current_rows if row["action"] == "raise"]
    bets = [row for row in current_rows if row["action"] == "bet"]
    last_aggressive = next(
        (row for row in reversed(current_rows) if row["action"] in {"bet", "raise"}),
        None,
    )

    rank_values = sorted((RANK_VALUE[card[0]] for card in hero_cards), reverse=True)
    pocket_pair = rank_values[0] == rank_values[1]
    suited = hero_cards[0][1] == hero_cards[1][1]
    gap = max(0, rank_values[0] - rank_values[1] - 1)
    broadway_count = sum(rank >= 10 for rank in rank_values)

    pot_bb = pot_chips / bb
    stack_bb = hero_stack_chips / bb
    effective_stack_bb = effective_stack_chips / bb
    shortest_effective_stack_bb = shortest_effective_chips / bb
    to_call_bb = to_call_chips / bb
    current_bet_bb = table_bet_chips / bb
    invested_bb = hero_invested_chips / bb
    call_denominator = pot_chips + to_call_chips
    pot_odds = to_call_chips / call_denominator if call_denominator > 0 else 0.0

    active_players = int(payload.get("active_players", payload.get("players_active", len(opponents) + 1)))
    if not 2 <= active_players <= 6:
        raise StateValidationError("active_players must be between 2 and 6")
    players_all_in = sum(bool(row.get("all_in")) for row in opponents)
    hero_all_in = hero_stack_chips <= 0
    if hero_all_in:
        players_all_in += 1

    packet = {
        "schema_version": "euro6_decision_packet_v2",
        "source": {
            "dataset": "runtime_state",
            "teacher_type": "none_inference_only",
            "source_schema": str(payload.get("schema_version", "1.0")),
            "source_row_index": 1,
        },
        "split": "inference",
        "hand_id": str(payload.get("hand_id", payload.get("request_id", "runtime-hand"))),
        "decision_id": str(payload.get("decision_id", payload.get("request_id", "runtime-decision"))),
        "street": street,
        "street_id": STREETS.index(street),
        "decision_index_in_hand": int(payload.get("decision_index_in_hand", len(sum(action_sequence.values(), [])))),
        "decision_index_on_street": int(payload.get("decision_index_on_street", len(current_rows))),
        "betting_cycle_index": int(payload.get("betting_cycle_index", len(raises) + len(bets))),
        "hero": {
            "seat": str(hero_raw.get("seat", "0")),
            "position": position,
            "cards": hero_cards,
            "rank_high": rank_values[0],
            "rank_low": rank_values[1],
            "pocket_pair": pocket_pair,
            "pocket_pair_rank": rank_values[0] if pocket_pair else None,
            "premium_pair": bool(pocket_pair and rank_values[0] >= 12),
            "suited": suited,
            "connected": rank_values[0] - rank_values[1] == 1,
            "gap": gap,
            "broadway_count": broadway_count,
            "ace_high": rank_values[0] == 14,
            "stack_bb": stack_bb,
            "effective_stack_bb": effective_stack_bb,
            "shortest_active_effective_stack_bb": shortest_effective_stack_bb,
            "invested_this_street_bb": invested_bb,
            "to_call_bb": to_call_bb,
            "nominal_to_call_bb": nominal_call / bb,
            "legal_actions": legal_actions,
        },
        "board": {"cards": board_cards, "count": len(board_cards)},
        "table": {
            "small_blind_bb": sb / bb,
            "big_blind_bb": 1.0,
            "pot_bb": pot_bb,
            "current_bet_bb": current_bet_bb,
            "players_in_hand_count": active_players,
            "players_all_in_count": players_all_in,
            "last_aggressor_position": last_aggressive.get("position") if last_aggressive else None,
            "table_size": int((payload.get("game") or {}).get("table_size", 6)) if isinstance(payload.get("game"), Mapping) else 6,
        },
        "pressure": {
            "facing_wager": to_call_chips > 0,
            "facing_bet": to_call_chips > 0 and not bool(raises),
            "facing_raise": to_call_chips > 0 and bool(raises),
            "hero_has_acted_this_street": any(
                row["actor_id"] in {str(hero_raw.get("seat")), str(hero_raw.get("actor_id")), "hero"}
                and row["action"] in {"call", "bet", "raise"} for row in current_rows
            ),
            "call_is_all_in": nominal_call > hero_stack_chips + 0.05 * bb,
        },
        "ratios": {
            "pot_odds": pot_odds,
            "spr": stack_bb / pot_bb if pot_bb > 0 else None,
            "stack_to_pot": stack_bb / pot_bb if pot_bb > 0 else None,
            "effective_stack_to_pot": effective_stack_bb / pot_bb if pot_bb > 0 else None,
            "shortest_effective_stack_to_pot": shortest_effective_stack_bb / pot_bb if pot_bb > 0 else None,
            "to_call_to_pot": to_call_bb / pot_bb if pot_bb > 0 else 0.0,
            "to_call_to_stack": to_call_bb / stack_bb if stack_bb > 0 else None,
        },
        "action_sequence": action_sequence,
        "quality": {
            "training_eligible": False,
            "inference_eligible": True,
            "errors": [],
            "warnings": warnings,
            "missing_optional_fields": [],
        },
    }
    return packet, warnings
