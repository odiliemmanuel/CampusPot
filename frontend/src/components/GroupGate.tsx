import { lazy, Suspense, useState, type FormEvent, type ReactNode } from "react";
import { HandCoins, Plus, LogIn, QrCode } from "lucide-react";
import { useGroup } from "../providers/GroupProvider";
import { createGroup, joinGroup } from "../lib/api";
import { extractJoinCode } from "../lib/join";
import { nairaToKobo } from "../lib/format";

// Loaded on demand so the QR decoder never lands in the main bundle.
const QrScanner = lazy(() => import("./QrScanner"));

// Every feature page needs an active pot. GroupGate shows the "no pot yet"
// onboarding (create or join) until the signed-in user belongs to one.
export default function GroupGate({ children }: { children: ReactNode }) {
  const { groups, loading, refresh } = useGroup();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [nairaInput, setNairaInput] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  // Still resolving the user's groups.
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
      </div>
    );
  }

  // Already in a pot — render the page.
  if (groups.length > 0) return <>{children}</>;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await createGroup(name, 2, 3, nairaToKobo(nairaInput));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the pot.");
    } finally {
      setBusy(false);
    }
  };

  const join = async (raw: string) => {
    const value = extractJoinCode(raw);
    if (!value) {
      setError("Enter the join code your treasurer shared.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await joinGroup(value);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join that pot.");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    join(joinCode);
  };

  return (
    <div className="max-w-xl mx-auto mt-6">
      <div className="rounded-3xl cp-card p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-primary-600 flex items-center justify-center">
            <HandCoins className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-sora text-xl font-bold text-slate-900 dark:text-white">
              {mode === "create" ? "Start a pot" : "Join a pot"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {mode === "create"
                ? "Give your class or society a shared wallet."
                : "Enter the join code your treasurer shared."}
            </p>
          </div>
        </div>

        <div className="flex gap-2 my-5">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${
              mode === "create" ? "bg-primary-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            <Plus className="w-4 h-4" /> Create
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition ${
              mode === "join" ? "bg-primary-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            <LogIn className="w-4 h-4" /> Join
          </button>
        </div>

        {mode === "create" ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Pot name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 200L Mass Comm Dues"
                className="cp-input mt-1.5"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Large-spend alert (₦, optional)
              </label>
              <input
                value={nairaInput}
                onChange={(e) => setNairaInput(e.target.value)}
                placeholder="e.g. 20000"
                className="cp-input mt-1.5"
              />
              <p className="text-xs text-slate-400 mt-1">Payouts above this are flagged high-risk.</p>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={busy} className="cp-btn-primary w-full">
              {busy ? "Creating..." : "Create pot"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Join code</label>
              <input
                required
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. 4WMZFR"
                className="cp-input mt-1.5 tracking-widest font-semibold"
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="submit" disabled={busy} className="cp-btn-primary flex-1">
                {busy ? "Joining..." : "Join pot"}
              </button>
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-100 dark:border-primary-800/50 dark:bg-primary-900/30 dark:text-primary-300"
              >
                <QrCode className="w-4 h-4" /> Scan QR
              </button>
            </div>
          </form>
        )}
      </div>

      {scanning && (
        <Suspense fallback={null}>
          <QrScanner onResult={(text) => { setScanning(false); join(text); }} onClose={() => setScanning(false)} />
        </Suspense>
      )}
    </div>
  );
}
