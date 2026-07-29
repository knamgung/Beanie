// Validation of played hands: straight flush, or 3-/4-of-a-kind, with beanies as wilds.

import { Card, Rank, Suit } from "./cards.js";
import { isBeanie } from "./beanie.js";

export type HandKind = "SET" | "FLUSH";

export interface HandValidation {
  valid: boolean;
  kind?: HandKind;
  reason?: string;
}

/** Rank value with Ace flexible: returns [1] for non-aces, [1, 14] for aces. */
function straightValues(rank: Rank): number[] {
  return rank === 1 ? [1, 14] : [rank];
}

/**
 * Validate a group of cards as a single played hand for the given beanie rank.
 * Minimum 3 cards. Either a set (3–4 of a kind) or a straight flush.
 * All cards of the beanie rank are wild.
 */
export function validateHand(cards: Card[], beanieRank: Rank): HandValidation {
  if (cards.length < 3) {
    return { valid: false, reason: "A hand needs at least 3 cards." };
  }

  const naturals = cards.filter((c) => !isBeanie(c, beanieRank));
  const wildCount = cards.length - naturals.length;

  const asSet = validateSet(cards, naturals);
  if (asSet.valid) return asSet;

  const asFlush = validateStraightFlush(cards, naturals, wildCount);
  if (asFlush.valid) return asFlush;

  // Prefer the more specific failure reason.
  return {
    valid: false,
    reason:
      asSet.reason && cards.length <= 4
        ? asSet.reason
        : asFlush.reason ?? "Not a valid set or straight flush.",
  };
}

/** A set is 3 or 4 cards; all naturals share one rank; wilds fill the rest. */
function validateSet(cards: Card[], naturals: Card[]): HandValidation {
  if (cards.length > 4) {
    return { valid: false, reason: "A set can be at most 4 cards." };
  }
  const ranks = new Set(naturals.map((c) => c.rank));
  if (ranks.size > 1) {
    return { valid: false, reason: "A set must be a single rank." };
  }
  // All wild, or one shared natural rank -> valid set.
  return { valid: true, kind: "SET" };
}

/**
 * A straight flush: all naturals share one suit and occupy distinct positions
 * inside a consecutive window whose width equals the hand length; wilds fill the
 * gaps. Ace may be low (1) or high (14) but not both in the same run.
 */
function validateStraightFlush(
  cards: Card[],
  naturals: Card[],
  wildCount: number
): HandValidation {
  const length = cards.length;

  const suits = new Set(naturals.map((c) => c.suit));
  if (suits.size > 1) {
    return { valid: false, reason: "A straight flush must be one suit." };
  }

  // Enumerate Ace low/high choices across all natural aces.
  const options = naturals.map((c) => straightValues(c.rank));

  const fits = (idx: number, chosen: number[]): boolean => {
    if (idx === options.length) {
      const positions = new Set(chosen);
      if (positions.size !== chosen.length) return false; // duplicate rank
      if (chosen.length === 0) return true; // all wild: any window works
      const min = Math.min(...chosen);
      const max = Math.max(...chosen);
      if (max - min > length - 1) return false; // won't fit in the window
      return min >= 1 && max <= 14 && wildCount === length - chosen.length;
    }
    return options[idx].some((v) => fits(idx + 1, [...chosen, v]));
  };

  if (fits(0, [])) {
    return { valid: true, kind: "FLUSH" };
  }
  return {
    valid: false,
    reason: "Cards do not form a consecutive straight flush.",
  };
}

/** Convenience for callers that only need a boolean. */
export function isValidHand(cards: Card[], beanieRank: Rank): boolean {
  return validateHand(cards, beanieRank).valid;
}

/**
 * Lay out a straight flush in ascending run order, placing each beanie in the
 * gap position it fills. Returns null if the cards aren't a straight flush.
 * A run has at most one natural Ace (one suit), so Ace low/high has ≤2 cases.
 */
function layoutStraightFlush(cards: Card[], beanieRank: Rank): Card[] | null {
  const wilds = cards.filter((c) => isBeanie(c, beanieRank));
  const naturals = cards.filter((c) => !isBeanie(c, beanieRank));
  const length = cards.length;

  if (new Set(naturals.map((c) => c.suit)).size > 1) return null;
  if (naturals.length === 0) return [...cards]; // all wild: any order

  // All ways to assign a run value to each natural (only Aces are ambiguous).
  let assignments: { card: Card; value: number }[][] = [[]];
  for (const card of naturals) {
    const values = straightValues(card.rank);
    assignments = assignments.flatMap((a) =>
      values.map((value) => [...a, { card, value }])
    );
  }

  for (const asn of assignments) {
    const values = asn.map((x) => x.value);
    if (new Set(values).size !== values.length) continue; // duplicate rank
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    // Prefer the highest start (naturals sit low, extra wilds trail at the top).
    const startHigh = Math.min(14 - length + 1, minV);
    const startLow = Math.max(1, maxV - length + 1);
    for (let start = startHigh; start >= startLow; start--) {
      const slots: (Card | null)[] = Array(length).fill(null);
      let ok = true;
      for (const { card, value } of asn) {
        const i = value - start;
        if (i < 0 || i >= length || slots[i]) {
          ok = false;
          break;
        }
        slots[i] = card;
      }
      if (!ok) continue;

      const remaining = [...wilds];
      const out: Card[] = [];
      for (let i = 0; i < length; i++) {
        out.push(slots[i] ?? remaining.shift()!);
      }
      if (remaining.length === 0) return out;
    }
  }
  return null;
}

/**
 * Return the cards of a valid played hand in a natural display order:
 *   - straight flush: ascending run order (beanies in their gap positions)
 *   - set: natural cards first (by suit), then beanies
 * Falls back to the input order if the hand isn't valid.
 */
export function orderPlayedHand(cards: Card[], beanieRank: Rank): Card[] {
  const check = validateHand(cards, beanieRank);
  if (!check.valid) return [...cards];

  if (check.kind === "FLUSH") {
    return layoutStraightFlush(cards, beanieRank) ?? [...cards];
  }

  // SET: naturals (sorted by suit) then beanies.
  const naturals = cards
    .filter((c) => !isBeanie(c, beanieRank))
    .sort((a, b) => a.suit.localeCompare(b.suit));
  const wilds = cards.filter((c) => isBeanie(c, beanieRank));
  return [...naturals, ...wilds];
}

export type { Card, Rank, Suit };
