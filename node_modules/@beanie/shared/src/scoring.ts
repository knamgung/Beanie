// Scoring: per-card values, round scoring, and the one-turn-out / round-14 bonus.

import { Card, Rank } from "./cards.js";

/**
 * Point value of a single card left in hand at round end.
 *   - Any card of the beanie rank: 50
 *   - Face cards J/Q/K: 10
 *   - Ace: 1, number cards: their pip value
 */
export function cardValue(card: Card, beanieRank: Rank): number {
  if (card.rank === beanieRank) return 50;
  if (card.rank >= 11) return 10; // J, Q, K
  return card.rank; // Ace = 1, 2..10 = pip
}

/** Sum of point values for the cards left in a hand. */
export function handScore(cards: Card[], beanieRank: Rank): number {
  return cards.reduce((sum, c) => sum + cardValue(c, beanieRank), 0);
}

/**
 * Points scored by each seat this round. The winner scores 0; everyone else
 * scores the total value of the cards left in their hand.
 */
export function scoreRound(
  hands: Card[][],
  winnerSeat: number,
  beanieRank: Rank
): number[] {
  return hands.map((hand, seat) =>
    seat === winnerSeat ? 0 : handScore(hand, beanieRank)
  );
}

export type BonusChoice = "double" | "halve";

/**
 * The one-turn-out (7-card straight flush) and round-14 bonus. Applied to
 * cumulative totals AFTER this round's points have been added.
 *   - "double": double every opponent's cumulative score.
 *   - "halve":  halve the winner's own cumulative score (rounded down).
 * Returns a new array; does not mutate the input.
 */
export function applyBonus(
  cumulative: number[],
  winnerSeat: number,
  choice: BonusChoice
): number[] {
  return cumulative.map((score, seat) => {
    if (choice === "double") {
      return seat === winnerSeat ? score : score * 2;
    }
    // "halve"
    return seat === winnerSeat ? Math.floor(score / 2) : score;
  });
}

/** Lowest cumulative total wins. Returns all seats tied for lowest. */
export function gameWinners(cumulative: number[]): number[] {
  const min = Math.min(...cumulative);
  return cumulative
    .map((score, seat) => ({ score, seat }))
    .filter((x) => x.score === min)
    .map((x) => x.seat);
}
