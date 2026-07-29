// Core card model for Beanie. Pure, no framework dependencies.

/** 1 = Ace, 2..10 = pip, 11 = Jack, 12 = Queen, 13 = King. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/** Clubs, Diamonds, Hearts, Spades. */
export type Suit = "C" | "D" | "H" | "S";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUITS: Suit[] = ["C", "D", "H", "S"];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/** Stable string id for a card, e.g. "H7", "SA", "DK". Unique within one deck. */
export function cardId(card: Card): string {
  return `${card.suit}${rankChar(card.rank)}`;
}

export function rankChar(rank: Rank): string {
  switch (rank) {
    case 1:
      return "A";
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    default:
      return String(rank);
  }
}

/** Human-readable label, e.g. "7 of Hearts". */
export function cardLabel(card: Card): string {
  const suitNames: Record<Suit, string> = {
    C: "Clubs",
    D: "Diamonds",
    H: "Hearts",
    S: "Spades",
  };
  return `${rankChar(card.rank)} of ${suitNames[card.suit]}`;
}

/** A fresh, ordered 52-card deck (no jokers). */
export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** A random-number source in [0, 1). Injected so tests can be deterministic. */
export type Rng = () => number;

/** Fisher-Yates shuffle. Returns a new array; does not mutate the input. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
