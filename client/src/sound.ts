// Sound effects. Vite turns each import into a hashed asset URL at build time,
// so the files just live in assets/sounds/ and are referenced by name here.
import turnStartUrl from "./assets/sounds/turn-start.mp3";
import roundEndUrl from "./assets/sounds/round-end.mp3";
import playingCardUrl from "./assets/sounds/playing-card.mp3";
import gameEndUrl from "./assets/sounds/game-end.mp3";
import errorUrl from "./assets/sounds/error.mp3";
import drawCardUrl from "./assets/sounds/draw-card.mp3";
import beanieDropUrl from "./assets/sounds/beanie-drop.mp3";

export type SoundName =
  | "turnStart" // your turn just began
  | "roundEnd" // a round finished
  | "playingCard" // a hand was played, or a beanie inserted/reclaimed
  | "gameEnd" // the whole game finished (after round 14)
  | "error" // the server rejected an action
  | "drawCard" // a card was drawn from the pile or discard
  | "beanieDrop"; // a beanie was discarded (50-point penalty)

const SOURCES: Record<SoundName, string> = {
  turnStart: turnStartUrl,
  roundEnd: roundEndUrl,
  playingCard: playingCardUrl,
  gameEnd: gameEndUrl,
  error: errorUrl,
  drawCard: drawCardUrl,
  beanieDrop: beanieDropUrl,
};

const VOLUME_KEY = "beanie:volume";

class Sound {
  private els = {} as Record<SoundName, HTMLAudioElement>;
  volume = 1; // 0 (silent) .. 1 (full)

  constructor() {
    // Preload so the first play has no fetch delay.
    for (const [name, url] of Object.entries(SOURCES)) {
      const el = new Audio(url);
      el.preload = "auto";
      this.els[name as SoundName] = el;
    }
    // Restore the player's volume preference across sessions.
    try {
      const raw = localStorage.getItem(VOLUME_KEY);
      if (raw !== null) {
        const v = parseFloat(raw);
        if (!Number.isNaN(v)) this.volume = Math.min(1, Math.max(0, v));
      }
    } catch {
      /* storage unavailable — default to full volume */
    }
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      /* preference simply won't persist */
    }
  }

  play(name: SoundName) {
    if (this.volume <= 0) return;
    const base = this.els[name];
    if (!base) return;
    // Play a fresh clone each time. Reusing one element and resetting
    // currentTime races with an in-flight play()/seek — the browser then
    // rejects the new play() as "interrupted" and the sound silently drops
    // (worst for rapid, longer clips like turn-start). A clone plays
    // independently; the preloaded base keeps the file warm in cache.
    const el = base.cloneNode(true) as HTMLAudioElement;
    el.volume = this.volume;
    el.play().catch(() => {});
  }
}

export const sound = new Sound();
