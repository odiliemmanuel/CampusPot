import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowDownToLine, ArrowLeft, File as FileIcon, Loader2, MessageSquare, Mic, Paperclip, Send, Square, X } from "lucide-react";

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
  const [showDownload, setShowDownload] = useState(false);
  const [attachmentError, setAttachmentError] = useState(false);
  useEffect(() => {
    if (!message.attachmentUrl) return;
    let objectUrl = "";
    let alive = true;
    getChatAttachment(message.attachmentUrl).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      if (alive) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
    }).catch(() => { if (alive) setAttachmentError(true); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [message.attachmentUrl]);
  if (!url) return <span className="my-1 block text-xs opacity-70">{attachmentError ? "Attachment could not be loaded." : "Loading attachment…"}</span>;
  const isAudio = message.attachmentType?.startsWith("audio/");
  return <>
    {isAudio && <audio className="my-2 max-w-full" controls src={url} />}
    {message.attachmentType?.startsWith("image/") && <img className="my-2 max-h-64 rounded-xl border border-white/15" src={url} alt={message.attachmentName || "Chat image"} />}
    <button type="button" onClick={() => setShowDownload(true)} className="mt-2 flex w-full items-center gap-3 rounded-xl border border-current/10 bg-slate-900/5 p-3 text-left transition hover:bg-slate-900/10 dark:bg-black/15 dark:hover:bg-black/25">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300"><FileIcon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{message.attachmentName || "Shared file"}</span><span className="block text-[10px] opacity-60">Tap to download</span></span>
      <ArrowDownToLine className="h-4 w-4 shrink-0 opacity-70" />
    </button>
    {showDownload && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:items-center" onClick={() => setShowDownload(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="download-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[1.75rem] border border-white/10 bg-white p-5 shadow-2xl dark:bg-[#101a2b] sm:p-6">
        <div className="mb-4 flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-200"><FileIcon className="h-5 w-5" /></span><button type="button" onClick={() => setShowDownload(false)} aria-label="Close" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button></div>
        <h3 id="download-title" className="font-sora text-lg font-bold text-slate-900 dark:text-white">Download shared file?</h3>
        <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">{message.attachmentName || "Shared file"}</p>
        <button type="button" onClick={() => { const link = document.createElement("a"); link.href = url; link.download = message.attachmentName || "potkeeper-file"; document.body.appendChild(link); link.click(); link.remove(); setShowDownload(false); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-violet-500 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-900/20 transition hover:brightness-105 active:scale-[.99]"><ArrowDownToLine className="h-4 w-4" /> Download file</button>
      </div>
    </div>}
  </>;
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
  const [voiceDraft, setVoiceDraft] = useState<File | null>(null);
  const [voiceDraftUrl, setVoiceDraftUrl] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const cancelRecording = useRef(false);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
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
    if (!file) return false;
    if (file.size > 10 * 1024 * 1024) { setError("Files must be 10 MB or smaller."); return false; }
    setUploading(true); setError("");
    try {
      const created = await uploadChatAttachment(groupId, file);
      setMessages((old) => old.some((m) => m.id === created.id) ? old : [...old, created]);
      await markChatRead(groupId, created.id).catch(() => {});
      return true;
    } catch (err) { setError(describeError(err, "Couldn't upload the file.")); }
    finally { setUploading(false); }
    return false;
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordedChunks.current = [];
      cancelRecording.current = false;
      setRecordingSeconds(0);
      recorder.ondataavailable = (event) => { if (event.data.size) recordedChunks.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingTimer.current) clearInterval(recordingTimer.current);
        recordingTimer.current = null;
        if (cancelRecording.current) { recordedChunks.current = []; return; }
        const blob = new Blob(recordedChunks.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) { setError("No audio was captured. Try recording again."); return; }
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        const draft = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blob.type });
        setVoiceDraft(draft);
        setVoiceDraftUrl(URL.createObjectURL(draft));
      };
      mediaRecorder.current = recorder; recorder.start(250); setRecording(true);
      recordingTimer.current = setInterval(() => setRecordingSeconds((seconds) => {
        if (seconds >= 119) { mediaRecorder.current?.stop(); setRecording(false); return 120; }
        return seconds + 1;
      }), 1000);
    } catch { setError("Microphone access is unavailable. Allow microphone access on this secure page and try again."); }
  };
  const stopRecording = (discard = false) => {
    cancelRecording.current = discard;
    if (mediaRecorder.current?.state !== "inactive") mediaRecorder.current?.stop();
    setRecording(false);
    if (discard) setRecordingSeconds(0);
  };
  const sendVoiceNote = async () => {
    if (await upload(voiceDraft ?? undefined)) { setVoiceDraft(null); setRecordingSeconds(0); }
  };
  useEffect(() => () => {
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    cancelRecording.current = true;
    if (mediaRecorder.current?.state !== "inactive") mediaRecorder.current?.stop();
  }, []);
  useEffect(() => () => { if (voiceDraftUrl) URL.revokeObjectURL(voiceDraftUrl); }, [voiceDraftUrl]);
  const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#f7f5ff] dark:bg-[#100c1c] lg:bottom-0 lg:left-60">
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#4c1d95] px-3 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] text-white shadow-lg sm:px-5">
        <Link
          to={`/pots/${id}`}
          className="rounded-full p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
          aria-label="Back to pot"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-400 to-purple-700 font-sora font-extrabold text-white shadow-md shadow-violet-950/30">
          {(groupName || "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-sora text-sm font-bold text-white">{groupName}</p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-violet-100/70">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_8px_#c4b5fd]" /> {participants.length} member{participants.length === 1 ? "" : "s"} · live pot room
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,.09),_transparent_48%)] px-3 py-4 sm:px-6 sm:py-6">
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
                    "max-w-[90%] rounded-[1.35rem] px-3.5 py-2.5 shadow-sm sm:max-w-[70%]",
                    mine
                      ? "rounded-br-md bg-gradient-to-br from-violet-700 to-purple-800 text-white shadow-violet-900/10"
                      : "rounded-bl-md border border-slate-200/80 bg-white text-slate-800 dark:border-white/10 dark:bg-[#142335] dark:text-slate-100",
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
                  {m.body ? <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p> : m.attachmentType?.startsWith("audio/") && <p className="text-xs font-semibold opacity-80">Voice note · {m.author}</p>}
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

      {error && <p role="status" className="bg-violet-50 px-3 py-2 text-xs text-violet-600 dark:bg-violet-500/10">{error}</p>}

      {voiceDraft && voiceDraftUrl && <div className="flex items-center gap-3 border-t border-violet-100 bg-violet-50/80 px-3 py-2.5 dark:border-violet-300/10 dark:bg-violet-950/30 sm:px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-violet-700 shadow-sm dark:bg-white/10 dark:text-violet-200"><Mic className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">Voice note ready · {clock(recordingSeconds)}</p><audio className="mt-1 h-8 w-full max-w-xs" controls src={voiceDraftUrl} /></div>
        <button type="button" onClick={() => { setVoiceDraft(null); setVoiceDraftUrl(""); setRecordingSeconds(0); }} className="rounded-full p-2 text-slate-500 hover:bg-white dark:hover:bg-white/10" aria-label="Discard voice note"><X className="h-4 w-4" /></button>
        <button type="button" onClick={sendVoiceNote} disabled={uploading} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-700 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-violet-950/15 transition hover:bg-violet-600 disabled:opacity-50"><Send className="h-3.5 w-3.5" />{uploading ? "Sending" : "Send audio"}</button>
      </div>}

      <div className="border-t border-slate-200/80 bg-white/90 p-2.5 pb-[max(.65rem,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-white/10 dark:bg-[#0c1927]/95 sm:px-5">
        {recording && <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-violet-600 dark:text-violet-300"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" /></span>Recording voice note <span className="font-mono">{clock(recordingSeconds)}</span><span className="ml-auto flex h-4 items-center gap-0.5" aria-hidden="true">{[1, 2, 3, 4, 5, 6, 7].map((n) => <span key={n} className="w-1 animate-pulse rounded-full bg-violet-400" style={{ height: `${6 + (n % 4) * 3}px`, animationDelay: `${n * 90}ms` }} />)}</span></div>}
        <div className="flex items-end gap-2">
        <input ref={fileInput} type="file" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || recording || !!voiceDraft} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-slate-500 transition hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10" aria-label="Attach file">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </button>
        <button type="button" onClick={recording ? () => stopRecording(false) : startRecording} disabled={!!voiceDraft} className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition ${recording ? "bg-violet-500 text-white shadow-lg shadow-violet-900/25" : "text-slate-500 hover:bg-violet-50 hover:text-violet-700 dark:text-slate-300 dark:hover:bg-white/10"}`} aria-label={recording ? "Finish voice note" : "Record voice note"}>
          {recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
        </button>
        {recording && <button type="button" onClick={() => stopRecording(true)} className="grid h-11 w-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-violet-50 hover:text-violet-600 dark:text-slate-300 dark:hover:bg-violet-500/10" aria-label="Cancel recording"><X className="h-4 w-4" /></button>}
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
          placeholder={recording ? "Tap the square to finish your recording" : "Write a message…"}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-[#142335] dark:text-white"
          disabled={recording || !!voiceDraft}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !body.trim()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-700 to-violet-500 text-white shadow-lg shadow-violet-900/20 transition hover:brightness-105 disabled:opacity-45"
          aria-label="Send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
        </div>
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
