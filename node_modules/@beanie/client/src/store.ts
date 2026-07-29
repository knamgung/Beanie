// Wraps the Colyseus client/room and exposes a snapshot of synced state plus the
// player's private hand. React subscribes via a version counter (see useBeanie).

import { Client, Room } from "colyseus.js";

// Default to the same host the page was loaded from, so a friend who opens
// http://192.168.1.20:5173 automatically connects to ws://192.168.1.20:2567.
// Override with VITE_SERVER when server and client live at different addresses.
const ENDPOINT =
  (import.meta as any).env?.VITE_SERVER ??
  `ws://${location.hostname}:2567`;

export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  isHost: boolean;
  score: number;
  roundPoints: number[];
  roundPenalties: number[];
  handCount: number;
  hasPlayed: boolean;
  tookTurn: boolean;
}

export interface CardView {
  rank: number;
  suit: string;
}

export interface FieldHandView {
  id: string;
  ownerSeat: number;
  kind: string;
  cards: CardView[];
}

export interface BonusEventView {
  round: number;
  winnerSeat: number;
  choice: string; // double | halve
}

export interface Snapshot {
  phase: string;
  round: number;
  beanieRank: number;
  starterSeat: number;
  turnSeat: number;
  turnPhase: string;
  openingTurn: boolean;
  completedTurns: number;
  drawCount: number;
  discardTop: CardView | null;
  hasDiscard: boolean;
  wheelResult: number;
  awaitingBonusSeat: number;
  roundWinnerName: string;
  lastBonus: string;
  players: PlayerView[];
  field: FieldHandView[];
  bonuses: BonusEventView[];
}

export interface HandCard {
  rank: number;
  suit: string;
  id: string;
}

function toPlain(s: any): Snapshot {
  return {
    phase: s.phase,
    round: s.round,
    beanieRank: s.beanieRank,
    starterSeat: s.starterSeat,
    turnSeat: s.turnSeat,
    turnPhase: s.turnPhase,
    openingTurn: s.openingTurn,
    completedTurns: s.completedTurns,
    drawCount: s.drawCount,
    hasDiscard: s.hasDiscard,
    discardTop: s.hasDiscard
      ? { rank: s.discardTop.rank, suit: s.discardTop.suit }
      : null,
    wheelResult: s.wheelResult,
    awaitingBonusSeat: s.awaitingBonusSeat,
    roundWinnerName: s.roundWinnerName,
    lastBonus: s.lastBonus,
    players: Array.from(s.players, (p: any) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      connected: p.connected,
      isHost: p.isHost,
      score: p.score,
      roundPoints: Array.from(p.roundPoints, (n: any) => n as number),
      roundPenalties: Array.from(p.roundPenalties, (n: any) => n as number),
      handCount: p.handCount,
      hasPlayed: p.hasPlayed,
      tookTurn: p.tookTurn,
    })),
    field: Array.from(s.field, (f: any) => ({
      id: f.id,
      ownerSeat: f.ownerSeat,
      kind: f.kind,
      cards: Array.from(f.cards, (c: any) => ({ rank: c.rank, suit: c.suit })),
    })),
    bonuses: Array.from(s.bonuses, (b: any) => ({
      round: b.round,
      winnerSeat: b.winnerSeat,
      choice: b.choice,
    })),
  };
}

function bySuitThenRank(a: HandCard, b: HandCard): number {
  return a.suit.localeCompare(b.suit) || a.rank - b.rank;
}

const SESSION_KEY = "beanie:session";

function byRankThenSuit(a: HandCard, b: HandCard): number {
  return a.rank - b.rank || a.suit.localeCompare(b.suit);
}

class BeanieStore {
  private client = new Client(ENDPOINT);
  room: Room | null = null;
  snapshot: Snapshot | null = null;
  hand: HandCard[] = [];
  private order: string[] = []; // player's chosen left-to-right hand order (card ids)
  error: string | null = null;
  notice: string | null = null;
  connecting = false;
  sessionId = "";
  roomCode = "";

  version = 0;
  private listeners = new Set<() => void>();

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  get mySeat(): number {
    return this.snapshot?.players.find((p) => p.id === this.sessionId)?.seat ?? -1;
  }

  async create(name: string) {
    await this.enter(() => this.client.create("beanie", { name }));
  }
  async join(code: string, name: string) {
    await this.enter(() => this.client.joinById(code.trim(), { name }));
  }

  /** True if a resumable session token is saved (e.g. after a refresh). */
  hasSavedSession(): boolean {
    return !!this.readSession()?.token;
  }

  /** Attempt to rejoin a held seat using the saved reconnection token. */
  async resume(manual = false): Promise<boolean> {
    const saved = this.readSession();
    if (!saved?.token) return false;
    this.connecting = true;
    this.error = null;
    this.emit();
    try {
      const room = await this.client.reconnect(saved.token);
      this.bind(room);
      return true;
    } catch {
      this.clearSession(); // token expired or seat gone — fall back to home
      if (manual) {
        this.error =
          "Couldn't rejoin — that game has ended or the rejoin window has passed.";
      }
      return false;
    } finally {
      this.connecting = false;
      this.emit();
    }
  }

  /** Leave intentionally: drop the seat and forget the session. */
  leaveGame() {
    this.clearSession();
    this.room?.leave();
    this.room = null;
    this.snapshot = null;
    this.emit();
  }

  private async enter(fn: () => Promise<Room>) {
    this.connecting = true;
    this.error = null;
    this.emit();
    try {
      const room = await fn();
      this.bind(room);
    } catch (e: any) {
      this.error = e?.message ?? "Could not connect. Is the server running?";
    } finally {
      this.connecting = false;
      this.emit();
    }
  }

  private bind(room: Room) {
    this.room = room;
    this.sessionId = room.sessionId;
    this.roomCode = room.roomId;
    this.hand = [];
    this.order = [];
    this.saveSession(room);

    room.onStateChange((state: any) => {
      this.snapshot = toPlain(state);
      // A finished game isn't worth resuming into.
      if (state.phase === "GAME_OVER") this.clearSession();
      this.emit();
    });
    room.onMessage("hand", (msg: any) => {
      this.hand = msg.cards ?? [];
      this.reconcileOrder();
      this.emit();
    });
    room.onMessage("error", (msg: any) => {
      this.error = msg.message;
      this.emit();
    });
    room.onMessage("notice", (msg: any) => {
      this.notice = msg.message;
      this.emit();
      setTimeout(() => {
        if (this.notice === msg.message) {
          this.notice = null;
          this.emit();
        }
      }, 3500);
    });
    room.onLeave((code: number) => {
      this.room = null;
      this.snapshot = null;
      this.emit();
      // Unexpected drop (not a clean 1000 close) → try to reclaim the seat
      // within the server's reconnection window.
      if (code !== 1000 && this.readSession()?.token) this.resume();
    });

    // Ask the server to (re)send our private hand once handlers are attached,
    // so a join/resume never misses the initial hand due to a race.
    room.send("requestHand");
  }

  private saveSession(room: Room) {
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ token: room.reconnectionToken })
      );
    } catch {
      /* storage unavailable — reconnection simply won't persist */
    }
  }
  private readSession(): { token?: string } | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  private clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Cards in the player's chosen order (reconciled with the latest hand). */
  orderedHand(): HandCard[] {
    const byId = new Map(this.hand.map((c) => [c.id, c] as const));
    const out: HandCard[] = [];
    for (const id of this.order) {
      const c = byId.get(id);
      if (c) out.push(c);
    }
    return out;
  }

  /**
   * Keep the existing arrangement, drop cards no longer held, and append newly
   * received cards at the end. On the first hand, start sorted by suit & rank.
   */
  private reconcileOrder() {
    const present = new Set(this.hand.map((c) => c.id));
    const kept = this.order.filter((id) => present.has(id));
    const keptSet = new Set(kept);
    const fresh = this.hand.filter((c) => !keptSet.has(c.id));
    if (this.order.length === 0) fresh.sort(bySuitThenRank);
    this.order = [...kept, ...fresh.map((c) => c.id)];
  }

  /** Replace the hand order outright (used by the drag library). */
  setHandOrder(ids: string[]) {
    this.order = ids;
    this.emit();
  }

  /** Reset to a sorted order: grouped by suit, or grouped by rank. */
  sortHand(mode: "suit" | "rank" = "suit") {
    const cmp = mode === "rank" ? byRankThenSuit : bySuitThenRank;
    this.order = [...this.hand].sort(cmp).map((c) => c.id);
    this.emit();
  }

  send(type: string, payload?: any) {
    this.room?.send(type, payload);
  }
  clearError() {
    this.error = null;
    this.emit();
  }
}

export const store = new BeanieStore();
