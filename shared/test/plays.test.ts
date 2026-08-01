import { describe, it, expect } from "vitest";
import {
  Card,
  Rank,
  Suit,
  enumeratePlays,
  insertIntoPlacement,
  reclaimFromPlacement,
  PlayOption,
} from "../src/index.js";

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank });
const seqs = (opts: PlayOption[]) => opts.map((o) => o.seq).sort();
const bySeq = (opts: PlayOption[], seq: string) => opts.find((o) => o.seq === seq)!;

describe("enumeratePlays — ambiguous runs (bug: 3 OR 6 both inserted)", () => {
  it("[4,5,beanie] offers 3-4-5 and 4-5-6 (beanie rank 10)", () => {
    const opts = enumeratePlays([c("D", 4), c("D", 5), c("D", 10)], 10);
    expect(seqs(opts)).toEqual(["3-4-5", "4-5-6"]);
  });

  it("beanie in 3-4-5 is locked to rank 3, in 4-5-6 to rank 6", () => {
    const opts = enumeratePlays([c("D", 4), c("D", 5), c("D", 10)], 10);
    const low = bySeq(opts, "3-4-5").cards.find((x) => x.rank === 10)!;
    const high = bySeq(opts, "4-5-6").cards.find((x) => x.rank === 10)!;
    expect(low.assignedRank).toBe(3);
    expect(high.assignedRank).toBe(6);
  });

  it("an internal beanie is unambiguous: [4,beanie,6] -> only 4-5-6", () => {
    const opts = enumeratePlays([c("D", 4), c("D", 10), c("D", 6)], 10);
    expect(seqs(opts)).toEqual(["4-5-6"]);
    expect(opts[0].cards.find((x) => x.rank === 10)!.assignedRank).toBe(5);
  });
});

describe("enumeratePlays — set vs run (bug: [4,beanie,beanie] forced to Set)", () => {
  it("[4,beanie,beanie] offers the Set AND every run (beanie rank 10)", () => {
    const opts = enumeratePlays([c("D", 4), c("D", 10), c("D", 10)], 10);
    expect(seqs(opts)).toEqual(["2-3-4", "3-4-5", "4-5-6", "SET:4"]);
  });

  it("the two beanies take distinct ranks in each run", () => {
    const opts = enumeratePlays([c("D", 4), c("D", 10), c("D", 10)], 10);
    const run = bySeq(opts, "3-4-5");
    expect(run.cards.map((x) => x.assignedRank).sort()).toEqual([3, 4, 5]);
    const set = bySeq(opts, "SET:4");
    expect(set.cards.every((x) => x.assignedRank === 4)).toBe(true);
  });

  it("a natural three-of-a-kind with no run is just a Set", () => {
    const opts = enumeratePlays([c("H", 7), c("S", 7), c("D", 7)], 10);
    expect(seqs(opts)).toEqual(["SET:7"]);
  });

  it("Ace runs low or high: [K,A,beanie] offers Q-K-A only", () => {
    const opts = enumeratePlays([c("S", 13), c("S", 1), c("S", 10)], 10);
    expect(seqs(opts)).toEqual(["Q-K-A"]);
  });
});

describe("insertIntoPlacement — respects the locked run", () => {
  // Played as 4-5-6 (beanie=6). Rank 10 is wild.
  const runLow = enumeratePlays([c("D", 4), c("D", 5), c("D", 10)], 10);
  const placement456 = bySeq(runLow, "4-5-6");

  it("into 4-5-6 you may add a 3 or a 7, but NOT both-at-once ambiguity", () => {
    expect(insertIntoPlacement(placement456.cards, "FLUSH", c("D", 3), 10).ok).toBe(true);
    expect(insertIntoPlacement(placement456.cards, "FLUSH", c("D", 7), 10).ok).toBe(true);
  });

  it("into 4-5-6 a 6 (duplicate) is rejected", () => {
    const r = insertIntoPlacement(placement456.cards, "FLUSH", c("D", 6), 10);
    expect(r.ok).toBe(false);
  });

  it("wrong suit is rejected", () => {
    const r = insertIntoPlacement(placement456.cards, "FLUSH", c("H", 7), 10);
    expect(r.ok).toBe(false);
  });

  it("a beanie with two open ends yields two placement choices", () => {
    const r = insertIntoPlacement(placement456.cards, "FLUSH", c("H", 10), 10);
    expect(r.ok).toBe(true);
    expect(seqs(r.options!)).toEqual(["3-4-5-6", "4-5-6-7"]);
  });
});

describe("insertIntoPlacement — sets", () => {
  const set = enumeratePlays([c("H", 7), c("S", 7), c("D", 7)], 10)[0];

  it("grows a three-of-a-kind to four with a matching natural", () => {
    const r = insertIntoPlacement(set.cards, "SET", c("C", 7), 10);
    expect(r.ok).toBe(true);
    expect(r.options![0].cards).toHaveLength(4);
  });

  it("rejects a non-matching rank", () => {
    expect(insertIntoPlacement(set.cards, "SET", c("C", 8), 10).ok).toBe(false);
  });

  it("cannot exceed four of a kind", () => {
    const four = [...set.cards, { rank: 7 as Rank, suit: "C" as Suit, assignedRank: 7 as Rank }];
    expect(insertIntoPlacement(four, "SET", c("H", 10), 10).ok).toBe(false);
  });
});

describe("reclaimFromPlacement", () => {
  it("reclaims a beanie from a run by its locked rank & suit", () => {
    // 4-5-6 with beanie=6. Provide the natural 6♦.
    const p = bySeq(enumeratePlays([c("D", 4), c("D", 5), c("D", 10)], 10), "4-5-6");
    const r = reclaimFromPlacement(p.cards, "FLUSH", c("D", 6), 10);
    expect(r.ok).toBe(true);
    expect(r.returnedBeanie).toEqual({ rank: 10, suit: "D" });
    expect(r.newCards!.every((x) => x.rank !== 10)).toBe(true);
  });

  it("rejects a natural that doesn't match the locked beanie rank", () => {
    const p = bySeq(enumeratePlays([c("D", 4), c("D", 5), c("D", 10)], 10), "4-5-6");
    // 3♦ would fit a 3-4-5 reading, but this hand is locked as 4-5-6.
    expect(reclaimFromPlacement(p.cards, "FLUSH", c("D", 3), 10).ok).toBe(false);
  });

  it("cannot reclaim from a three-of-a-kind set", () => {
    const set = enumeratePlays([c("H", 7), c("S", 7), c("D", 10)], 10)[0];
    expect(reclaimFromPlacement(set.cards, "SET", c("C", 7), 10).ok).toBe(false);
  });
});
