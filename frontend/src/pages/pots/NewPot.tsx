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
  const [potType, setPotType] = useState<"goal" | "rotating">("goal");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly" | "quarterly">("weekly");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const group = await createGroup(name, 2, 3, 0, nairaToKobo(nairaInput), {
        potType,
        contributionFrequency: potType === "goal" ? "one_time" : frequency,
        contributionDueDate: dueDate,
      });
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
        <div className="rounded-2xl cp-card p-3 sm:rounded-3xl sm:p-6">
          <div className="mb-4 flex items-center gap-3 sm:mb-5">
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

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
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
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Pot type</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" role="radio" aria-checked={potType === "goal"} onClick={() => setPotType("goal")} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${potType === "goal" ? "border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>
                  <span><span className="block text-sm font-semibold">Goal pot</span><span className="mt-0.5 block text-[11px] opacity-75">One payment toward a target</span></span><span className={`h-4 w-4 shrink-0 rounded-full border-2 ${potType === "goal" ? "border-violet-600 bg-violet-600 shadow-[inset_0_0_0_3px_white]" : "border-slate-300"}`} />
                </button>
                <button type="button" role="radio" aria-checked={potType === "rotating"} onClick={() => setPotType("rotating")} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${potType === "rotating" ? "border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-200" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>
                  <span><span className="block text-sm font-semibold">Recurring pot</span><span className="mt-0.5 block text-[11px] opacity-75">Same amount on a schedule</span></span><span className={`h-4 w-4 shrink-0 rounded-full border-2 ${potType === "rotating" ? "border-violet-600 bg-violet-600 shadow-[inset_0_0_0_3px_white]" : "border-slate-300"}`} />
                </button>
              </div>
            </fieldset>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {potType === "goal" ? "One-time amount per member (₦)" : "Amount per member, each cycle (₦)"}
              </label>
              <input
                required
                type="number"
                min="1"
                step="1"
                value={nairaInput}
                onChange={(e) => setNairaInput(e.target.value)}
                placeholder="e.g. 5000"
                inputMode="numeric"
                className="cp-input mt-1.5"
              />
              {potType === "rotating" ? (
                <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-300">Contribution and payout cycle
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)} className="cp-input mt-1">
                    <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Every 3 months</option>
                  </select>
                </label>
              ) : <p className="mt-1 text-xs text-slate-400">The target is this amount × the number of members.</p>}
              {potType === "rotating" && <p className="mt-1 text-xs text-slate-400">Members owe this amount each {frequency === "daily" ? "day" : frequency === "weekly" ? "week" : frequency === "monthly" ? "month" : "quarter"}. The next cycle opens after everyone pays; payouts stay manual and follow this pot’s approval rules.</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Contributions due by</label>
              <input required type="date" min={new Date().toLocaleDateString("en-CA")} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="cp-input mt-1" />
              <p className="mt-1 text-xs text-slate-400">Set the firm deadline for this contribution cycle.</p>
            </div>
            {error && <p className="text-sm text-violet-600">{error}</p>}
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
