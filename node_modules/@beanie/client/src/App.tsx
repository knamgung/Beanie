import { useBeanie } from "./useBeanie";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Table } from "./screens/Table";

export function App() {
  const store = useBeanie();
  const s = store.snapshot;

  let screen;
  if (store.connecting && !store.room)
    screen = <div className="splash">Reconnecting…</div>;
  else if (!store.room || !s) screen = <Home />;
  else if (s.phase === "LOBBY") screen = <Lobby />;
  else screen = <Table />;

  return (
    <div className="app">
      {screen}
      {store.notice && <div className="toast toast--notice">{store.notice}</div>}
      {store.error && (
        <div className="toast" onClick={() => store.clearError()}>
          {store.error}
          <span className="toast__dismiss">✕</span>
        </div>
      )}
    </div>
  );
}
