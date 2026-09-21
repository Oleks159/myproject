"""Six-seat NLHE cash hands. PokerKit is the rule authority; observations are private.

Engine positions: 0=SB, 1=BB, 2=UTG, 3=HJ, 4=CO, 5=BTN.
Physical seats are rotated around button_seat. One runout, integer chips, no rake.
All chance outcomes use an explicit per-hand deck seed, never a policy RNG.
"""
from __future__ import annotations

import copy
from collections import deque
from pathlib import Path
import random
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))
from pokerkit import Automation, Card, NoLimitTexasHoldem, Mode

from runtime_adapter import adapt_runtime_state, STREETS

POSITIONS = ("SB", "BB", "UTG", "HJ", "CO", "BTN")
AUTOMATIONS = (
    Automation.ANTE_POSTING, Automation.BET_COLLECTION,
    Automation.BLIND_OR_STRADDLE_POSTING, Automation.RUNOUT_COUNT_SELECTION,
    Automation.HOLE_CARDS_SHOWING_OR_MUCKING, Automation.HAND_KILLING,
    Automation.CHIPS_PUSHING, Automation.CHIPS_PULLING,
)


class PokerEnv:
    def __init__(self, seed=1, button_seat=5, starting_stacks=None, deck=None, big_blind=100):
        if type(big_blind) is not int or big_blind < 2 or big_blind % 2:
            raise ValueError('big_blind must be a positive even integer')
        self.bb = big_blind
        self.button = int(button_seat)
        if self.button not in range(6):
            raise ValueError("button_seat must be 0..5")
        self.starting_stacks = list(starting_stacks or [self.bb * 100] * 6)
        if len(self.starting_stacks) != 6 or any(type(n) is not int or n <= 0 for n in self.starting_stacks):
            raise ValueError("six positive integer starting stacks required")
        self.seats = [(self.button + 1 + i) % 6 for i in range(6)]
        self.state = NoLimitTexasHoldem.create_state(
            AUTOMATIONS, True, 0, (self.bb // 2, self.bb, 0, 0, 0, 0), self.bb,
            tuple(self.starting_stacks[s] for s in self.seats), 6, mode=Mode.CASH_GAME,
        )
        cards = list(Card.parse("".join(r + s for r in "23456789TJQKA" for s in "cdhs")))
        if deck is None:
            random.Random(seed).shuffle(cards)
        else:
            cards = list(Card.parse("".join(deck)))
            if len(cards) != 52 or len(set(cards)) != 52 or any(not card for card in cards):
                raise ValueError("deck must be a permutation of 52 known cards")
        self.state.deck_cards = deque(cards)
        self.seed = seed
        self.history = []
        self.folded = set()
        self.hole_cards = [[] for _ in range(6)]
        self.decision_count = 0
        self.street_decisions = [0] * 4
        self.aggressions = [0] * 4
        for index, amount, name, pot_before in ((0, self.bb // 2, "small_blind", 0), (1, self.bb, "big_blind", min(self.bb // 2, self.starting_stacks[self.seats[0]]))):
            paid = min(amount, self.starting_stacks[self.seats[index]])
            self.history.append(self._event(index, name, "preflop", paid, paid, 0, pot_before))
        self._advance_chance()
        self.assert_accounting()

    def _event(self, index, action, street, added, to_total, increment, pot_before):
        return dict(actor_id=f"seat_{self.seats[index]}", seat=self.seats[index],
                    position_name=POSITIONS[index], action=action, phase=street,
                    amount_added=added, to_total=to_total,
                    aggressive_increment=increment, pot_before=pot_before)

    def _advance_chance(self):
        # Only deterministic deck-consuming operations; payoff operations are automated.
        for _ in range(100):
            if not self.state.status or self.state.actor_index is not None:
                return
            if self.state.can_deal_hole():
                op = self.state.deal_hole()
                self.hole_cards[op.player_index].extend(map(repr, op.cards))
            elif self.state.can_burn_card():
                self.state.burn_card()
            elif self.state.can_deal_board():
                self.state.deal_board()
            else:
                raise RuntimeError("unhandled non-betting engine state")
        raise RuntimeError("chance loop limit exceeded")

    @property
    def done(self):
        return not self.state.status

    @property
    def actor_seat(self):
        i = self.state.actor_index
        return None if i is None else self.seats[i]

    @property
    def board(self):
        return list(map(repr, self.state.get_board_cards(0)))

    def observation(self):
        if self.done:
            raise ValueError("hand is finished")
        s = self.state
        i = s.actor_index
        street_id = s.street_index
        nominal = max(s.bets) - s.bets[i]
        legal = []
        if nominal > 0 and s.can_fold():
            legal.append("fold")
        if s.can_check_or_call():
            legal.append("call" if nominal > 0 else "check")
        can_raise = s.can_complete_bet_or_raise_to()
        if can_raise:
            legal.append("raise" if max(s.bets) > 0 else "bet")
        opponents = []
        for j in range(6):
            if j == i:
                continue
            opponents.append(dict(seat=self.seats[j], actor_id=f"seat_{self.seats[j]}",
                                  position_name=POSITIONS[j], stack=s.stacks[j],
                                  current_bet=s.bets[j], folded=j in self.folded,
                                  all_in=s.stacks[j] == 0 and j not in self.folded))
        return dict(
            schema_version="1.1", hand_id=f"sim-{self.seed}-{self.button}",
            decision_id=f"sim-{self.seed}-{self.button}-{self.decision_count+1}",
            game=dict(variant="NLHE", format="cash", table_size=6, rake_percent=0),
            street=STREETS[street_id], players_total=6, active_players=6-len(self.folded),
            button_seat=self.button, position_name=POSITIONS[i],
            hero=dict(seat=self.seats[i], actor_id=f"seat_{self.seats[i]}",
                      stack=s.stacks[i], current_bet=s.bets[i]),
            opponents=opponents, hole_cards=list(self.hole_cards[i]), board=self.board,
            pot=s.total_pot_amount, current_bet=max(s.bets), to_call=min(nominal, s.stacks[i]),
            small_blind=self.bb // 2, big_blind=self.bb, legal_actions=legal,
            min_raise_to=s.min_completion_betting_or_raising_to_amount if can_raise else None,
            max_raise_to=s.max_completion_betting_or_raising_to_amount if can_raise else None,
            chip_unit=1, history_complete=True, action_history=copy.deepcopy(self.history),
            decision_index_in_hand=self.decision_count+1,
            decision_index_on_street=self.street_decisions[street_id]+1,
            betting_cycle_index=self.aggressions[street_id],
        )

    def packet(self):
        return adapt_runtime_state(self.observation())[0]

    def step(self, action, to_total=None):
        observation = self.observation()
        if action not in observation["legal_actions"]:
            raise ValueError(f"illegal action {action!r}: {observation['legal_actions']}")
        s = self.state
        i = s.actor_index
        street_id = s.street_index
        invested = s.bets[i]
        current = max(s.bets)
        if action in ("bet", "raise"):
            if type(to_total) is not int or not s.can_complete_bet_or_raise_to(to_total):
                raise ValueError(f"illegal raise-to amount {to_total!r}")
            paid = to_total - invested
            increment = to_total - current
            s.complete_bet_or_raise_to(to_total)
            self.aggressions[street_id] += 1
        elif action == "fold":
            paid, increment, to_total = 0, 0, invested
            s.fold()
            self.folded.add(i)
        else:
            paid = s.checking_or_calling_amount
            increment, to_total = 0, invested + paid
            s.check_or_call()
        event = self._event(i, action, STREETS[street_id], paid, to_total, increment, observation["pot"])
        self.history.append(event)
        self.decision_count += 1
        self.street_decisions[street_id] += 1
        if self.decision_count > 2000:
            raise RuntimeError("hand decision safety limit exceeded")
        self._advance_chance()
        self.assert_accounting()
        return self.result() if self.done else None

    def assert_accounting(self):
        assert all(type(n) is int and n >= 0 for n in self.state.stacks)
        assert sum(self.state.stacks) + self.state.total_pot_amount == sum(self.starting_stacks), "chip conservation failed"
        if self.done:
            assert sum(self.state.payoffs) == 0

    def result(self):
        if not self.done:
            raise ValueError("hand still running")
        payoffs = [0] * 6
        for i, seat in enumerate(self.seats):
            payoffs[seat] = self.state.stacks[i] - self.starting_stacks[seat]
        return dict(seed=self.seed, button_seat=self.button, board=self.board,
                    payoffs_chips=payoffs, payoffs_bb=[p / self.bb for p in payoffs],
                    decisions=self.decision_count, history=copy.deepcopy(self.history))
