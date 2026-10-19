import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { startKeepAlive } from "./lib/keepAlive";
import "./index.css";

// Warm the API as soon as the app loads so the first sign-in doesn't pay the
// backend's cold-start cost.
startKeepAlive();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register the service worker in production so the app can be installed and
// opened offline. Skipped in dev to avoid caching stale modules.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
