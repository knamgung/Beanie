// The authoritative Beanie game room. All rules run here (via the tested
// @beanie/shared engine); clients only send intents and render synced state.

import { Room, Client } from "@colyseus/core";
import { ArraySchema } from "@colyseus/schema";
import {
  Card,
  Rank,
  Suit,
  cardId,
  shuffle,
  beanieRankForRound,
  isBeanie,
  dealRound,
  enumeratePlays,
  insertIntoPlacement,
  reclaimFromPlacement,
  PlayOption,
  PlacedCard,
  HandKind,
  scoreRound,
  applyBonus,
  BonusChoice,
} from "@beanie/shared";
import {
  GameState,
  PlayerSchema,
  FieldHandSchema,
  CardSchema,
  BonusEventSchema,
} from "../schema.js";

const RECONNECT_SECONDS = 300; // 5 minutes — generous for a casual friends game

// ---- small conversion helpers between engine cards and schema cards ----
function toSchemaCard(card: PlacedCard | Card): CardSchema {
  const cs = new CardSchema();
  cs.rank = card.rank;
  cs.suit = card.suit;
  // Natural cards (and plain Cards) represent themselves.
  cs.assignedRank = (card as PlacedCard).assignedRank ?? card.rank;
  return cs;
}
function toArraySchema(cards: (PlacedCard | Card)[]): ArraySchema<CardSchema> {
  const arr = new ArraySchema<CardSchema>();
  for (const c of cards) arr.push(toSchemaCard(c));
  return arr;
}
/** Read a field hand's schema cards back into engine placements. */
function toPlaced(cards: ArraySchema<CardSchema>): PlacedCard[] {
  return cards.map((c: CardSchema) => ({
    rank: c.rank as Rank,
    suit: c.suit as Suit,
    assignedRank: (c.assignedRank || c.rank) as Rank,
  }));
}

export class BeanieRoom extends Room<GameState> {
  maxClients = 4;

  // ---- private, server-only state (never synced) ----
  private hands: Card[][] = []; // hands[seat]
  private drawPile: Card[] = [];
  private discardPile: Card[] = []; // full pile; last element is the top
  private seatClients: (Client | undefined)[] = [];
  private fieldSeq = 0;
  private roundPenalty: number[] = []; // beanie-discard penalty accrued this round, by seat

  // per-turn action tracking (for one-turn-out detection)
  private turnPlays = 0;
  private turnInserts = 0;
  private turnReclaims = 0;
  private turnSingle7Flush = false;

  private rng = () => Math.random();

  onCreate() {
    this.setState(new GameState());

    this.onMessage("spinWheel", (client) => this.handleSpin(client));
    this.onMessage("startGame", (client) => this.handleStartGame(client));
    this.onMessage("draw", (client, msg) => this.handleDraw(client, msg));
    this.onMessage("playHand", (client, msg) => this.handlePlay(client, msg));
    this.onMessage("insert", (client, msg) => this.handleInsert(client, msg));
    this.onMessage("reclaim", (client, msg) => this.handleReclaim(client, msg));
    this.onMessage("discard", (client, msg) => this.handleDiscard(client, msg));
    this.onMessage("bonus", (client, msg) => this.handleBonus(client, msg));
    this.onMessage("ready", (client) => this.handleReady(client));
    // Client asks for its private hand after (re)connecting.
    this.onMessage("requestHand", (client) => {
      const p = this.playerByClient(client);
      if (p) this.sendHand(p.seat);
    });
  }

  // ---------------------------------------------------------------- join/leave

  onJoin(client: Client, options: { name?: string }) {
    if (this.state.phase !== "LOBBY") {
      throw new Error("Game already in progress.");
    }
    const seat = this.state.players.length;
    const p = new PlayerSchema();
    p.id = client.sessionId;
    p.name = (options?.name || `Player ${seat + 1}`).slice(0, 20);
    p.seat = seat;
    p.isHost = seat === 0;
    p.connected = true;
    this.state.players.push(p);
    this.hands[seat] = [];
    this.seatClients[seat] = client;
    this.sendHand(seat);
  }

  async onLeave(client: Client, consented: boolean) {
    const p = this.playerByClient(client);
    if (!p) return;
    p.connected = false;

    // In the lobby, a leaver is simply removed and seats re-pack.
    if (this.state.phase === "LOBBY") {
      this.removePlayer(p.seat);
      return;
    }

    // If we were waiting on this player to ready up, don't stall the others.
    this.maybeStartNextRound();

    // Mid-game: keep the seat and allow a reconnection window.
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
      p.connected = true;
      this.seatClients[p.seat] = client;
      this.sendHand(p.seat);
    } catch {
      // Reconnection window elapsed — leave the seat disconnected so the
      // game state (their hand, score) stays intact for the others.
      p.connected = false;
    }
  }

  private removePlayer(seat: number) {
    this.state.players.splice(seat, 1);
    this.hands.splice(seat, 1);
    this.seatClients.splice(seat, 1);
    // Re-pack seat numbers so they stay contiguous 0..n-1.
    this.state.players.forEach((pl: PlayerSchema, i: number) => {
      pl.seat = i;
      pl.isHost = i === 0;
    });
  }

  // ---------------------------------------------------------------- lobby

  private handleSpin(client: Client) {
    if (!this.requireHost(client) || this.state.phase !== "LOBBY") return;
    const n = this.state.players.length;
    this.state.wheelResult = Math.floor(this.rng() * n);
  }

  private handleStartGame(client: Client) {
    if (!this.requireHost(client) || this.state.phase !== "LOBBY") return;
    if (this.state.players.length < 2) {
      return this.error(client, "Need at least 2 players.");
    }
    const n = this.state.players.length;
    this.state.starterSeat =
      this.state.wheelResult >= 0 && this.state.wheelResult < n
        ? this.state.wheelResult
        : Math.floor(this.rng() * n);
    this.state.round = 1;
    // Fresh game: clear any carried-over scores/history.
    this.state.bonuses = new ArraySchema<BonusEventSchema>();
    this.state.players.forEach((p: PlayerSchema) => {
      p.score = 0;
      p.roundPoints = new ArraySchema<number>();
      p.roundPenalties = new ArraySchema<number>();
    });
    this.startRound();
  }

  /**
   * A player readies up for the next round. The round starts automatically once
   * every connected player has readied — no single host gates it.
   */
  private handleReady(client: Client) {
    if (this.state.phase !== "ROUND_END") return;
    const p = this.playerByClient(client);
    if (!p) return;
    p.ready = true;
    this.maybeStartNextRound();
  }

  /** Start the next round once every connected player has readied. */
  private maybeStartNextRound() {
    if (this.state.phase !== "ROUND_END") return;
    const waiting = this.state.players.filter(
      (pl: PlayerSchema) => pl.connected && !pl.ready
    );
    if (waiting.length === 0) this.advanceToNextRound();
  }

  private advanceToNextRound() {
    this.state.round += 1;
    const n = this.state.players.length;
    // Rotate the opening player each round (fixed direction).
    this.state.starterSeat = (this.state.starterSeat + 1) % n;
    this.startRound();
  }

  // ---------------------------------------------------------------- round setup

  private startRound() {
    const n = this.state.players.length;
    const s = this.state;

    s.beanieRank = beanieRankForRound(s.round);
    const deal = dealRound(n, s.starterSeat, this.rng);
    this.hands = deal.hands;
    this.drawPile = deal.drawPile;
    this.discardPile = [];
    this.roundPenalty = new Array(n).fill(0);

    s.field = new ArraySchema<FieldHandSchema>();
    s.drawCount = this.drawPile.length;
    s.hasDiscard = false;
    s.roundWinnerName = "";
    s.lastBonus = "";
    s.awaitingBonusSeat = -1;
    s.completedTurns = 0;

    s.players.forEach((p: PlayerSchema) => {
      p.hasPlayed = false;
      p.tookTurn = false;
      p.ready = false;
      p.handCount = this.hands[p.seat].length;
    });

    // The starter opens with a discard only: no draw, no play.
    s.turnSeat = s.starterSeat;
    s.turnPhase = "ACT";
    s.openingTurn = true;
    this.resetTurnTracking();

    s.phase = "PLAYING";
    for (let seat = 0; seat < n; seat++) this.sendHand(seat);
  }

  private resetTurnTracking() {
    this.turnPlays = 0;
    this.turnInserts = 0;
    this.turnReclaims = 0;
    this.turnSingle7Flush = false;
  }

  // ---------------------------------------------------------------- turn actions

  private handleDraw(client: Client, msg: { source?: string }) {
    const p = this.requireTurn(client, "DRAW");
    if (!p) return;

    if (msg?.source === "discard") {
      if (this.discardPile.length === 0) {
        return this.error(client, "The discard pile is empty.");
      }
      const card = this.discardPile.pop()!;
      this.hands[p.seat].push(card);
    } else {
      this.reshuffleIfNeeded();
      if (this.drawPile.length === 0) {
        return this.error(client, "No cards left to draw.");
      }
      const card = this.drawPile.pop()!;
      this.hands[p.seat].push(card);
    }

    p.handCount = this.hands[p.seat].length;
    this.syncPiles();
    this.state.turnPhase = "ACT";
    this.sendHand(p.seat);
  }

  private handlePlay(client: Client, msg: { cardIds?: string[]; seq?: string }) {
    const p = this.requireTurn(client, "ACT");
    if (!p) return;

    const cards = this.takeFromHandPreview(p.seat, msg?.cardIds ?? []);
    if (!cards) return this.error(client, "Those cards aren't in your hand.");

    const beanieRank = this.state.beanieRank as Rank;
    let options = enumeratePlays(cards, beanieRank);

    // Round 14: only a 7-card straight flush may be played.
    if (this.state.round === 14) {
      options = options.filter((o) => o.kind === "FLUSH" && o.cards.length === 7);
      if (options.length === 0) {
        return this.error(client, "Round 14 only allows a 7-card straight flush.");
      }
    }
    if (options.length === 0) {
      return this.error(client, "That's not a valid set or straight flush.");
    }

    // More than one valid reading (e.g. [4,5,🫘] = 3-4-5 or 4-5-6; [4,🫘,🫘] =
    // a Set or several runs). Ask the player to choose unless they already have.
    const chosen = this.chooseOption(options, msg?.seq);
    if (!chosen) {
      return client.send("playOptions", {
        cardIds: msg?.cardIds,
        options: options.map((o) => ({
          seq: o.seq,
          label: o.label,
          kind: o.kind,
          cards: o.cards,
        })),
      });
    }

    const remaining = this.hands[p.seat].length - cards.length;
    if (remaining < 1) {
      return this.error(client, "You must keep a card to discard.");
    }
    if (!this.finishingAllowed() && remaining < 2) {
      return this.error(client, "You can't play out during the first rotation.");
    }

    // Commit: remove cards from hand, add the chosen placement to the field.
    this.removeFromHand(p.seat, cards);
    const fh = new FieldHandSchema();
    fh.id = `f${this.fieldSeq++}`;
    fh.ownerSeat = p.seat;
    fh.kind = chosen.kind;
    fh.cards = toArraySchema(chosen.cards);
    this.state.field.push(fh);

    p.hasPlayed = true;
    p.handCount = this.hands[p.seat].length;

    this.turnPlays += 1;
    this.turnSingle7Flush =
      this.turnPlays === 1 && chosen.kind === "FLUSH" && chosen.cards.length === 7;

    this.sendHand(p.seat);
  }

  /**
   * Resolve which play/insert option to use. A single option is chosen
   * automatically; with several, the caller-supplied `seq` must match one, else
   * null is returned so the caller can prompt the player.
   */
  private chooseOption(options: PlayOption[], seq?: string): PlayOption | null {
    if (options.length === 1) return options[0];
    if (!seq) return null;
    return options.find((o) => o.seq === seq) ?? null;
  }

  private handleInsert(
    client: Client,
    msg: { fieldId?: string; cardId?: string; seq?: string }
  ) {
    const p = this.requireTurn(client, "ACT");
    if (!p) return;
    if (this.guardActionable(client, p) !== true) return;

    const fh = this.state.field.find((f: FieldHandSchema) => f.id === msg?.fieldId);
    if (!fh) return this.error(client, "No such played hand.");

    const card = this.findInHand(p.seat, msg?.cardId);
    if (!card) return this.error(client, "That card isn't in your hand.");

    const res = insertIntoPlacement(
      toPlaced(fh.cards),
      fh.kind as HandKind,
      card,
      this.state.beanieRank as Rank
    );
    if (!res.ok) return this.error(client, res.reason ?? "Can't insert there.");

    // A Beanie that can extend either end of a run gives two placements to pick.
    const chosen = this.chooseOption(res.options!, msg?.seq);
    if (!chosen) {
      return client.send("insertOptions", {
        fieldId: msg?.fieldId,
        cardId: msg?.cardId,
        options: res.options!.map((o) => ({
          seq: o.seq,
          label: o.label,
          kind: o.kind,
          cards: o.cards,
        })),
      });
    }

    const remaining = this.hands[p.seat].length - 1;
    if (remaining < 1) {
      return this.error(client, "You must keep a card to discard.");
    }
    if (!this.finishingAllowed() && remaining < 2) {
      return this.error(client, "You can't play out during the first rotation.");
    }

    this.removeFromHand(p.seat, [card]);
    fh.cards = toArraySchema(chosen.cards);
    fh.kind = chosen.kind;
    p.handCount = this.hands[p.seat].length;

    this.turnInserts += 1;
    this.turnSingle7Flush = false;
    this.sendHand(p.seat);
  }

  private handleReclaim(
    client: Client,
    msg: { fieldId?: string; cardId?: string }
  ) {
    const p = this.requireTurn(client, "ACT");
    if (!p) return;
    if (this.guardActionable(client, p) !== true) return;

    const fh = this.state.field.find((f: FieldHandSchema) => f.id === msg?.fieldId);
    if (!fh) return this.error(client, "No such played hand.");

    const card = this.findInHand(p.seat, msg?.cardId);
    if (!card) return this.error(client, "That card isn't in your hand.");

    const res = reclaimFromPlacement(
      toPlaced(fh.cards),
      fh.kind as HandKind,
      card,
      this.state.beanieRank as Rank
    );
    if (!res.ok) return this.error(client, res.reason ?? "Can't reclaim that.");

    // Swap: provided card into the field hand, beanie back to the player.
    this.removeFromHand(p.seat, [card]);
    this.hands[p.seat].push(res.returnedBeanie!);
    fh.cards = toArraySchema(res.newCards!);
    p.handCount = this.hands[p.seat].length;

    this.turnReclaims += 1;
    this.turnSingle7Flush = false;
    this.sendHand(p.seat);
  }

  private handleDiscard(client: Client, msg: { cardId?: string }) {
    const p = this.requireTurn(client, "ACT");
    if (!p) return;

    const card = this.findInHand(p.seat, msg?.cardId);
    if (!card) return this.error(client, "That card isn't in your hand.");

    this.removeFromHand(p.seat, [card]);
    this.discardPile.push(card);
    // Discarding a Beanie costs 50 points. Apply to the score immediately for
    // instant feedback; finalizeRound accounts for it having already been added.
    if (isBeanie(card, this.state.beanieRank as Rank)) {
      this.roundPenalty[p.seat] += 50;
      p.score += 50;
      this.broadcast("notice", { message: `${p.name} discarded a Beanie 🫘 (+50)` });
    }
    p.handCount = this.hands[p.seat].length;
    this.state.openingTurn = false;
    this.syncPiles();
    this.sendHand(p.seat);

    p.tookTurn = true;

    if (p.handCount === 0) {
      // Winner emptied their hand with the final discard.
      const bonusEligible =
        this.state.round === 14 ||
        (this.turnPlays === 1 &&
          this.turnInserts === 0 &&
          this.turnReclaims === 0 &&
          this.turnSingle7Flush);

      if (bonusEligible) {
        // Winner must choose double/halve before the round finalizes.
        this.state.awaitingBonusSeat = p.seat;
        this.state.roundWinnerName = p.name;
      } else {
        this.finalizeRound(p.seat);
      }
      return;
    }

    // Turn ends normally.
    this.state.completedTurns += 1;
    this.advanceTurn();
  }

  private handleBonus(client: Client, msg: { choice?: string }) {
    const p = this.playerByClient(client);
    if (!p || this.state.awaitingBonusSeat !== p.seat) return;
    const choice: BonusChoice = msg?.choice === "halve" ? "halve" : "double";
    this.finalizeRound(p.seat, choice);
    this.state.awaitingBonusSeat = -1;
  }

  // ---------------------------------------------------------------- round end

  private finalizeRound(winnerSeat: number, bonus?: BonusChoice) {
    const beanieRank = this.state.beanieRank as Rank;
    const base = scoreRound(this.hands, winnerSeat, beanieRank);
    // Beanie-discard penalties were already added to p.score during the round,
    // so cumulative only needs the round's hand points added here.
    let cumulative = this.state.players.map((p: PlayerSchema) => p.score + base[p.seat]);
    if (bonus) {
      cumulative = applyBonus(cumulative, winnerSeat, bonus);
      this.state.lastBonus = bonus;
      const ev = new BonusEventSchema();
      ev.round = this.state.round;
      ev.winnerSeat = winnerSeat;
      ev.choice = bonus;
      this.state.bonuses.push(ev);
    }
    this.state.players.forEach((p: PlayerSchema) => {
      const penalty = this.roundPenalty[p.seat] ?? 0;
      p.roundPoints.push(base[p.seat] + penalty); // points this round (incl. penalties)
      p.roundPenalties.push(penalty);
      p.score = cumulative[p.seat]; // cumulative total (incl. any bonus)
    });
    this.state.roundWinnerName = this.state.players[winnerSeat]!.name;

    if (this.state.round >= 14) {
      this.state.phase = "GAME_OVER";
    } else {
      this.state.phase = "ROUND_END";
    }
  }

  // ---------------------------------------------------------------- turn helpers

  private advanceTurn() {
    const n = this.state.players.length;
    this.state.turnSeat = (this.state.turnSeat + 1) % n;
    this.state.turnPhase = "DRAW";
    this.state.openingTurn = false;
    this.resetTurnTracking();
  }

  private finishingAllowed(): boolean {
    return this.state.completedTurns >= this.state.players.length;
  }

  private reshuffleIfNeeded() {
    if (this.drawPile.length > 0) return;
    if (this.discardPile.length <= 1) return;
    const top = this.discardPile.pop()!; // keep the visible top
    this.drawPile = shuffle(this.discardPile, this.rng);
    this.discardPile = [top];
    this.syncPiles();
  }

  // ---------------------------------------------------------------- guards

  private requireHost(client: Client): boolean {
    const p = this.playerByClient(client);
    if (!p || !p.isHost) {
      this.error(client, "Only the host can do that.");
      return false;
    }
    return true;
  }

  private requireTurn(client: Client, phase: string): PlayerSchema | null {
    if (this.state.phase !== "PLAYING") {
      this.error(client, "The game isn't in play.");
      return null;
    }
    if (this.state.awaitingBonusSeat !== -1) {
      this.error(client, "Waiting for the winner's bonus choice.");
      return null;
    }
    const p = this.playerByClient(client);
    if (!p || p.seat !== this.state.turnSeat) {
      this.error(client, "It's not your turn.");
      return null;
    }
    if (this.state.turnPhase !== phase) {
      this.error(
        client,
        phase === "DRAW" ? "You've already drawn." : "You need to draw first."
      );
      return null;
    }
    return p;
  }

  /** Common gate for insert/reclaim: not round 14, must have played. */
  private guardActionable(client: Client, p: PlayerSchema): true | void {
    if (this.state.round === 14) {
      return void this.error(client, "Round 14 only allows a 7-card straight flush.");
    }
    if (!p.hasPlayed) {
      return void this.error(
        client,
        "You must play a hand of your own before inserting."
      );
    }
    return true;
  }

  // ---------------------------------------------------------------- hand utils

  private playerByClient(client: Client): PlayerSchema | undefined {
    return this.state.players.find((p: PlayerSchema) => p.id === client.sessionId);
  }

  private findInHand(seat: number, id?: string): Card | undefined {
    if (!id) return undefined;
    return this.hands[seat].find((c) => cardId(c) === id);
  }

  /** Resolve a list of card ids to cards WITHOUT mutating the hand. */
  private takeFromHandPreview(seat: number, ids: string[]): Card[] | null {
    const out: Card[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) return null;
      seen.add(id);
      const card = this.hands[seat].find((c) => cardId(c) === id);
      if (!card) return null;
      out.push(card);
    }
    return out;
  }

  private removeFromHand(seat: number, cards: Card[]) {
    for (const card of cards) {
      const idx = this.hands[seat].findIndex((c) => cardId(c) === cardId(card));
      if (idx >= 0) this.hands[seat].splice(idx, 1);
    }
  }

  private syncPiles() {
    this.state.drawCount = this.drawPile.length;
    const top = this.discardPile[this.discardPile.length - 1];
    this.state.hasDiscard = !!top;
    if (top) {
      this.state.discardTop.rank = top.rank;
      this.state.discardTop.suit = top.suit;
    }
  }

  private sendHand(seat: number) {
    const client = this.seatClients[seat];
    if (!client) return;
    client.send("hand", {
      cards: this.hands[seat].map((c) => ({
        rank: c.rank,
        suit: c.suit,
        id: cardId(c),
      })),
    });
  }

  private error(client: Client, message: string) {
    client.send("error", { message });
  }
}
