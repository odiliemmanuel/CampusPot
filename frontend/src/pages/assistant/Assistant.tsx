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
  "Give me a summary of the pot",
  "Which members are partially paid?",
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

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Chat */}
        <div className="lg:col-span-2 cp-card rounded-3xl p-5 flex flex-col h-[calc(100vh-260px)] min-h-[420px]">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">AI Treasurer</p>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" /> Read-only · cannot spend
              </p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 text-primary-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Ask me about contributions, outstanding members, or the pot summary.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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

          {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

          {/* Suggestions */}
          <div className="flex flex-wrap gap-2 mb-3">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="text-xs px-3 py-2 rounded-lg border border-primary-200 dark:border-primary-800/50 bg-primary-50 dark:bg-primary-900/30 text-slate-600 dark:text-slate-300 hover:border-primary-400 transition"
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
        <div className="cp-card rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-4">
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
                        ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600"
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
