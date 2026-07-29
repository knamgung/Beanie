import { describe, it, expect } from "vitest";
import {
  Card,
  Rank,
  Suit,
  makeDeck,
  shuffle,
  beanieRankForRound,
  dealRound,
  validateHand,
  isValidHand,
  cardValue,
  handScore,
  scoreRound,
  applyBonus,
  gameWinners,
} from "../src/index.js";

// Compact card constructor: c("H", 7), c("D", 1) for Ace.
const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });

// Deterministic RNG for reproducible shuffles/deals.
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("beanie rank per round", () => {
  it("rotates Ace..King then wraps to Ace on round 14", () => {
    expect(beanieRankForRound(1)).toBe(1);
    expect(beanieRankForRound(2)).toBe(2);
    expect(beanieRankForRound(13)).toBe(13);
    expect(beanieRankForRound(14)).toBe(1);
  });
  it("rejects out-of-range rounds", () => {
    expect(() => beanieRankForRound(0)).toThrow();
    expect(() => beanieRankForRound(15)).toThrow();
  });
});

describe("dealing", () => {
  it("gives the starter 8 and everyone else 7", () => {
    const { hands, drawPile } = dealRound(4, 2, seededRng(1));
    expect(hands.map((h) => h.length)).toEqual([7, 7, 8, 7]);
    expect(drawPile.length).toBe(52 - (7 * 3 + 8)); // 52 - 29 = 23
  });
  it("deals 52 distinct cards total", () => {
    const { hands, drawPile } = dealRound(3, 0, seededRng(42));
    const all = [...hands.flat(), ...drawPile];
    expect(all.length).toBe(52);
    expect(new Set(all.map((x) => `${x.suit}${x.rank}`)).size).toBe(52);
  });
});

describe("shuffle", () => {
  it("preserves all 52 cards and does not mutate input", () => {
    const deck = makeDeck();
    const shuffled = shuffle(deck, seededRng(7));
    expect(shuffled.length).toBe(52);
    expect(new Set(shuffled.map((x) => `${x.suit}${x.rank}`)).size).toBe(52);
    expect(deck[0]).toEqual({ rank: 1, suit: "C" }); // input untouched
  });
});

describe("set validation", () => {
  it("accepts a natural three-of-a-kind", () => {
    const r = validateHand([c("H", 7), c("S", 7), c("D", 7)], 3);
    expect(r).toMatchObject({ valid: true, kind: "SET" });
  });
  it("accepts [8, 8, beanie] when beanie is 3", () => {
    const r = validateHand([c("H", 8), c("S", 8), c("D", 3)], 3);
    expect(r).toMatchObject({ valid: true, kind: "SET" });
  });
  it("accepts a four-of-a-kind", () => {
    expect(isValidHand([c("H", 9), c("S", 9), c("D", 9), c("C", 9)], 3)).toBe(
      true
    );
  });
  it("rejects a five-card same-rank pile", () => {
    // impossible with real cards, but the size rule must still hold via wilds
    const r = validateHand(
      [c("H", 9), c("S", 9), c("D", 9), c("C", 9), c("H", 3)],
      3
    );
    // 5 cards, naturals all rank 9 -> not a set (max 4); also not a flush.
    expect(r.valid).toBe(false);
  });
  it("rejects mixed ranks", () => {
    expect(isValidHand([c("H", 7), c("S", 8), c("D", 7)], 3)).toBe(false);
  });
  it("accepts an all-wild trio as a set", () => {
    expect(isValidHand([c("H", 3), c("S", 3), c("D", 3)], 3)).toBe(true);
  });
});

describe("straight flush validation", () => {
  it("accepts a plain same-suit run", () => {
    const r = validateHand([c("H", 6), c("H", 7), c("H", 8)], 3);
    expect(r).toMatchObject({ valid: true, kind: "FLUSH" });
  });
  it("accepts [6H,7H,beanie,9H] with beanie filling 8H", () => {
    const r = validateHand([c("H", 6), c("H", 7), c("D", 3), c("H", 9)], 3);
    expect(r).toMatchObject({ valid: true, kind: "FLUSH" });
  });
  it("accepts Ace-low A-2-3-4", () => {
    expect(
      isValidHand([c("S", 1), c("S", 2), c("S", 3), c("S", 4)], 7)
    ).toBe(true);
  });
  it("accepts Ace-high Q-K-A", () => {
    expect(isValidHand([c("S", 12), c("S", 13), c("S", 1)], 7)).toBe(true);
  });
  it("rejects mixed suits", () => {
    expect(isValidHand([c("H", 6), c("S", 7), c("H", 8)], 3)).toBe(false);
  });
  it("rejects a non-consecutive run", () => {
    expect(isValidHand([c("H", 6), c("H", 7), c("H", 10)], 3)).toBe(false);
  });
  it("accepts a 7-card straight flush (the one-turn-out shape)", () => {
    const run: Card[] = [2, 3, 4, 5, 6, 7, 8].map((r) => c("D", r as Rank));
    expect(isValidHand(run, 10)).toBe(true);
  });
  it("does not allow Ace to be both low and high in one run", () => {
    // K, A, 2 would require Ace = 14 and 1 simultaneously -> invalid.
    expect(isValidHand([c("H", 13), c("H", 1), c("H", 2)], 7)).toBe(false);
  });
});

describe("minimum size", () => {
  it("rejects fewer than 3 cards", () => {
    expect(isValidHand([c("H", 7), c("S", 7)], 3)).toBe(false);
  });
});

describe("card values", () => {
  it("scores beanie 50, faces 10, ace 1, pips at value", () => {
    expect(cardValue(c("H", 3), 3)).toBe(50); // beanie rank
    expect(cardValue(c("H", 13), 3)).toBe(10); // King
    expect(cardValue(c("H", 11), 3)).toBe(10); // Jack
    expect(cardValue(c("H", 1), 3)).toBe(1); // Ace
    expect(cardValue(c("H", 7), 3)).toBe(7); // pip
  });
  it("beanie overrides face value when the beanie is a face card", () => {
    expect(cardValue(c("H", 11), 11)).toBe(50); // Jack is beanie this round
  });
  it("sums a hand", () => {
    expect(handScore([c("H", 7), c("S", 13), c("D", 3)], 3)).toBe(7 + 10 + 50);
  });
});

describe("round scoring and bonus", () => {
  it("winner scores 0, others score their hand", () => {
    const hands = [[c("H", 7)], [], [c("S", 13), c("D", 3)]];
    expect(scoreRound(hands, 1, 3)).toEqual([7, 0, 60]);
  });
  it("double doubles every opponent's cumulative total", () => {
    expect(applyBonus([10, 20, 30], 0, "double")).toEqual([10, 40, 60]);
  });
  it("halve halves the winner's own total, rounding down", () => {
    expect(applyBonus([25, 20, 30], 0, "halve")).toEqual([12, 20, 30]);
  });
  it("lowest cumulative total wins", () => {
    expect(gameWinners([40, 12, 30])).toEqual([1]);
    expect(gameWinners([12, 12, 30])).toEqual([0, 1]);
  });
});
