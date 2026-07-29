// Inserting cards into an existing played hand, and reclaiming beanies.
//
// Both operations are validated by re-checking the resulting hand: an insert or
// reclaim is legal only if the hand is still a valid set / straight flush after.

import { Card, Rank } from "./cards.js";
import { isBeanie } from "./beanie.js";
import { HandKind, validateHand } from "./validation.js";

export interface InsertResult {
  ok: boolean;
  newFieldCards?: Card[];
  kind?: HandKind;
  reason?: string;
}

export interface ReclaimResult {
  ok: boolean;
  newFieldCards?: Card[];
  /** The beanie card that returns to the acting player's hand. */
  returnedBeanie?: Card;
  reason?: string;
}

/**
 * Insert one card into an existing played hand to extend it:
 *   - straight flush: extend either (or over time, both) end(s)
 *   - set: grow a three-of-a-kind into a four-of-a-kind
 * The added card may be a natural card or a beanie. Legal iff the resulting
 * hand is still a valid set / straight flush exactly one card longer.
 */
export function tryInsert(
  fieldCards: Card[],
  newCard: Card,
  beanieRank: Rank
): InsertResult {
  const before = validateHand(fieldCards, beanieRank);
  if (!before.valid) {
    return { ok: false, reason: "Target is not a valid played hand." };
  }

  const newHand = [...fieldCards, newCard];
  const after = validateHand(newHand, beanieRank);
  if (!after.valid) {
    return { ok: false, reason: after.reason ?? "Card does not fit this hand." };
  }
  return { ok: true, newFieldCards: newHand, kind: after.kind };
}

/**
 * Reclaim a beanie from a played hand by swapping in the natural card it stands
 * for, taking the beanie into your hand. The hand keeps the same length and kind.
 *
 * Rules:
 *   - Straight flush: allowed whenever the swap leaves a valid straight flush.
 *   - Set: a beanie can NEVER be reclaimed from a three-of-a-kind. The set must
 *     already be a four-of-a-kind (grow it first with an insert), after which the
 *     swap leaves a natural four-of-a-kind.
 *   - The provided card must be a natural card (not itself a beanie).
 */
export function tryReclaim(
  fieldCards: Card[],
  providedCard: Card,
  beanieRank: Rank
): ReclaimResult {
  if (isBeanie(providedCard, beanieRank)) {
    return { ok: false, reason: "You must provide a natural card, not a beanie." };
  }

  const before = validateHand(fieldCards, beanieRank);
  if (!before.valid) {
    return { ok: false, reason: "Target is not a valid played hand." };
  }

  const beanieIndices = fieldCards
    .map((c, i) => (isBeanie(c, beanieRank) ? i : -1))
    .filter((i) => i >= 0);
  if (beanieIndices.length === 0) {
    return { ok: false, reason: "This hand has no beanie to reclaim." };
  }

  if (before.kind === "SET" && fieldCards.length < 4) {
    return {
      ok: false,
      reason:
        "Can't reclaim a beanie from a three-of-a-kind — grow it to four first.",
    };
  }

  // Try replacing each beanie with the provided card; accept the first swap that
  // leaves a valid hand of the same kind and length.
  for (const i of beanieIndices) {
    const candidate = fieldCards.filter((_, idx) => idx !== i).concat(providedCard);
    const after = validateHand(candidate, beanieRank);
    if (
      after.valid &&
      after.kind === before.kind &&
      candidate.length === fieldCards.length
    ) {
      return {
        ok: true,
        newFieldCards: candidate,
        returnedBeanie: fieldCards[i],
      };
    }
  }

  return {
    ok: false,
    reason: "That card doesn't match a beanie slot in this hand.",
  };
}
