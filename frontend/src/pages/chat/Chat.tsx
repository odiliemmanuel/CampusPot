import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, MessageSquare, Mic, Paperclip, Send, Square, X } from "lucide-react";

import { useGroup } from "../../providers/GroupProvider";
import {
  ApiError, chatWebSocketProtocols, chatWebSocketUrl, getChatAttachment, getStoredUser, listChat, listChatParticipants, markChatRead, postChat, uploadChatAttachment,
  type ChatMessage, type Membership,
} from "../../lib/api";

// A missing /chat route means this backend predates the chat endpoints. Show a
// plain message instead of the raw "request failed (404)".
function describeError(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 404) {
    return "Pot chat isn't available on this deployment yet. It'll appear after the next update.";
  }
  return err instanceof Error ? err.message : fallback;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function ChatAttachment({ message }: { message: ChatMessage }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!message.attachmentUrl) return;
    let objectUrl = "";
    getChatAttachment(message.attachmentUrl).then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [message.attachmentUrl]);
  if (!url) return <span className="my-1 block text-xs opacity-70">Loading attachment…</span>;
  if (message.attachmentType?.startsWith("audio/")) return <audio className="my-2 max-w-full" controls src={url} />;
  if (message.attachmentType?.startsWith("image/")) return <a href={url} target="_blank" rel="noreferrer"><img className="my-2 max-h-64 rounded-lg" src={url} alt={message.attachmentName || "Chat image"} /></a>;
  return <a className="my-1 flex items-center gap-2 underline" href={url} download={message.attachmentName}><Paperclip className="h-4 w-4" />{message.attachmentName || "Download file"}</a>;
}

// A standalone, WhatsApp-style group chat for one pot. Reached from the pot
// header rather than embedded as a tab, so it gets the full screen.
function ChatRoom({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { id } = useParams<{ id: string }>();
  const myId = getStoredUser()?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Membership[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const nameById = (uid: string) =>
    participants.find((p) => p.userId === uid)?.user?.name ??
    messages.find((m) => m.userId === uid)?.author ??
    "Member";

  const load = async () => {
    const [msgs, people] = await Promise.all([
      listChat(groupId),
      listChatParticipants(groupId).catch(() => [] as Membership[]),
    ]);
    setMessages(msgs);
    setParticipants(people);
    return msgs;
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((msgs) => {
        const last = msgs[msgs.length - 1];
        if (alive && last) markChatRead(groupId, last.id).catch(() => {});
      })
      .catch((err) => {
        if (alive) setError(describeError(err, "Couldn't load the chat."));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(chatWebSocketUrl(groupId), chatWebSocketProtocols());
      socket.onopen = () => { void load().catch(() => {}); };
      socket.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data) as { type?: string; data?: ChatMessage };
          if (envelope.type === "message" && envelope.data) {
            setMessages((old) => old.some((m) => m.id === envelope.data!.id) ? old : [...old, envelope.data!]);
          }
        } catch { /* Ignore malformed socket events. */ }
      };
      socket.onclose = () => { if (!stopped) retry = setTimeout(connect, 2500); };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => { stopped = true; if (retry) clearTimeout(retry); socket?.close(); };
  }, [groupId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError("");
    try {
      const created = await postChat(groupId, text, replyTo?.id);
      setMessages((old) => old.some((m) => m.id === created.id) ? old : [...old, created]);
      setBody("");
      setReplyTo(null);
      const msgs = await load();
      const last = msgs[msgs.length - 1];
      if (last) await markChatRead(groupId, last.id).catch(() => {});
    } catch (err) {
      setError(describeError(err, "Couldn't send the message."));
    } finally {
      setSending(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError("Files must be 10 MB or smaller."); return; }
    setUploading(true); setError("");
    try {
      const created = await uploadChatAttachment(groupId, file);
      setMessages((old) => old.some((m) => m.id === created.id) ? old : [...old, created]);
      await markChatRead(groupId, created.id).catch(() => {});
    } catch (err) { setError(describeError(err, "Couldn't upload the file.")); }
    finally { setUploading(false); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recordedChunks.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunks.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        void upload(new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blob.type }));
      };
      mediaRecorder.current = recorder; recorder.start(); setRecording(true);
    } catch { setError("Microphone access is unavailable. Allow microphone access and try again."); }
  };
  const stopRecording = () => { mediaRecorder.current?.stop(); setRecording(false); };

  return (
    <div className="fixed inset-x-0 bottom-16 top-[3.75rem] z-20 flex flex-col overflow-hidden border-slate-100 bg-white lg:bottom-0 lg:left-60 dark:border-white/10 dark:bg-panel-dark">
      <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3 dark:border-white/10">
        <Link
          to={`/pots/${id}`}
          className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10"
          aria-label="Back to pot"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white">
          {(groupName || "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{groupName}</p>
          <p className="truncate text-xs text-slate-400">
            {participants.length} member{participants.length === 1 ? "" : "s"} · pot chat
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3 dark:bg-transparent">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare className="mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">No messages yet. Say hello to the pot.</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.userId === myId;
            const parent = m.replyToId ? messages.find((x) => x.id === m.replyToId) : null;
            const readers = (m.readBy ?? []).filter((r) => r !== m.userId);
            const prev = messages[i - 1];
            const showName = !mine && (!prev || prev.userId !== m.userId);
            return (
              <div key={m.id} className={["flex flex-col", mine ? "items-end" : "items-start"].join(" ")}>
                <div
                  className={[
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[70%]",
                    mine
                      ? "rounded-br-md bg-brand-600 text-white"
                      : "rounded-bl-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100",
                  ].join(" ")}
                >
                  {showName && (
                    <p className="mb-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                      {m.author || "Member"}
                    </p>
                  )}
                  {parent && (
                    <div
                      className={[
                        "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs",
                        mine ? "border-white/50 bg-white/10 text-white/80" : "border-brand-300 bg-slate-50 text-slate-500 dark:bg-slate-900/40",
                      ].join(" ")}
                    >
                      <p className="font-semibold">{parent.author}</p>
                      <p className="truncate">{parent.body}</p>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  {m.attachmentUrl && <ChatAttachment message={m} />}
                  <div
                    className={[
                      "mt-1 flex items-center justify-end gap-1.5 text-[10px]",
                      mine ? "text-white/70" : "text-slate-400",
                    ].join(" ")}
                  >
                    <span>{timeLabel(m.createdAt)}</span>
                    {mine && <span>{readers.length > 0 ? "✓✓" : "✓"}</span>}
                  </div>
                </div>
                {readers.length > 0 && (
                  <span className="mt-0.5 px-1 text-[10px] text-slate-400">
                    Seen by {readers.map(nameById).join(", ")}
                  </span>
                )}
                {!mine && (
                  <button
                    type="button"
                    onClick={() => setReplyTo(m)}
                    className="mt-0.5 px-1 text-[10px] font-semibold text-brand-600 dark:text-brand-400"
                  >
                    Reply
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {replyTo && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 dark:border-white/10">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
              Replying to {replyTo.author}
            </p>
            <p className="truncate text-xs text-slate-400">{replyTo.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
            aria-label="Cancel reply"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && <p className="px-3 py-1.5 text-xs text-rose-600">{error}</p>}

      <div className="flex items-end gap-2 border-t border-slate-100 p-2.5 dark:border-white/10">
        <input ref={fileInput} type="file" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="rounded-full p-2.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/10" aria-label="Attach file">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </button>
        <button type="button" onClick={recording ? stopRecording : startRecording} className={`rounded-full p-2.5 ${recording ? "text-rose-600" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"}`} aria-label={recording ? "Stop voice note" : "Record voice note"}>
          {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
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
          placeholder={recording ? "Recording voice note…" : "Message the pot"}
          className="cp-input max-h-32 flex-1 resize-none py-2.5"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !body.trim()}
          className="cp-btn-primary shrink-0 rounded-full p-3"
          aria-label="Send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const { activeGroup } = useGroup();
  const group = activeGroup?.id === id ? activeGroup : null;
  if (!group) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }
  return <ChatRoom groupId={group.id} groupName={group.name} />;
}
