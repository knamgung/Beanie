// Colyseus synced state for a Beanie room. Everything here is PUBLIC and
// broadcast to all clients. Private data (each player's hand, the draw pile
// order) is kept in the room instance and pushed to individual clients.

import { Schema, type, ArraySchema } from "@colyseus/schema";

export class CardSchema extends Schema {
  @type("number") rank = 0; // 1..13 (1 = Ace) — the physical card's rank
  @type("string") suit = ""; // C | D | H | S
  // The rank this card represents in a played hand. For a natural card this
  // equals `rank`; for a Beanie (wild) it's the value the player locked it to.
  @type("number") assignedRank = 0;
}

export class PlayerSchema extends Schema {
  @type("string") id = ""; // Colyseus sessionId
  @type("string") name = "";
  @type("number") seat = 0;
  @type("boolean") connected = true;
  @type("boolean") isHost = false;
  @type("number") score = 0; // cumulative across rounds
  @type(["number"]) roundPoints = new ArraySchema<number>(); // points earned each round
  @type(["number"]) roundPenalties = new ArraySchema<number>(); // beanie-discard penalty each round
  @type("number") handCount = 0; // number of cards in hand (public count)
  @type("boolean") hasPlayed = false; // owns a played hand this round?
  @type("boolean") tookTurn = false; // has taken a turn this round?
  @type("boolean") ready = false; // readied up to start the next round?
}

export class FieldHandSchema extends Schema {
  @type("string") id = "";
  @type("number") ownerSeat = 0;
  @type("string") kind = ""; // SET | FLUSH
  @type([CardSchema]) cards = new ArraySchema<CardSchema>();
}

/** A one-turn-out / round-14 bonus that was applied to cumulative totals. */
export class BonusEventSchema extends Schema {
  @type("number") round = 0;
  @type("number") winnerSeat = 0;
  @type("string") choice = ""; // double | halve
}

export class GameState extends Schema {
  // LOBBY | PLAYING | ROUND_END | GAME_OVER
  @type("string") phase = "LOBBY";

  @type("number") round = 0; // 1..14
  @type("number") beanieRank = 0; // wild rank for the round

  @type("number") starterSeat = -1; // who opened this round
  @type("number") turnSeat = -1; // whose turn it is
  @type("string") turnPhase = ""; // DRAW | ACT
  @type("boolean") openingTurn = false; // starter's discard-only opening turn
  @type("number") completedTurns = 0; // finished turns this round (gates finishing)

  @type("number") drawCount = 0; // public count of the face-down draw pile
  @type(CardSchema) discardTop = new CardSchema(); // top of discard (public)
  @type("boolean") hasDiscard = false;

  @type("number") wheelResult = -1; // seat chosen by the opening wheel spin
  @type("number") wheelNonce = 0; // increments each spin — drives the wheel animation
  @type("number") awaitingBonusSeat = -1; // winner must pick double/halve

  @type("string") roundWinnerName = "";
  @type("string") lastBonus = ""; // "" | double | halve

  @type([PlayerSchema]) players = new ArraySchema<PlayerSchema>();
  @type([FieldHandSchema]) field = new ArraySchema<FieldHandSchema>();
  @type([BonusEventSchema]) bonuses = new ArraySchema<BonusEventSchema>();
}
