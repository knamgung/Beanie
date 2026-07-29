import { describe, it, expect } from "vitest";
import { Card, Rank, Suit, tryInsert, tryReclaim } from "../src/index.js";

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });

describe("inserting to extend a straight flush", () => {
  const hand = [c("D", 4), c("D", 5), c("D", 6)];

  it("extends on the low end", () => {
    // Beanie rank 10 keeps 3-6 natural for this test.
    const r = tryInsert(hand, c("D", 3), 10);
    expect(r.ok).toBe(true);
    expect(r.newFieldCards).toHaveLength(4);
    expect(r.kind).toBe("FLUSH");
  });

  it("extends on the high end", () => {
    const r = tryInsert(hand, c("D", 7), 10);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("FLUSH");
  });

  it("rejects a wrong-suit card", () => {
    expect(tryInsert(hand, c("H", 7), 10).ok).toBe(false);
  });

  it("rejects a non-adjacent card", () => {
    expect(tryInsert(hand, c("D", 9), 10).ok).toBe(false);
  });

  it("rejects a duplicate rank", () => {
    expect(tryInsert(hand, c("D", 5), 10).ok).toBe(false);
  });
});

describe("inserting to grow a set", () => {
  it("grows a three-of-a-kind into a four-of-a-kind", () => {
    const r = tryInsert([c("H", 7), c("S", 7), c("D", 7)], c("C", 7), 10);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("SET");
    expect(r.newFieldCards).toHaveLength(4);
  });

  it("can grow a set with a beanie", () => {
    // beanie rank 3; [7,7,7] + beanie(3) -> four-of-a-kind
    const r = tryInsert([c("H", 7), c("S", 7), c("D", 7)], c("H", 3), 3);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("SET");
  });

  it("cannot exceed four of a kind", () => {
    const four = [c("H", 7), c("S", 7), c("D", 7), c("C", 7)];
    expect(tryInsert(four, c("H", 3), 3).ok).toBe(false);
  });
});

describe("beanie reclaim — straight flush", () => {
  it("swaps a real 3♦ in for the beanie Ace, per the user example", () => {
    // Beanie is Ace(1). Played hand [Ace(wild)=3♦ slot, 4♦, 5♦, 6♦].
    const hand = [c("H", 1), c("D", 4), c("D", 5), c("D", 6)]; // Ace suit irrelevant
    const r = tryReclaim(hand, c("D", 3), 1);
    expect(r.ok).toBe(true);
    expect(r.returnedBeanie).toEqual(c("H", 1));
    expect(r.newFieldCards).toHaveLength(4);
    // The reclaimed hand is now fully natural 3-4-5-6 of diamonds.
    const ranks = r.newFieldCards!.map((x) => x.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([3, 4, 5, 6]);
  });

  it("rejects a card that fits no beanie slot", () => {
    const hand = [c("H", 1), c("D", 4), c("D", 5), c("D", 6)];
    expect(tryReclaim(hand, c("D", 9), 1).ok).toBe(false); // 9 is not adjacent
  });

  it("rejects a wrong-suit reclaim", () => {
    const hand = [c("H", 1), c("D", 4), c("D", 5), c("D", 6)];
    expect(tryReclaim(hand, c("H", 3), 1).ok).toBe(false);
  });
});

describe("beanie reclaim — sets (the [3,3,Ace] rule)", () => {
  // Beanie is Ace(1) this round.
  it("CANNOT reclaim the Ace from a three-of-a-kind [3,3,Ace]", () => {
    const hand = [c("H", 3), c("S", 3), c("D", 1)]; // D-Ace is the wild
    const r = tryReclaim(hand, c("C", 3), 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/three-of-a-kind/i);
  });

  it("CAN first grow [3,3,Ace] into [3,3,3,Ace] by inserting a 3", () => {
    const hand = [c("H", 3), c("S", 3), c("D", 1)];
    const grown = tryInsert(hand, c("C", 3), 1);
    expect(grown.ok).toBe(true);
    expect(grown.newFieldCards).toHaveLength(4);
  });

  it("THEN can reclaim the Ace by inserting the last 3, leaving [3,3,3,3]", () => {
    // Post-growth four-of-a-kind with the wild Ace still in it; the provided 3
    // is the one not yet on the field.
    const four = [c("H", 3), c("S", 3), c("C", 3), c("D", 1)];
    const r = tryReclaim(four, c("D", 3), 1);
    expect(r.ok).toBe(true);
    expect(r.returnedBeanie).toEqual(c("D", 1));
    expect(r.newFieldCards!.every((x) => x.rank === 3)).toBe(true);
  });

  it("must provide a natural card, not another beanie", () => {
    const four = [c("H", 3), c("S", 3), c("C", 3), c("D", 1)];
    expect(tryReclaim(four, c("H", 1), 1).ok).toBe(false); // Ace is a beanie
  });
});
