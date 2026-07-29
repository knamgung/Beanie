// Small display helpers (client-side only; the server is the rules authority).

export function rankChar(rank: number): string {
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

export const SUIT_SYMBOL: Record<string, string> = {
  C: "♣",
  D: "♦",
  H: "♥",
  S: "♠",
};

export function isRed(suit: string): boolean {
  return suit === "H" || suit === "D";
}

export function isBeanieCard(rank: number, beanieRank: number): boolean {
  return rank === beanieRank;
}

/** The wild (Beanie) rank for a round: R1=A, R2=2, … R13=K, R14=A. */
export function beanieRankForRound(round: number): number {
  return ((round - 1) % 13) + 1;
}

export const TOTAL_ROUNDS = 14;
