// Keeps the API warm for as long as the app is open.
//
// The Render backend sleeps after ~15 minutes idle, so the next request then
// pays a slow cold-start. This pings a cheap endpoint the moment the app loads
// (before login) and then every 13 minutes, plus whenever the tab regains
// focus, so the backend is already awake by the time the user does anything.
import { apiOrigin } from "./api";

const PING_INTERVAL_MS = 13 * 60 * 1000;

let started = false;

async function ping() {
  try {
    // no-cors keeps the request a simple, un-preflighted GET; the endpoint only
    // needs to be hit, not read, so the opaque response is fine.
    await fetch(`${apiOrigin}/health`, { method: "GET", mode: "no-cors", cache: "no-store" });
  } catch {
    /* backend asleep/unreachable — the next tick retries */
  }
}

/** Start warming the API. Safe to call multiple times; only the first runs. */
export function startKeepAlive() {
  if (started || typeof window === "undefined") return;
  started = true;

  void ping();
  window.setInterval(() => void ping(), PING_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void ping();
  });
}
