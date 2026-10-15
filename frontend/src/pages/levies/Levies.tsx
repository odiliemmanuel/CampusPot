import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, Plus, Receipt, Calendar, Lock, CheckCircle2, X } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import { listLevies, createLevy, closeLevy, type Levy } from "../../lib/api";
import { formatNaira, nairaToKobo } from "../../lib/format";

function LeviesInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;

  const [levies, setLevies] = useState<Levy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const load = () => listLevies(gid);

  useEffect(() => {
    setLoading(true);
    load()
      .then(setLevies)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load levies."))
      .finally(() => setLoading(false));
  }, [activeGroup?.id]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await createLevy(gid, title, nairaToKobo(amount), dueDate || undefined);
      setTitle(""); setAmount(""); setDueDate(""); setShowForm(false);
      setLevies(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the levy.");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async (id: string) => {
    setError("");
    try {
      await closeLevy(gid, id);
      setLevies(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't close the levy.");
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>;
  }

  return (
    <>
      <PageHeader
        title="Levies"
        subtitle="Each levy defines what every member owes."
        action={
          <button onClick={() => setShowForm((v) => !v)} className="cp-btn-primary">
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {showForm ? "Cancel" : "New levy"}
          </button>
        }
      />

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setError("");
            try {
              await createLevy(gid, title, nairaToKobo(amount), dueDate || undefined);
              setTitle(""); setAmount(""); setDueDate(""); setShowForm(false);
              setLevies(await load());
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't create the levy.");
            } finally {
              setBusy(false);
            }
          }}
          className="cp-card rounded-3xl p-6 mb-6 grid sm:grid-cols-4 gap-4 items-end"
        >
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Levy title</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Excursion transport" className="cp-input mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Per member (₦)</label>
            <input required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" className="cp-input mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="cp-input mt-1" />
          </div>
          <div className="sm:col-span-4">
            <button type="submit" disabled={busy} className="cp-btn-primary w-full sm:w-auto">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create levy
            </button>
          </div>
        </motion.form>
      )}

      {levies.length === 0 ? (
        <div className="cp-card rounded-3xl p-10 text-center">
          <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No levies yet. Create one to start collecting.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {levies.map((l) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="cp-card rounded-3xl p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-sora font-bold text-slate-900 dark:text-white truncate">{l.title}</h3>
                  <p className="font-sora text-lg font-bold text-primary-600 mt-1">{formatNaira(l.amountKobo)}</p>
                </div>
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                  l.status === "open"
                    ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}>
                  {l.status === "open" ? <CheckCircle2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {l.status}
                </span>
              </div>

              {l.dueDate && (
                <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-3">
                  <Calendar className="w-3.5 h-3.5" />
                  Due {new Date(l.dueDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}

              {l.status === "open" && (
                <button
                  onClick={async () => {
                    setError("");
                    try {
                      await closeLevy(gid, l.id);
                      setLevies(await load());
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Couldn't close the levy.");
                    }
                  }}
                  className="mt-4 cp-btn-ghost w-full"
                >
                  <Lock className="w-4 h-4" /> Close levy
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}

export default function Levies() {
  return (
    <AppShell>
      <GroupGate>
        <LeviesInner />
      </GroupGate>
    </AppShell>
  );
}
