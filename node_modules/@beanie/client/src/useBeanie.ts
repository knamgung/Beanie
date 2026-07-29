import { useSyncExternalStore } from "react";
import { store } from "./store";

/** Re-renders the component whenever the store emits a new version. */
export function useBeanie() {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return store;
}
