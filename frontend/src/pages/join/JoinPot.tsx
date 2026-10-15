import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, QrCode } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import { joinGroup } from "../../lib/api";
import { extractJoinCode } from "../../lib/join";

// Loaded on demand so the QR decoder never lands in the main bundle.
const QrScanner = lazy(() => import("../../components/QrScanner"));

type Status = "idle" | "joining" | "done" | "error";

// Reachable two ways: /join (type or scan a code) and /join/:code (a scanned
// QR link lands straight here and joins automatically).
export default function JoinPot() {
  const { code: codeParam } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { refresh, setActiveGroupById } = useGroup();

  const [code, setCode] = useState(codeParam?.toUpperCase() ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [groupName, setGroupName] = useState("");
  const [scanning, setScanning] = useState(false);
  const startedRef = useRef(false);
  const redirectRef = useRef<number>(0);

  const submit = useCallback(
    async (raw: string) => {
      const value = extractJoinCode(raw);
      if (!value) {
        setError("Enter the join code your treasurer shared.");
        setStatus("error");
        return;
      }
      setCode(value);
      setError("");
      setStatus("joining");
      try {
        const group = await joinGroup(value);
        await refresh();
        setActiveGroupById(group.id);
        setGroupName(group.name);
        setStatus("done");
        redirectRef.current = window.setTimeout(
          () => navigate("/dashboard", { replace: true }),
          900
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't join that pot.");
        setStatus("error");
      }
    },
    [navigate, refresh, setActiveGroupById]
  );

  // A scanned /join/CODE link joins as soon as the page opens.
  useEffect(() => {
    if (codeParam && !startedRef.current) {
      startedRef.current = true;
      submit(codeParam);
    }
    return () => window.clearTimeout(redirectRef.current);
  }, [codeParam, submit]);

  const onScan = (text: string) => {
    setScanning(false);
    submit(text);
  };

  return (
    <AppShell>
      <PageHeader title="Join a pot" subtitle="Use the code your treasurer shared, or scan their QR." />

      <div className="mx-auto mt-2 max-w-xl">
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          {status === "joining" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
              <p className="text-sm text-slate-500">Joining pot {code}…</p>
            </div>
          )}

          {status === "done" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              <p className="font-sora text-lg font-bold text-slate-900">You're in!</p>
              <p className="text-sm text-slate-500">
                Joined <span className="font-semibold text-slate-700">{groupName}</span>. Taking you to the dashboard…
              </p>
              <Link
                to="/dashboard"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
              >
                Go now <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}

          {(status === "idle" || status === "error") && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600">
                  <QrCode className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="font-sora text-lg font-bold text-slate-900">Enter a join code</h2>
                  <p className="text-sm text-slate-500">Six letters and numbers, e.g. NQ6Z8N.</p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(code);
                }}
                className="mt-6 space-y-4"
              >
                <input
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="NQ6Z8N"
                  autoCapitalize="characters"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center font-sora text-2xl font-bold tracking-[0.4em] text-slate-800 placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />

                {error && (
                  <p className="flex items-center gap-1.5 text-sm text-rose-600">
                    <AlertCircle className="h-4 w-4" /> {error}
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="submit" className="cp-btn-primary flex-1">
                    Join pot
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanning(true)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
                  >
                    <QrCode className="h-4 w-4" /> Scan QR
                  </button>
                </div>
              </form>

              <p className="mt-5 text-center text-xs text-slate-400">
                Tip: if you're with someone who's already in the pot, scan the QR on their Members page.
              </p>
            </>
          )}
        </div>
      </div>

      {scanning && (
        <Suspense fallback={null}>
          <QrScanner onResult={onScan} onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </AppShell>
  );
}
