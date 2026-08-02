import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { store } from "./store";
import "./styles.css";

// Mobile browsers often reload a backgrounded tab (e.g. after you switch apps
// to share the room code). If a session token is saved, silently try to rejoin
// so you land back in your lobby/game instead of an empty Home screen. resume()
// falls back to Home on its own if the session has expired.
if (store.hasSavedSession()) store.resume();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
