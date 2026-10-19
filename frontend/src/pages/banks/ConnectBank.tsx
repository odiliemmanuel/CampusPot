import { useEffect, useState } from "react";
import { CheckCircle2, Landmark, Plus } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import PageHeader from "../../components/PageHeader";

// A bank a member can link to fund their wallet. In this demo the connection is
// stored locally; wiring a real aggregator would replace load/save below.
const BANKS = ["B Moni", "GTBank", "Opay", "Access Bank", "Zenith Bank", "UBA", "Kuda", "Moniepoint"];
// B Moni is PotKeeper's own rail, so it is connected out of the box.
const DEFAULT_CONNECTED = ["B Moni"];

const STORAGE_KEY = "potkeeper.banks";

function loadConnected(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export default function ConnectBank() {
  const [connected, setConnected] = useState<string[]>(loadConnected);

  // Persist the default the first time so "Add money" can fund from B Moni
  // without the user having to connect anything.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === null) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONNECTED));
      setConnected(DEFAULT_CONNECTED);
    }
  }, []);

  const toggle = (bank: string) => {
    setConnected((prev) => {
      const next = prev.includes(bank) ? prev.filter((b) => b !== bank) : [...prev, bank];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <AppShell>
      <PageHeader
        title="Connect a bank"
        subtitle="Link the accounts you'll fund your wallet from."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {BANKS.map((bank) => {
          const linked = connected.includes(bank);
          return (
            <div
              key={bank}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 dark:border-white/10 dark:bg-panel-dark"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <Landmark className="h-5 w-5" />
                </span>
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{bank}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(bank)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  linked
                    ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400"
                    : "bg-brand-600 text-white hover:bg-brand-700"
                }`}
              >
                {linked ? <><CheckCircle2 className="h-3.5 w-3.5" /> Connected</> : <><Plus className="h-3.5 w-3.5" /> Connect</>}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Connected banks are where "Add money" pulls your funding from.
      </p>
    </AppShell>
  );
}
