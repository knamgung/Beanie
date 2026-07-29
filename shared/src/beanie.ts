// Beanie (wild card) logic and per-round dealing.

import { Card, Rank, Rng, makeDeck, shuffle } from "./cards.js";

/**
 * The wild rank for a given round. There are 14 rounds:
 *   round 1  -> Ace (1)
 *   round 2  -> 2
 *   ...
 *   round 13 -> King (13)
 *   round 14 -> Ace (1)  (pattern wraps)
 */
export function beanieRankForRound(round: number): Rank {
  if (round < 1 || round > 14) {
    throw new RangeError(`round must be 1..14, got ${round}`);
  }
  return (((round - 1) % 13) + 1) as Rank;
}

/** True if this card is the wild rank for the round. Suit is irrelevant. */
export function isBeanie(card: Card, beanieRank: Rank): boolean {
  return card.rank === beanieRank;
}

export interface DealResult {
  /** hands[seat] = that seat's dealt cards. Starter gets 8, everyone else 7. */
  hands: Card[][];
  /** Remaining face-down draw pile (top of pile is the last element). */
  drawPile: Card[];
}

/**
 * Deal a round. A fresh 52-card deck is shuffled every round.
 * The starting seat receives 8 cards; all others receive 7.
 * The discard pile starts empty — the starter's first action is to discard.
 */
export function dealRound(
  playerCount: number,
  starterSeat: number,
  rng: Rng
): DealResult {
  if (playerCount < 2 || playerCount > 4) {
    throw new RangeError(`playerCount must be 2..4, got ${playerCount}`);
  }
  if (starterSeat < 0 || starterSeat >= playerCount) {
    throw new RangeError(`starterSeat out of range: ${starterSeat}`);
  }

  const deck = shuffle(makeDeck(), rng);
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);

  let cursor = 0;
  for (let seat = 0; seat < playerCount; seat++) {
    const count = seat === starterSeat ? 8 : 7;
    hands[seat] = deck.slice(cursor, cursor + count);
    cursor += count;
  }

  const drawPile = deck.slice(cursor);
  return { hands, drawPile };
}
