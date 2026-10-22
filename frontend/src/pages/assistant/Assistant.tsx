import { useEffect, useState, useRef } from "react";
import { Loader2, Sparkles, Send, ShieldCheck, Bell } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import PageHeader from "../../components/PageHeader";
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
  "Can this pot cover a ₦10,000 payout?",
  "What payouts are pending?",
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

  useEffect(() => {
    listReminders(gid).then(setReminders).catch(() => {});
  }, [activeGroup?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setError("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    try {
      const res = await askAssistant(gid, question);
      setMessages((m) => [...m, { role: "ai", text: res.answer }]);
      listReminders(gid).then(setReminders).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI Treasurer couldn't answer that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="AI Treasurer" subtitle="Ask about the pot in plain English. It reads — it never moves money." />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Chat */}
        <div className="lg:col-span-2 cp-card flex h-[min(62dvh,580px)] min-h-[330px] flex-col rounded-2xl p-3 sm:p-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">AI Treasurer</p>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-violet-500" /> Read-only · cannot spend
              </p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-3">
            {messages.length === 0 && (
              <div className="py-5 text-center">
                <Sparkles className="mx-auto mb-2 h-7 w-7 text-primary-300" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Ask about the balance, contributions, spending, members, or payout approvals in this pot.
                </p>
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

          {error && <p className="text-sm text-violet-600 mb-3">{error}</p>}

          {/* Suggestions */}
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="shrink-0 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-[11px] text-slate-600 transition hover:border-primary-400 dark:border-primary-800/50 dark:bg-primary-900/30 dark:text-slate-300"
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
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the AI Treasurer..."
              className="cp-input flex-1"
            />
            <button type="submit" disabled={busy || !input.trim()} className="cp-btn-primary px-4">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Reminders */}
        <div className="cp-card rounded-2xl p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary-600" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Reminders</p>
          </div>
          {reminders.length === 0 ? (
            <p className="text-sm text-slate-400">
              No reminders yet. Send one from the Contributions page.
            </p>
          ) : (
            <div className="space-y-3">
              {reminders.map((r) => (
                <div key={r.id} className="p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{r.channel}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      r.status === "sent"
                        ? "bg-violet-100 dark:bg-violet-500/15 text-violet-600"
                        : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{r.message}</p>
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
