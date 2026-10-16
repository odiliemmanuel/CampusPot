import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { HandCoins, Loader2 } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import PageHeader from "../../components/PageHeader";
import VoicePotButton from "../../components/VoicePotButton";
import { useGroup } from "../../providers/GroupProvider";
import { createGroup } from "../../lib/api";
import { nairaToKobo } from "../../lib/format";

// Dedicated page for starting an additional pot. Users who already belong to a
// pot reach this from the pot switcher; new users reach it from the onboarding
// gate. Either way it creates the pot, makes the caller its treasurer, and
// switches to it.
export default function NewPot() {
  const navigate = useNavigate();
  const { refresh, setActiveGroupById } = useGroup();

  const [name, setName] = useState("");
  const [nairaInput, setNairaInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const group = await createGroup(name, 2, 3, nairaToKobo(nairaInput));
      await refresh();
      setActiveGroupById(group.id);
      navigate(`/pots/${group.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the pot.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Start a new pot"
        subtitle="Give another class, society or trip its own shared wallet."
      />

      <div className="mx-auto mt-2 max-w-xl">
        <div className="rounded-3xl cp-card p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl bg-primary-600 flex items-center justify-center">
              <HandCoins className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-sora text-xl font-bold text-slate-900 dark:text-white">New pot</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You'll become this pot's treasurer and can invite members with its join code.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : "Create pot"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400 sm:text-left">
            Tap the microphone to fill this in by voice.
          </p>
        </div>
      </div>

      <VoicePotButton
        onResult={({ name: spokenName, amountKobo }) => {
          setError("");
          if (spokenName) setName(spokenName);
          if (amountKobo != null) setNairaInput(String(Math.round(amountKobo / 100)));
        }}
      />
    </AppShell>
  );
}
