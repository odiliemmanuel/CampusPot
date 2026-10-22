import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  File as FileIcon,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Mic,
  Paperclip,
  Pause,
  Play,
  Presentation,
  Reply,
  Send,
  Smile,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useGroup } from "../../providers/GroupProvider";
import {
  ApiError, chatWebSocketProtocols, chatWebSocketUrl, getChatAttachment, getStoredUser, listChat, listChatParticipants, markChatRead, postChat, uploadChatAttachment,
  type ChatMessage, type Membership,
} from "../../lib/api";

const cn = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

// A missing /chat route means this backend predates the chat endpoints. Show a
// plain message instead of the raw "request failed (404)".
function describeError(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 404) {
    return "Pot chat isn't available on this deployment yet. It'll appear after the next update.";
  }
  return err instanceof Error ? err.message : fallback;
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function clockLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" });
}

// Deterministic avatar colour so the same member always looks the same.
const AVATAR_COLORS = ["#e0533d", "#ef8a3c", "#0d9488", "#7c3aed", "#e11d48", "#0284c7", "#16a34a", "#db2777", "#b45309", "#4f46e5"];

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function Avatar({ id, name, className = "h-9 w-9 text-[11px]" }: { id: string; name: string; className?: string }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-bold text-white shadow-sm", className)}
      style={{ backgroundColor: colorFor(id) }}
    >
      {initialsOf(name)}
    </span>
  );
}

const EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰",
  "😘", "😋", "😜", "🤪", "🤨", "🧐", "😎", "🥳", "🤩", "🥺", "😢", "😭", "😤", "😠", "😳", "🥵",
  "🥶", "😱", "🤔", "🤗", "🤭", "🤫", "😐", "😴", "🤔", "🤐", "🤢", "🤧", "😷", "👍", "👎", "👌",
  "✌️", "🤞", "🤟", "🤘", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "👋", "🤝", "🙏", "💪", "👏",
  "🙌", "👐", "🤲", "✍️", "💅", "💃", "🕺", "👀", "🧠", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤",
  "🤍", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "🔥", "✨", "⭐", "🌟", "💫",
  "💥", "💯", "🎉", "🎊", "🎁", "🎈", "🏆", "🥇", "⚽", "🏀", "🎯", "🚀", "✅", "❌", "💰", "💸",
  "🧾", "📌", "📎", "🕐", "📅", "💬", "📣", "🔔", "🔒", "🔑", "💡", "📢", "📲", "🧮", "📊", "📈",
  "📉", "🗓️", "🍀", "🌴", "☕", "🍚", "🎂", "🥂", "🌈", "🔔", "🚩", "🥳", "🤝", "💐", "🧿", "🪙",
];

// A compact emoji tray for the composer — no third-party picker needed.
function EmojiTray({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 max-h-56 w-[min(20rem,88vw)] overflow-y-auto rounded-2xl border border-black/5 bg-white p-2 shadow-2xl dark:border-white/10 dark:bg-[#182229]">
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJIS.map((emoji, index) => (
          <button
            key={`${emoji}-${index}`}
            type="button"
            onClick={() => onPick(emoji)}
            className="grid h-8 w-8 place-items-center rounded-lg text-lg leading-none transition hover:bg-slate-100 dark:hover:bg-white/10"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// WhatsApp-style voice note: play button, elapsed time, tappable waveform.
function VoiceNote({ src, label }: { src: string; label?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const bars = useMemo(() => Array.from({ length: 32 }, (_, i) => 5 + ((i * 37 + i * i * 11) % 17)), []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try { await audio.play(); } catch { setPlaying(false); }
    } else audio.pause();
  };

  const seek = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = duration * ratio;
    setCurrentTime(audio.currentTime);
  };

  return (
    <div className="flex min-w-[13rem] max-w-full items-center gap-3 py-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
      />
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#00a884] text-white shadow-md shadow-[#00a884]/30 transition hover:bg-[#009c7a]"
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>
      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-300">
        {formatAudioTime(currentTime || duration)}
      </span>
      <div className="flex h-6 min-w-0 flex-1 items-center gap-[2px]">
        {bars.map((height, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Seek to ${Math.round((i / bars.length) * 100)} percent`}
            onClick={() => seek(i / bars.length)}
            className={cn(
              "min-w-[2px] flex-1 rounded-full transition-colors",
              i / bars.length <= progress ? "bg-[#00a884]" : "bg-[#c3cdd2] dark:bg-[#465761]",
            )}
            style={{ height: `${height + 4}px` }}
          />
        ))}
      </div>
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

type FileKind = { label: string; color: string; Icon: LucideIcon };

function fileKind(name = "", type = ""): FileKind {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf" || type === "application/pdf") return { label: "PDF", color: "#e04747", Icon: FileText };
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return { label: ext.toUpperCase(), color: "#2b579a", Icon: FileText };
  if (["xls", "xlsx", "ods"].includes(ext)) return { label: ext.toUpperCase(), color: "#1d6f42", Icon: FileSpreadsheet };
  if (["csv"].includes(ext)) return { label: "CSV", color: "#1d6f42", Icon: FileSpreadsheet };
  if (["ppt", "pptx", "odp"].includes(ext)) return { label: ext.toUpperCase(), color: "#d24726", Icon: Presentation };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { label: ext.toUpperCase(), color: "#b45309", Icon: FileArchive };
  if (["mp3", "wav", "m4a", "ogg", "aac", "flac"].includes(ext) || type.startsWith("audio/")) return { label: "AUDIO", color: "#0e7490", Icon: Mic };
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext) || type.startsWith("video/")) return { label: "VIDEO", color: "#7c3aed", Icon: Film };
  if (["txt", "md", "log"].includes(ext)) return { label: ext.toUpperCase(), color: "#64748b", Icon: FileText };
  if (type.startsWith("image/")) return { label: ext.toUpperCase() || "IMAGE", color: "#be185d", Icon: ImageIcon };
  return { label: ext.toUpperCase() || "FILE", color: "#64748b", Icon: FileIcon };
}

// Attachments are streamed from the API with the bearer token, so they are
// fetched as blobs and shown through a local object URL.
function useAttachmentBlob(url?: string) {
  const [blob, setBlob] = useState<{ url: string; size: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) { setBlob(null); setFailed(false); return; }
    let objectUrl = "";
    let alive = true;
    setBlob(null);
    setFailed(false);
    getChatAttachment(url)
      .then((data) => {
        objectUrl = URL.createObjectURL(data);
        if (alive) setBlob({ url: objectUrl, size: data.size });
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);

  return { blob, failed };
}

function sizeLabel(bytes: number) {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function downloadBlob(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name || "potkeeper-file";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function AttachmentBlock({
  message,
  onOpenImage,
}: {
  message: ChatMessage;
  onOpenImage: (url: string, name: string) => void;
}) {
  const { blob, failed } = useAttachmentBlob(message.attachmentUrl);
  const isAudio = !!message.attachmentType?.startsWith("audio/");
  const isImage = !!message.attachmentType?.startsWith("image/");

  if (failed) return <p className="mt-1 text-[12px] opacity-70">Attachment could not be loaded.</p>;
  if (!blob) return <p className="mt-1 text-[12px] opacity-70">Loading attachment…</p>;
  if (isAudio) return <div className="mt-1"><VoiceNote src={blob.url} label={message.attachmentName} /></div>;
  if (isImage) {
    return (
      <button
        type="button"
        onClick={() => onOpenImage(blob.url, message.attachmentName || "Shared image")}
        className="mt-1 block w-full overflow-hidden rounded-xl"
        aria-label={`Open ${message.attachmentName || "image"}`}
      >
        <img src={blob.url} alt={message.attachmentName || "Shared image"} className="max-h-80 w-full object-cover" />
      </button>
    );
  }

  const kind = fileKind(message.attachmentName, message.attachmentType);
  const Icon = kind.Icon;
  return (
    <div className="mt-1 flex w-[min(19rem,72vw)] max-w-full items-center gap-3 rounded-xl border border-black/[0.06] bg-white p-2.5 dark:border-white/10 dark:bg-[#2a3942]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white shadow-sm" style={{ backgroundColor: kind.color }}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[#111b21] dark:text-[#e9edef]">{message.attachmentName || "Shared file"}</span>
        <span className="mt-0.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {kind.label}{sizeLabel(blob.size) ? ` · ${sizeLabel(blob.size)}` : ""}
        </span>
      </span>
      <button
        type="button"
        onClick={() => downloadBlob(blob.url, message.attachmentName || "potkeeper-file")}
        aria-label={`Download ${message.attachmentName || "file"}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e9edef] text-[#54656f] transition hover:bg-[#dde3e6] dark:bg-white/10 dark:text-[#e9edef] dark:hover:bg-white/20"
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
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
  const [showEmoji, setShowEmoji] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);
  const cancelRecording = useRef(false);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);

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

  // Keep the newest message in view, but never yank a reader who has
  // scrolled up to read history. Attachments load asynchronously, so the
  // content height is watched as well to stay pinned at the bottom.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => {
      stickToBottom.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || loading || !stickToBottom.current) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);


  // Consecutive messages from the same member are grouped into one run, the
  // way messenger apps draw them.
  const rows = useMemo(() => {
    const out: { message: ChatMessage; isFirst: boolean; isLast: boolean; divider?: string }[] = [];
    let lastDay = "";
    messages.forEach((message, index) => {
      const prev = messages[index - 1];
      const next = messages[index + 1];
      const stamp = new Date(message.createdAt).getTime();
      const prevStamp = prev ? new Date(prev.createdAt).getTime() : 0;
      const nextStamp = next ? new Date(next.createdAt).getTime() : 0;
      const sameAsPrev = !!prev && prev.userId === message.userId && stamp - prevStamp < 5 * 60 * 1000;
      const sameAsNext = !!next && next.userId === message.userId && nextStamp - stamp < 5 * 60 * 1000;
      const day = dayKey(message.createdAt);
      const row: { message: ChatMessage; isFirst: boolean; isLast: boolean; divider?: string } = {
        message,
        isFirst: !sameAsPrev,
        isLast: !sameAsNext,
      };
      if (day !== lastDay) {
        row.divider = dayLabel(message.createdAt);
        lastDay = day;
      }
      out.push(row);
    });
    return out;
  }, [messages]);

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

  const insertEmoji = (emoji: string) => {
    const field = textInput.current;
    if (!field) { setBody((current) => current + emoji); return; }
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    setBody((current) => current.slice(0, start) + emoji + current.slice(end));
    requestAnimationFrame(() => {
      field.focus();
      const caret = start + emoji.length;
      field.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#efeae2] text-[#111b21] dark:bg-[#0b141a] dark:text-[#e9edef] lg:bottom-0 lg:left-60">
      <div className="flex items-center gap-3 bg-[#008069] px-3 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] text-white shadow-md dark:bg-[#1f2c33] sm:px-5">
        <Link
          to={`/pots/${id}`}
          className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="Back to pot"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 font-sora font-extrabold text-white">
          {(groupName || "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-sora text-sm font-bold text-white">{groupName}</p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-white/75">
            <span className="h-1.5 w-1.5 rounded-full bg-[#b9f5d0]" /> {participants.length} member{participants.length === 1 ? "" : "s"} · pot room
          </p>
        </div>
      </div>

      <div ref={scrollerRef} className="cp-chat-wall flex-1 overflow-y-auto px-3 py-3 sm:px-5">
        <div ref={contentRef}>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare className="mb-2 h-8 w-8 text-slate-400/70" />
            <p className="text-sm text-slate-500">No messages yet. Say hello to the pot.</p>
          </div>
        ) : (
          rows.map((row) => {
            const m = row.message;
            const mine = m.userId === myId;
            const parent = m.replyToId ? messages.find((x) => x.id === m.replyToId) : null;
            const readers = (m.readBy ?? []).filter((r) => r !== m.userId);
            const isImage = !!m.attachmentType?.startsWith("image/");
            const bubbleBg = mine ? "bg-[#d9fdd3] dark:bg-[#005c4b]" : "bg-white dark:bg-[#202c33]";
            const meta = (
              <span className={cn("flex shrink-0 items-center gap-1 text-[10px] font-medium", mine ? "text-[#4b8a5f] dark:text-white/55" : "text-slate-400")}>
                <span>{clockLabel(m.createdAt)}</span>
                {mine && (readers.length > 0
                  ? <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" aria-label={`Read by ${readers.map(nameById).join(", ")}`} />
                  : <Check className="h-3.5 w-3.5" aria-label="Sent" />)}
              </span>
            );
            return (
              <Fragment key={m.id}>
                {row.divider && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm backdrop-blur dark:bg-white/10 dark:text-slate-300">{row.divider}</span>
                  </div>
                )}
                <div className={cn("group flex items-end gap-2", mine ? "justify-end" : "justify-start", row.isFirst ? "mt-3" : "mt-[2px]")}>
                  {!mine && (row.isLast
                    ? <Avatar id={m.userId} name={m.author} />
                    : <span className="h-0 w-9 shrink-0" />)}
                  <div className={cn("flex min-w-0 max-w-[min(85%,30rem)] items-end gap-1", mine ? "flex-row-reverse" : "flex-row")}>
                    <div className={cn("relative w-fit min-w-0 max-w-full shadow-sm", bubbleBg, mine ? "rounded-br-[6px]" : "rounded-bl-[6px]", isImage ? "rounded-[1.1rem] p-1" : "rounded-[1.1rem] px-3 py-2")}>
                      <span className={cn("cp-bubble-tail", bubbleBg, mine ? "-bottom-1 -right-1" : "-bottom-1 -left-1")} aria-hidden />
                      {row.isFirst && !mine && (
                        <p className="mb-1 text-[12px] font-bold" style={{ color: colorFor(m.userId) }}>{m.author || "Member"}</p>
                      )}
                      {parent && (
                        <div className="mb-1 flex max-w-full items-stretch gap-2 rounded-lg bg-black/[0.05] px-2 py-1.5 dark:bg-white/[0.07]">
                          <span className="w-1 shrink-0 rounded-full bg-[#00a884]" />
                          <span className="min-w-0 flex-1 overflow-hidden">
                            <span className="block truncate text-[12px] font-bold text-[#00a884]">{parent.author || "Member"}</span>
                            <span className="block truncate text-[12px] text-slate-500 dark:text-slate-300">{parent.body || "Attachment"}</span>
                          </span>
                        </div>
                      )}
                      {m.body && !m.attachmentUrl && (
                        <div className="flex items-end gap-2">
                          <p className="flex-1 whitespace-pre-wrap break-words text-[14.5px] leading-[1.35]">{m.body}</p>
                          {meta}
                        </div>
                      )}
                      {m.body && m.attachmentUrl && <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.35]">{m.body}</p>}
                      {m.attachmentUrl && <AttachmentBlock message={m} onOpenImage={(url, name) => setLightbox({ url, name })} />}
                      {m.attachmentUrl && <div className="mt-1 flex justify-end">{meta}</div>}
                      {!m.body && !m.attachmentUrl && <div className="flex justify-end">{meta}</div>}
                    </div>
                    {!mine && (
                      <button
                        type="button"
                        onClick={() => setReplyTo(m)}
                        aria-label={`Reply to ${m.author}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/70 text-slate-500 opacity-60 shadow-sm transition hover:bg-white hover:text-[#008069] dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })
        )}
        <div ref={endRef} />
        </div>
      </div>

      {replyTo && (
        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-white px-3 py-2 dark:border-white/5 dark:bg-[#1f2c33]">
          <div className="flex min-w-0 items-stretch gap-2">
            <span className="w-1 shrink-0 rounded-full bg-[#00a884]" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#00a884]">Replying to {replyTo.author}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{replyTo.body || "Attachment"}</p>
            </div>
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

      {error && <p role="status" className="bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {voiceDraft && voiceDraftUrl && (
        <div className="flex items-center gap-3 border-t border-black/5 bg-[#f0f2f5] px-3 py-2.5 dark:border-white/5 dark:bg-[#1f2c33] sm:px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#00a884] text-white shadow-sm"><Mic className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><VoiceNote src={voiceDraftUrl} label="Voice note ready to send" /></div>
          <button type="button" onClick={() => { setVoiceDraft(null); setVoiceDraftUrl(""); setRecordingSeconds(0); }} className="rounded-full p-2 text-slate-500 hover:bg-white dark:hover:bg-white/10" aria-label="Discard voice note"><X className="h-4 w-4" /></button>
          <button type="button" onClick={sendVoiceNote} disabled={uploading} className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#00a884] px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#009c7a] disabled:opacity-50"><Send className="h-3.5 w-3.5" />{uploading ? "Sending" : "Send"}</button>
        </div>
      )}

      <div className="border-t border-black/5 bg-[#f0f2f5] px-2 py-2 pb-[max(.65rem,env(safe-area-inset-bottom))] dark:border-white/5 dark:bg-[#1f2c33] sm:px-4">
        {recording ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => stopRecording(true)} className="grid h-11 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-white hover:text-rose-600 dark:text-slate-300 dark:hover:bg-white/10" aria-label="Cancel recording"><X className="h-5 w-5" /></button>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-900/20 animate-pulse"><Mic className="h-5 w-5" /></span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recording voice note…</p>
              <div className="mt-1 flex h-4 items-center gap-0.5" aria-hidden="true">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                  <span key={n} className="w-1 animate-pulse rounded-full bg-rose-400" style={{ height: `${5 + (n % 5) * 3}px`, animationDelay: `${n * 70}ms` }} />
                ))}
              </div>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-slate-500 dark:text-slate-300">{clock(recordingSeconds)}</span>
            <button type="button" onClick={() => stopRecording(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white shadow-sm transition hover:bg-[#009c7a]" aria-label="Finish voice note"><Send className="h-5 w-5" /></button>
          </div>
        ) : (
          <div className="relative flex items-end gap-1.5">
            {showEmoji && <EmojiTray onPick={insertEmoji} />}
            <input ref={fileInput} type="file" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.currentTarget.value = ""; }} />
            <button type="button" onClick={() => setShowEmoji((open) => !open)} className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full transition", showEmoji ? "bg-white text-[#00a884] dark:bg-white/10" : "text-slate-500 hover:bg-white hover:text-[#00a884] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-[#00a884]")} aria-label="Insert emoji">
              <Smile className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || !!voiceDraft} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-white hover:text-[#00a884] disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-[#00a884]" aria-label="Attach file">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
            </button>
            <textarea
              ref={textInput}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Write a message…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-black/5 bg-white px-4 py-3 text-sm text-[#111b21] placeholder:text-slate-400 focus:border-[#00a884] focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 dark:border-white/5 dark:bg-[#2a3942] dark:text-[#e9edef] dark:placeholder:text-slate-500"
              disabled={!!voiceDraft}
            />
            {body.trim() ? (
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white shadow-sm transition hover:bg-[#009c7a] disabled:opacity-45"
                aria-label="Send"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={!!voiceDraft}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white shadow-sm transition hover:bg-[#009c7a] disabled:opacity-45"
                aria-label="Record voice note"
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setLightbox(null)}>
          <div className="relative flex max-h-full w-full max-w-3xl flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.name} className="max-h-[78vh] w-auto max-w-full rounded-xl object-contain shadow-2xl" />
            <div className="flex w-full items-center justify-between gap-3">
              <p className="truncate text-xs font-medium text-white/80">{lightbox.name}</p>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => downloadBlob(lightbox.url, lightbox.name)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20" aria-label="Download image"><ArrowDownToLine className="h-4 w-4" /></button>
                <button type="button" onClick={() => setLightbox(null)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20" aria-label="Close image"><X className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </div>
      )}
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
