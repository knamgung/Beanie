import { useState } from "react";
import { useBeanie } from "../useBeanie";

export function Home() {
  const store = useBeanie();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");

  const canGo = name.trim().length > 0 && (mode === "create" || code.trim().length > 0);

  const go = () => {
    if (!canGo || store.connecting) return;
    if (mode === "create") store.create(name.trim());
    else store.join(code, name.trim());
  };

  return (
    <div className="home">
      <h1 className="home__title">🫘 Beanie</h1>
      <p className="home__subtitle">A turn-based card game for 2–4 friends.</p>

      {store.hasSavedSession() && (
        <div className="home__rejoin">
          <span>You have a game in progress.</span>
          <button className="btn btn--primary" disabled={store.connecting} onClick={() => store.resume(true)}>
            {store.connecting ? "Rejoining…" : "Rejoin game"}
          </button>
        </div>
      )}

      <div className="home__card">
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={20}
            placeholder="e.g. Bean"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
          />
        </label>

        <div className="tabs">
          <button
            className={mode === "create" ? "tab tab--active" : "tab"}
            onClick={() => setMode("create")}
          >
            Create table
          </button>
          <button
            className={mode === "join" ? "tab tab--active" : "tab"}
            onClick={() => setMode("join")}
          >
            Join table
          </button>
        </div>

        {mode === "join" && (
          <label className="field">
            <span>Room code</span>
            <input
              value={code}
              placeholder="paste the code"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
            />
          </label>
        )}

        <button className="btn btn--primary btn--big" disabled={!canGo || store.connecting} onClick={go}>
          {store.connecting ? "Connecting…" : mode === "create" ? "Create table" : "Join table"}
        </button>
      </div>
    </div>
  );
}
