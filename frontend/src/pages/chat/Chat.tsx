import { useEffect, useRef, useState, type FormEvent } from "react";
import { CornerDownRight, Loader2, Send, Users, X } from "lucide-react";

import AppShell from "../../layouts/AppShell";
import GroupGate from "../../components/GroupGate";
import { useGroup } from "../../providers/GroupProvider";
import {
  listChat, postChat, markChatRead, listChatParticipants, getStoredUser,
  type ChatMessage, type Membership,
} from "../../lib/api";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function ChatInner() {
  const { activeGroup } = useGroup();
  const gid = activeGroup!.id;
  const myId = getStoredUser()?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Membership[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const nameById = (uid: string) =>
    participants.find((p) => p.userId === uid)?.user?.name ??
    messages.find((m) => m.userId === uid)?.author ??
    "Member";

  const load = async () => {
    const [msgs, people] = await Promise.all([
      listChat(gid),
      listChatParticipants(gid).catch(() => [] as Membership[]),
    ]);
    setMessages(msgs);
    setParticipants(people);
    return msgs;
  };

  useEffect(() => {
    setLoading(true);
    load()
      .then((msgs) => {
        const last = msgs[msgs.length - 1];
        if (last) markChatRead(gid, last.id).catch(() => {});
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the chat."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true); setError("");
    try {
      await postChat(gid, text, replyTo?.id);
      setBody("");
      setReplyTo(null);
      const msgs = await load();
      const last = msgs[msgs.length - 1];
      if (last) await markChatRead(gid, last.id).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Pot chat
        </p>
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          {participants.length} member{participants.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      <div className="cp-card flex h-[60vh] flex-col rounded-3xl p-0">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No messages yet. Say hello to the pot.
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.userId === myId;
              const parent = m.replyToId ? messages.find((x) => x.id === m.replyToId) : null;
              const readers = m.readBy.filter((r) => r !== m.userId);
              return (
                <div key={m.id} className={["flex flex-col", mine ? "items-end" : "items-start"].join(" ")}>
                  <div className={["max-w-[85%] rounded-2xl px-3.5 py-2.5", mine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"].join(" ")}>
                    {!mine && <p className="mb-0.5 text-[11px] font-semibold opacity-70">{m.author || "Member"}</p>}
                    {parent && (
                      <div className={["mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs", mine ? "border-white/50 bg-white/10 text-white/80" : "border-brand-300 bg-slate-50 text-slate-500 dark:bg-slate-900/40"].join(" ")}>
                        <p className="font-semibold">{parent.author}</p>
                        <p className="truncate">{parent.body}</p>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2 px-1">
                    <span className="text-[10px] text-slate-400">{timeLabel(m.createdAt)}</span>
                    {readers.length > 0 && (
                      <span className="text-[10px] text-slate-400">
                        Seen by {readers.map(nameById).join(", ")}
                      </span>
                    )}
                    {!mine && (
                      <button
                        onClick={() => setReplyTo(m)}
                        className="text-[10px] font-semibold text-brand-600 dark:text-brand-400"
                      >
                        Reply
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {replyTo && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-xs dark:border-white/10">
            <span className="min-w-0 truncate text-slate-500 dark:text-slate-400">
              Replying to <span className="font-semibold">{replyTo.author}</span>: {replyTo.body}
            </span>
            <button onClick={() => setReplyTo(null)} className="shrink-0 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 border-t border-slate-100 p-3 dark:border-white/10">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Message the pot…"
            className="cp-input flex-1 resize-none"
          />
          <button onClick={send} disabled={sending || !body.trim()} className="cp-btn-primary shrink-0">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Chat() {
  return (
    <AppShell>
      <GroupGate>
        <ChatInner />
      </GroupGate>
    </AppShell>
  );
}
