// Sound effects, via the Web Audio API.
//
// Why not <audio>: cloning an HTMLAudioElement to allow overlap copies the src
// but not the decoded audio, so every play() re-fetches + re-decodes before any
// sound comes out — audible latency, worst on the longest clip (turn-start),
// which also made it drop intermittently when play() raced its own load. Web
// Audio decodes each clip ONCE into a buffer; playing fires a cheap one-shot
// buffer source that starts immediately and overlaps freely. A single gesture
// unlocks the context, after which sounds triggered by network events (another
// player's move) play reliably too. Master volume runs through a GainNode.
//
// Vite turns each import into a hashed asset URL at build time.
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
  | "playingCard" // a hand was played/discarded, or a beanie inserted/reclaimed
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
  volume = 1; // 0 (silent) .. 1 (full)
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = {} as Record<SoundName, AudioBuffer>;

  constructor() {
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

    if (typeof window === "undefined") return;
    // Create the context and decode clips ahead of time (no gesture needed to
    // decode; only playback needs the context running). Starts suspended.
    this.ensureContext();

    // Unlock on the first user gesture (Safari requires resume() in a gesture).
    // One resume() covers every later play, including network-triggered ones.
    const unlock = () => {
      this.ctx?.resume().catch(() => {});
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
  }

  private ensureContext() {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return; // no Web Audio support — degrade to silence
    this.ctx = new Ctx();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.volume;
    this.gain.connect(this.ctx.destination);

    for (const [name, url] of Object.entries(SOURCES)) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((data) => this.ctx!.decodeAudioData(data))
        .then((buf) => {
          this.buffers[name as SoundName] = buf;
        })
        .catch(() => {
          /* a clip that fails to load simply won't play */
        });
    }
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.gain) this.gain.gain.value = this.volume;
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      /* preference simply won't persist */
    }
  }

  play(name: SoundName) {
    if (this.volume <= 0) return;
    const ctx = this.ctx;
    const buf = this.buffers[name];
    if (!ctx || !buf) return; // context missing or clip not decoded yet
    // Wake the context if it was suspended (backgrounded tab / pre-unlock).
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain ?? ctx.destination);
    src.start(0);
  }
}

export const sound = new Sound();
