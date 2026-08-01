// Enumerating the ways a group of cards can be PLAYED, with every Beanie locked
// to a concrete rank.
//
// The rules problem this solves: a Beanie (wild) is ambiguous. [4♦,5♦,🫘] is a
// valid run as BOTH 3-4-5 (🫘=3) and 4-5-6 (🫘=6); [4♦,🫘,🫘] is a Set of 4s AND
// several runs. If we store only the raw cards, later inserts/reclaims re-float
// the Beanie and accept moves that contradict how the hand was actually played.
//
// So a played hand is stored as a "placement": each card carries the rank it
// represents (assignedRank == rank for naturals). The player picks one placement
// when a hand is ambiguous; everything downstream enforces that locked reading.

import { Card, Rank, Suit, rankChar } from "./cards.js";
import { isBeanie } from "./beanie.js";
import { HandKind } from "./validation.js";

/** A physical card together with the rank it stands for in a played hand. */
export interface PlacedCard {
  rank: Rank; // physical rank (a Beanie keeps its own rank)
  suit: Suit; // physical suit
  assignedRank: Rank; // rank it represents (== rank for a natural card)
}

/** One valid way to play a group of cards, in canonical display order. */
export interface PlayOption {
  kind: HandKind; // SET | FLUSH
  label: string; // "Set of 4s" | "3-4-5"
  seq: string; // stable signature, e.g. "SET:4" or "3-4-5" — used to re-select
  cards: PlacedCard[];
}

/** Rank value(s) an Ace can take in a run: 1 (low) or 14 (high). */
function aceValues(rank: Rank): number[] {
  return rank === 1 ? [1, 14] : [rank];
}

/** Convert a run value (1..14, 14 = Ace high) back to a card Rank (1..13). */
function toRank(value: number): Rank {
  return (value === 14 ? 1 : value) as Rank;
}

function place(card: Card, value: number): PlacedCard {
  return { rank: card.rank, suit: card.suit, assignedRank: toRank(value) };
}

/** Ascending run label from assigned values, e.g. [12,13,14] -> "Q-K-A". */
function runLabel(values: number[]): string {
  return values.map((v) => rankChar(toRank(v))).join("-");
}

/**
 * All valid ways to play these cards for the given beanie rank, as concrete
 * placements. Empty if the cards don't form any legal set or straight flush.
 * A group with a single reading returns one option; ambiguous groups return
 * several (Set and/or multiple runs) for the player to choose from.
 */
export function enumeratePlays(cards: Card[], beanieRank: Rank): PlayOption[] {
  if (cards.length < 3) return [];
  const naturals = cards.filter((c) => !isBeanie(c, beanieRank));
  const wilds = cards.filter((c) => isBeanie(c, beanieRank));

  const out: PlayOption[] = [];
  const set = enumerateSet(naturals, wilds);
  if (set) out.push(set);
  out.push(...enumerateRuns(cards.length, naturals, wilds));
  return out;
}

/** A set: 3–4 cards, all naturals one rank; wilds take that rank. */
function enumerateSet(naturals: Card[], wilds: Card[]): PlayOption | null {
  const length = naturals.length + wilds.length;
  if (length < 3 || length > 4) return null;
  const ranks = new Set(naturals.map((c) => c.rank));
  if (ranks.size > 1) return null;
  // All-wild sets are degenerate; require at least one natural to name the rank.
  if (naturals.length === 0) return null;

  const setRank = naturals[0].rank;
  const cards: PlacedCard[] = [
    ...naturals.map((c) => ({ rank: c.rank, suit: c.suit, assignedRank: c.rank })),
    ...wilds.map((c) => ({ rank: c.rank, suit: c.suit, assignedRank: setRank })),
  ];
  return { kind: "SET", label: `Set of ${rankChar(setRank)}s`, seq: `SET:${setRank}`, cards };
}

/**
 * Every straight flush the cards can form: all naturals share one suit and sit
 * in distinct slots of a length-wide consecutive window; wilds fill the gaps and
 * take the rank of the slot they land in. Each distinct window is one option.
 * Requires at least one natural (an all-wild run would have no suit and dozens
 * of readings — the Set option covers an all-wild trio instead).
 */
function enumerateRuns(
  length: number,
  naturals: Card[],
  wilds: Card[]
): PlayOption[] {
  if (naturals.length === 0) return [];
  if (new Set(naturals.map((c) => c.suit)).size > 1) return [];

  const bySeq = new Map<string, PlayOption>();

  // Each natural picks a run value; only Aces are ambiguous (low 1 / high 14).
  const assign = (idx: number, chosen: { card: Card; value: number }[]) => {
    if (idx === naturals.length) {
      addWindows(chosen);
      return;
    }
    for (const v of aceValues(naturals[idx].rank)) {
      assign(idx + 1, [...chosen, { card: naturals[idx], value: v }]);
    }
  };

  const addWindows = (chosen: { card: Card; value: number }[]) => {
    const values = chosen.map((x) => x.value);
    if (new Set(values).size !== values.length) return; // duplicate rank
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    // Window [start, start+length-1] must contain min & max and sit in [1,14].
    const startLo = Math.max(1, maxV - length + 1);
    const startHi = Math.min(minV, 15 - length);

    for (let start = startLo; start <= startHi; start++) {
      const slots: (PlacedCard | null)[] = Array(length).fill(null);
      let ok = true;
      for (const { card, value } of chosen) {
        const i = value - start;
        if (i < 0 || i >= length || slots[i]) {
          ok = false;
          break;
        }
        slots[i] = place(card, value);
      }
      if (!ok) continue;

      const remaining = [...wilds];
      const cards: PlacedCard[] = [];
      for (let i = 0; i < length; i++) {
        const filled = slots[i];
        if (filled) cards.push(filled);
        else cards.push(place(remaining.shift()!, start + i));
      }
      const values2 = cards.map((c, i) => start + i);
      const seq = runLabel(values2);
      if (!bySeq.has(seq)) bySeq.set(seq, { kind: "FLUSH", label: seq, seq, cards });
    }
  };

  assign(0, []);
  return [...bySeq.values()].sort(
    (a, b) => a.cards[0].assignedRank - b.cards[0].assignedRank
  );
}

// ---------------------------------------------------------------- insert / reclaim

export interface InsertOutcome {
  ok: boolean;
  /** Resulting placements: one if the move is unambiguous, several to choose. */
  options?: PlayOption[];
  reason?: string;
}

export interface ReclaimOutcome {
  ok: boolean;
  newCards?: PlacedCard[];
  /** The Beanie that returns to the acting player's hand. */
  returnedBeanie?: Card;
  reason?: string;
}

/** The suit a run is played in (from any natural). Null for an all-wild hand. */
function runSuit(placed: PlacedCard[], beanieRank: Rank): Suit | null {
  const natural = placed.find((c) => c.rank !== beanieRank);
  return natural ? natural.suit : null;
}

/**
 * Insert one card into a played hand to extend it, respecting the hand's locked
 * placement:
 *   - set: grow a three-of-a-kind into a four-of-a-kind (natural of the set rank,
 *     or a beanie).
 *   - straight flush: extend the low or high end by one. A natural extends the
 *     single end whose rank it matches; a Beanie can extend either open end, so
 *     a Beanie with both ends open yields two options to choose from.
 */
export function insertIntoPlacement(
  placed: PlacedCard[],
  kind: HandKind,
  newCard: Card,
  beanieRank: Rank
): InsertOutcome {
  const isWild = isBeanie(newCard, beanieRank);

  if (kind === "SET") {
    if (placed.length >= 4) {
      return { ok: false, reason: "A set can't exceed four of a kind." };
    }
    const setRank = placed[0].assignedRank;
    if (!isWild && newCard.rank !== setRank) {
      return { ok: false, reason: "That card doesn't match this set's rank." };
    }
    const added: PlacedCard = {
      rank: newCard.rank,
      suit: newCard.suit,
      assignedRank: setRank,
    };
    const naturals = [...placed, added].filter((c) => c.rank !== beanieRank);
    const wilds = [...placed, added].filter((c) => c.rank === beanieRank);
    return {
      ok: true,
      options: [
        {
          kind: "SET",
          label: `Set of ${rankChar(setRank)}s`,
          seq: `SET:${setRank}`,
          cards: [...naturals, ...wilds],
        },
      ],
    };
  }

  // FLUSH: `placed` is stored in ascending run order (see enumerateRuns).
  const suit = runSuit(placed, beanieRank);
  const values = runValues(placed); // Ace-aware, e.g. Q-K-A -> [12,13,14]
  const lowEnd = values[0] - 1;
  const highEnd = values[values.length - 1] + 1;

  const ends: number[] = [];
  if (lowEnd >= 1) ends.push(lowEnd);
  if (highEnd <= 14) ends.push(highEnd);

  const build = (endValue: number): PlayOption => {
    const added = place(newCard, endValue);
    const cards =
      endValue < values[0] ? [added, ...placed] : [...placed, added];
    const seq = runLabel(runValues(cards));
    return { kind: "FLUSH", label: seq, seq, cards };
  };

  if (isWild) {
    const options = ends.map(build);
    if (options.length === 0) {
      return { ok: false, reason: "This run can't be extended." };
    }
    return { ok: true, options };
  }

  // Natural: must match the run's suit and fall on exactly one open end.
  if (suit && newCard.suit !== suit) {
    return { ok: false, reason: "A straight flush must stay one suit." };
  }
  const target = ends.find((e) => toRank(e) === newCard.rank);
  if (target === undefined) {
    return { ok: false, reason: "That card doesn't extend either end." };
  }
  return { ok: true, options: [build(target)] };
}

/** Ace-aware ascending run values for a placement (Q-K-A -> [12,13,14]). */
function runValues(placed: PlacedCard[]): number[] {
  // A run holds distinct consecutive ranks; the only ambiguity is a lone Ace,
  // which reads high iff a King (13) is present, low otherwise.
  const hasKing = placed.some((c) => c.assignedRank === 13);
  return placed.map((c) => (c.assignedRank === 1 && hasKing ? 14 : c.assignedRank));
}

/**
 * Reclaim a Beanie from a played hand by swapping in the natural card it stands
 * for; the Beanie returns to the acting player's hand. Length and kind are kept.
 *   - straight flush: the provided card must match a Beanie's suit and locked rank.
 *   - set: never from a three-of-a-kind — grow to four first, then the provided
 *     natural must match the set's rank.
 */
export function reclaimFromPlacement(
  placed: PlacedCard[],
  kind: HandKind,
  providedCard: Card,
  beanieRank: Rank
): ReclaimOutcome {
  if (isBeanie(providedCard, beanieRank)) {
    return { ok: false, reason: "You must provide a natural card, not a beanie." };
  }
  const beanieIdx = placed
    .map((c, i) => (c.rank === beanieRank ? i : -1))
    .filter((i) => i >= 0);
  if (beanieIdx.length === 0) {
    return { ok: false, reason: "This hand has no beanie to reclaim." };
  }

  if (kind === "SET") {
    if (placed.length < 4) {
      return {
        ok: false,
        reason:
          "Can't reclaim a beanie from a three-of-a-kind — grow it to four first.",
      };
    }
    if (providedCard.rank !== placed[0].assignedRank) {
      return { ok: false, reason: "That card doesn't match this set's rank." };
    }
  } else {
    const suit = runSuit(placed, beanieRank);
    if (suit && providedCard.suit !== suit) {
      return { ok: false, reason: "That card doesn't match the run's suit." };
    }
  }

  // Find a beanie slot whose represented rank the provided card fills.
  const i = beanieIdx.find((idx) => placed[idx].assignedRank === providedCard.rank);
  if (i === undefined) {
    return { ok: false, reason: "That card doesn't match a beanie in this hand." };
  }

  const returnedBeanie: Card = { rank: placed[i].rank, suit: placed[i].suit };
  const newCards = placed.map((c, idx) =>
    idx === i
      ? { rank: providedCard.rank, suit: providedCard.suit, assignedRank: providedCard.rank }
      : c
  );
  return { ok: true, newCards, returnedBeanie };
}
