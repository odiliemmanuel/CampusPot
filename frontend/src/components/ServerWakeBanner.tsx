import { useEffect, useState } from "react";
import { Loader2, WifiOff } from "lucide-react";

// API root (without the /api/v1 suffix) so we can hit /healthz.
const API_ROOT = (import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1").replace(
  /\/api\/v1\/?$/,
  ""
);

// ServerWakeBanner pings the API on load and explains the delay when the
// Render free-tier instance is cold-starting (it sleeps after inactivity).
// It disappears the moment the server answers.
export default function ServerWakeBanner() {
  const [phase, setPhase] = useState<"ok" | "slow" | "down">("ok");

  useEffect(() => {
    let cancelled = false;
    let done = false;

    const slowTimer = window.setTimeout(() => {
      if (!cancelled && !done) setPhase("slow");
    }, 2500);

    const check = async () => {
      try {
        const res = await fetch(`${API_ROOT}/healthz`, { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        if (cancelled) return;
        done = true;
        setPhase("ok");
      } catch {
        if (cancelled) return;
        setPhase("down");
        window.setTimeout(check, 4000);
      }
    };
    check();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
  }, []);

  if (phase === "ok") return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[100] flex max-w-[92vw] -translate-x-1/2 items-center gap-2.5 rounded-full border border-slate-200 bg-white/95 px-4 py-2.5 text-sm text-slate-700 shadow-lg backdrop-blur"
    >
      {phase === "slow" ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
          <span>Waking up the CampusPot server… the first load can take up to a minute.</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 text-amber-500" />
          <span>Can’t reach the CampusPot server yet — retrying…</span>
        </>
      )}
    </div>
  );
}
