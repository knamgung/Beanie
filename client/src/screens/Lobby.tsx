import { useEffect, useRef, useState } from "react";
import { useBeanie } from "../useBeanie";

// Kept in sync with the CSS easing; the "Spinning…" gate lifts when it lands.
const SPIN_MS = 3800;
const SEGMENT_COLORS = ["#1d7a46", "#2a9d8f", "#b8860b", "#7a1d5a"];

export function Lobby() {
  const store = useBeanie();
  const s = store.snapshot!;
  const me = s.players.find((p) => p.seat === store.mySeat);
  const isHost = !!me?.isHost;
  const n = s.players.length;
  const seg = n > 0 ? 360 / n : 360;

  // The wheel's rotation only ever increases; each spin adds ≥4 full turns and
  // lands the chosen segment's centre under the top pointer.
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const prevNonce = useRef(s.wheelNonce);
  const rotationRef = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (s.wheelNonce === prevNonce.current) return;
    prevNonce.current = s.wheelNonce;
    if (s.wheelResult < 0 || s.wheelResult >= n) return;

    const centreAngle = s.wheelResult * seg + seg / 2;
    const targetMod = (360 - (centreAngle % 360)) % 360; // rotation to put it at top
    const current = rotationRef.current;
    let next = current - (current % 360) + targetMod;
    while (next < current + 360 * 4) next += 360; // at least four full spins forward
    rotationRef.current = next;
    setRotation(next);

    setSpinning(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSpinning(false), SPIN_MS);
  }, [s.wheelNonce, s.wheelResult, n, seg]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const gradient =
    n > 0
      ? `conic-gradient(${s.players
          .map(
            (p, i) =>
              `${SEGMENT_COLORS[i % SEGMENT_COLORS.length]} ${i * seg}deg ${(i + 1) * seg}deg`
          )
          .join(", ")})`
      : SEGMENT_COLORS[0];

  const landedName =
    !spinning && s.wheelResult >= 0 && s.wheelResult < n
      ? s.players.find((p) => p.seat === s.wheelResult)?.name
      : null;

  // Leave/cancel the lobby. A host with others present hands off; solo, this
  // disposes the room. Confirm first when it affects other players.
  const leaveLobby = () => {
    const others = n - 1;
    const msg = isHost
      ? others > 0
        ? "Leave the lobby? The next player becomes host."
        : "Cancel this lobby?"
      : "Leave this lobby?";
    if (window.confirm(msg)) store.leaveGame();
  };

  return (
    <div className="lobby">
      <h2>Table lobby</h2>

      <div className="lobby__code">
        <span>Room code</span>
        <code onClick={() => navigator.clipboard?.writeText(store.roomCode)} title="Click to copy">
          {store.roomCode}
        </code>
        <small>Share this with friends so they can join.</small>
      </div>

      <div className="lobby__players">
        {s.players.map((p) => (
          <div key={p.seat} className={`seat ${p.seat === s.wheelResult && !spinning ? "seat--picked" : ""}`}>
            <span className="seat__name">{p.name}</span>
            {p.isHost && <span className="tag">host</span>}
            {p.seat === store.mySeat && <span className="tag tag--you">you</span>}
          </div>
        ))}
        {Array.from({ length: 4 - s.players.length }).map((_, i) => (
          <div key={`empty-${i}`} className="seat seat--empty">
            waiting…
          </div>
        ))}
      </div>

      <div className="wheel-wrap">
        <div className="wheel-pointer" />
        <div
          className="wheel"
          style={{
            background: gradient,
            transform: `rotate(${rotation}deg)`,
            transition: `transform ${SPIN_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          }}
        >
          {s.players.map((p, i) => (
            <div
              key={p.seat}
              className="wheel__label"
              style={{ transform: `rotate(${i * seg + seg / 2}deg)` }}
            >
              <span>{p.name}</span>
            </div>
          ))}
        </div>
        <div className="wheel__hub">🫘</div>
      </div>

      {spinning ? (
        <p className="lobby__wheel">🎡 Spinning…</p>
      ) : landedName ? (
        <p className="lobby__wheel">
          🎡 The wheel picked <strong>{landedName}</strong> to start.
        </p>
      ) : null}

      <p className="lobby__note">
        14 rounds · wild rank rotates A→K→A · lowest total score wins.
      </p>

      {isHost ? (
        <div className="lobby__actions">
          <button className="btn" disabled={spinning} onClick={() => store.send("spinWheel")}>
            🎡 Spin the wheel
          </button>
          <button
            className="btn btn--primary"
            disabled={s.players.length < 2 || spinning}
            onClick={() => store.send("startGame")}
          >
            Start game
          </button>
          <button className="btn btn--ghost" disabled={spinning} onClick={leaveLobby}>
            {n > 1 ? "Leave" : "Cancel lobby"}
          </button>
        </div>
      ) : (
        <div className="lobby__actions">
          <p className="lobby__note">Waiting for the host to start…</p>
          <button className="btn btn--ghost" onClick={leaveLobby}>
            Leave lobby
          </button>
        </div>
      )}
    </div>
  );
}
