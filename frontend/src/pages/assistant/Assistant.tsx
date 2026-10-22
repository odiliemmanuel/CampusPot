import { useEffect, useState, useRef } from "react";
import { Loader2, Sparkles, Send, ShieldCheck, Bell, RotateCcw } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import { useGroup } from "../../providers/GroupProvider";
import {
  askAssistant, listReminders, type Reminder,
} from "../../lib/api";

interface Message {
  role: "user" | "ai";
  text: string;
}

const suggestions = [
  "Who hasn't paid?",
  "Can this pot cover ₦10,000?",
  "How has spending changed?",
  "Any recurring payouts?",
  "When are contributions due?",
  "What payouts are waiting?",
];

export function AssistantInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const [failedQuestion, setFailedQuestion] = useState("");

  useEffect(() => {
    listReminders(gid).then(setReminders).catch(() => {});
  }, [activeGroup?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const ask = async (question: string, retry = false) => {
    const trimmed = question.trim();
    if (!trimmed || inFlightRef.current) return;
    inFlightRef.current = true;
    setError("");
    setFailedQuestion("");
    if (!retry) {
      setMessages((m) => [...m, { role: "user", text: trimmed }]);
      setInput("");
    }
    setBusy(true);
    try {
      const res = await askAssistant(gid, trimmed);
      setMessages((m) => [...m, { role: "ai", text: res.answer }]);
      listReminders(gid).then(setReminders).catch(() => {});
    } catch (err) {
      setFailedQuestion(trimmed);
      setError(err instanceof Error ? err.message : "The AI Treasurer couldn't answer that.");
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><Sparkles className="h-4 w-4" /></span>
          <div className="min-w-0"><h2 className="text-sm font-semibold text-slate-900 dark:text-white">AI Treasurer</h2><p className="truncate text-[11px] text-slate-500 dark:text-slate-400">Pot insights, deadlines, payout patterns</p></div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><ShieldCheck className="h-3 w-3" /> Read-only</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Chat */}
        <div className="lg:col-span-2 cp-card flex h-[min(44dvh,360px)] min-h-[225px] flex-col rounded-xl p-2.5 sm:p-3">
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto py-1.5">
            {messages.length === 0 && (
              <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/5">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Ask a question about this pot.</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">I can check arrears, deadlines, spending trends, repeat payouts, and whether the balance can cover a cost.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary-600 text-white"
                    : "bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3">
                  <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {error && <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"><span className="min-w-0">{error}</span>{failedQuestion && <button type="button" onClick={() => ask(failedQuestion, true)} disabled={busy} className="inline-flex shrink-0 items-center gap-1 font-semibold underline disabled:opacity-50"><RotateCcw className="h-3 w-3" /> Retry</button>}</div>}

          {/* Suggestions */}
          <div className="mb-1.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={busy}
                className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] text-slate-600 transition hover:border-violet-400 disabled:opacity-50 dark:border-violet-800/50 dark:bg-violet-900/30 dark:text-slate-300"
              >
                {s}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex gap-1.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the AI Treasurer..."
              className="cp-input min-h-9 flex-1 py-2 text-xs"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send question" className="cp-btn-primary min-h-9 px-3">
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

        {/* Reminders */}
        <div className="cp-card rounded-xl p-2.5 sm:p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5 text-primary-600" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Reminder drafts</p>
          </div>
          {reminders.length === 0 ? (
            <p className="text-xs text-slate-400">
              No reminders saved yet. Ask for reminder wording; nothing is sent automatically.
            </p>
          ) : (
            <div className="max-h-36 space-y-1.5 overflow-y-auto">
              {reminders.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{r.channel}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      r.status === "sent"
                        ? "bg-violet-100 dark:bg-violet-500/15 text-violet-600"
                        : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{r.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function Assistant() {
  return (
    <AppShell>
      <GroupGate>
        <AssistantInner />
      </GroupGate>
    </AppShell>
  );
}
