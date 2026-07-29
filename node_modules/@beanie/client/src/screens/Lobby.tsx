import { useBeanie } from "../useBeanie";

export function Lobby() {
  const store = useBeanie();
  const s = store.snapshot!;
  const me = s.players.find((p) => p.seat === store.mySeat);
  const isHost = !!me?.isHost;
  const wheelName =
    s.wheelResult >= 0 ? s.players.find((p) => p.seat === s.wheelResult)?.name : null;

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
          <div key={p.seat} className={`seat ${p.seat === s.wheelResult ? "seat--picked" : ""}`}>
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

      {wheelName && (
        <p className="lobby__wheel">
          🎡 The wheel picked <strong>{wheelName}</strong> to start.
        </p>
      )}

      <p className="lobby__note">
        14 rounds · wild rank rotates A→K→A · lowest total score wins.
      </p>

      {isHost ? (
        <div className="lobby__actions">
          <button className="btn" onClick={() => store.send("spinWheel")}>
            🎡 Spin the wheel
          </button>
          <button
            className="btn btn--primary"
            disabled={s.players.length < 2}
            onClick={() => store.send("startGame")}
          >
            Start game
          </button>
        </div>
      ) : (
        <p className="lobby__note">Waiting for the host to start…</p>
      )}
    </div>
  );
}
