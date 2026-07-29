import { describe, it, expect } from "vitest";
import { Card, Rank, Suit, orderPlayedHand } from "../src/index.js";

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });
const ids = (cards: Card[]) => cards.map((x) => `${x.suit}${x.rank}`).join(" ");

describe("orderPlayedHand — straight flush", () => {
  it("sorts a run played out of order into ascending order", () => {
    // played as 6,4,5,7 of hearts -> should display 4,5,6,7
    const out = orderPlayedHand(
      [c("H", 6), c("H", 4), c("H", 7), c("H", 5)],
      10
    );
    expect(out.map((x) => x.rank)).toEqual([4, 5, 6, 7]);
  });

  it("places an internal beanie in its gap (6,7,_,9 -> 6,7,🫘,9)", () => {
    // beanie rank 3; the 3♦ fills the 8 slot between 7 and 9
    const out = orderPlayedHand(
      [c("H", 9), c("H", 6), c("D", 3), c("H", 7)],
      3
    );
    expect(out.map((x) => x.rank)).toEqual([6, 7, 3 /* beanie */, 9]);
  });

  it("keeps Ace high in Q-K-A", () => {
    const out = orderPlayedHand([c("S", 1), c("S", 13), c("S", 12)], 7);
    expect(out.map((x) => x.rank)).toEqual([12, 13, 1]);
  });

  it("keeps Ace low in A-2-3-4", () => {
    const out = orderPlayedHand([c("S", 4), c("S", 1), c("S", 3), c("S", 2)], 7);
    expect(out.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });

  it("trails extra end-beanies after the naturals", () => {
    // 4,5 of diamonds + two beanies (rank 10) -> 4,5,🫘,🫘
    const out = orderPlayedHand(
      [c("D", 10), c("D", 5), c("D", 10), c("D", 4)],
      10
    );
    expect(out.map((x) => x.rank)).toEqual([4, 5, 10, 10]);
  });
});

describe("orderPlayedHand — set", () => {
  it("puts naturals before beanies", () => {
    // [8,8,beanie(3)] -> naturals then beanie
    const out = orderPlayedHand([c("D", 3), c("H", 8), c("S", 8)], 3);
    expect(out.map((x) => x.rank)).toEqual([8, 8, 3]);
  });
});

describe("orderPlayedHand — invalid input", () => {
  it("returns the cards unchanged", () => {
    const input = [c("H", 2), c("S", 9)];
    expect(ids(orderPlayedHand(input, 5))).toBe(ids(input));
  });
});
