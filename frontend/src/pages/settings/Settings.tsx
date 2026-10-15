import { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import PageHeader from "../../components/PageHeader";
import { useGroup } from "../../providers/GroupProvider";
import { getMe, clearSession, type AuthUser } from "../../lib/api";
import { formatNaira } from "../../lib/format";

export default function Settings() {
  const { activeGroup } = useGroup();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    clearSession();
    window.location.href = "/login";
  };

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle="Your account and this pot's rules." />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Profile */}
        <div className="cp-card rounded-3xl p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-4">Profile</p>
          {loading ? (
            <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xl font-bold">
                {(user?.name ?? "?").charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="font-sora font-bold text-slate-900 dark:text-white truncate">{user?.name ?? "—"}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user?.email ?? "—"}</p>
                {user?.phone && <p className="text-xs text-slate-400 mt-0.5">{user.phone}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Pot rules */}
        {activeGroup && (
          <div className="cp-card rounded-3xl p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-4">Pot rules</p>
            <div className="space-y-3 text-sm">
              <Row label="Pot name" value={activeGroup.name} />
              <Row label="Currency" value={activeGroup.currency} />
              <Row label="Approvals required" value={`${activeGroup.approvalThreshold} of ${activeGroup.approvalTotal}`} />
              <Row
                label="Large-spend alert"
                value={activeGroup.largeExpenseKobo > 0 ? `${formatNaira(activeGroup.largeExpenseKobo)}+` : "Not set"}
              />
              <Row label="Join code" value={activeGroup.joinCode} />
              {activeGroup.virtualAccountNumber && (
                <Row label="Pot account" value={`${activeGroup.virtualAccountNumber} · ${activeGroup.virtualAccountBank}`} />
              )}
            </div>
          </div>
        )}

        {/* Session */}
        <div className="cp-card rounded-3xl p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-4">Session</p>
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition"
          >
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 mt-8">
        CampusPot · sandbox build · synthetic data only
      </p>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-200 text-right truncate">{value}</span>
    </div>
  );
}
