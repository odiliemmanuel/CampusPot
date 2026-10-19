import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square, X } from "lucide-react";

// Minimal typings for the Web Speech API (not in the default DOM lib).
interface SpeechResult {
  [index: number]: { transcript: string };
  isFinal?: boolean;
}
interface SpeechResultList {
  length: number;
  [index: number]: SpeechResult;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: SpeechResultList }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

// Turn a spoken phrase like "twenty thousand" into 20000.
function spokenWordsToNumber(text: string): number {
  let total = 0;
  let current = 0;
  let found = false;
  for (const tok of text.toLowerCase().split(/[\s-]+/)) {
    if (/^\d[\d,]*$/.test(tok)) {
      current += parseInt(tok.replace(/,/g, ""), 10);
      found = true;
    } else if (ONES[tok] != null) {
      current += ONES[tok];
      found = true;
    } else if (tok === "hundred") {
      current = (current || 1) * 100;
      found = true;
    } else if (tok === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
      found = true;
    } else if (tok === "million") {
      total += (current || 1) * 1_000_000;
      current = 0;
      found = true;
    }
  }
  return found ? total + current : 0;
}

const CUE = /(naira|kobo|₦|\bbudget\b|\blimit\b|large ?spend|\balert\b)/;

function scale(value: number, unit: string | undefined): number {
  if (!unit) return value;
  if (unit.startsWith("k") || unit.startsWith("thousand")) return value * 1000;
  if (unit === "m" || unit.startsWith("million")) return value * 1_000_000;
  return value;
}

function extractNaira(text: string): number | null {
  const lower = text.toLowerCase();
  if (!CUE.test(lower)) return null;

  for (const d of lower.matchAll(/(\d[\d,]*)\s*(k|thousand|m|million)?/g)) {
    const idx = d.index ?? 0;
    const before = lower.slice(Math.max(0, idx - 14), idx);
    const after = lower.slice(idx + d[0].length, idx + d[0].length + 14);
    if (CUE.test(before) || CUE.test(after)) {
      return scale(parseInt(d[1].replace(/,/g, ""), 10), d[2]);
    }
  }

  const words = lower.replace(/,/g, " ").split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    if (CUE.test(words[i])) {
      const near = [...words.slice(Math.max(0, i - 5), i), ...words.slice(i + 1, i + 6)].join(" ");
      const n = spokenWordsToNumber(near);
      if (n > 0) return n;
    }
  }
  return null;
}

// "create a pot called 200L Dues with a 50k limit" → { name: "200L Dues", amountKobo: 5000000 }
function parseCommand(raw: string): { name: string; amountKobo?: number } {
  const trimmed = raw.trim();
  const naira = extractNaira(trimmed);

  let name = trimmed;
  name = name.replace(/^(hey |ok |okay |please )*/i, "");
  name = name.replace(/^(pot ?keeper|campus ?pot)[ ,]*/i, "");
  name = name.replace(
    /^(please )?(create|start|make|open|set ?up|setup|add)( a| an| the)?( new| another)?( pot)?( called| named| for| to)?[ ]*/i,
    ""
  );

  if (naira != null) {
    name = name
      .replace(/₦/g, " ")
      .replace(/\b(naira|kobo|budget|limit|large ?spend|alert|about|around|of)\b/gi, " ")
      .replace(/\b\d[\d,]*\s*(k|thousand|m|million)?\b/gi, " ")
      .replace(
        /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\b/gi,
        " "
      );
  }

  name = name.replace(/\s+/g, " ").replace(/^[\s,.-]+|[\s,.-]+$/g, "").trim();
  if (!name) name = trimmed;
  name = name.charAt(0).toUpperCase() + name.slice(1);

  return { name, amountKobo: naira != null ? naira * 100 : undefined };
}

export default function VoicePotButton({
  onResult,
}: {
  onResult: (result: { name: string; amountKobo?: number }) => void;
}) {
  const [supported] = useState(() => getCtor() !== null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [hint, setHint] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");

  if (!supported) return null;

  const finish = () => {
    const text = transcriptRef.current.trim();
    setListening(false);
    recognitionRef.current = null;
    if (!text) {
      setHint("I didn't catch that. Tap and try again.");
      return;
    }
    const parsed = parseCommand(text);
    onResult(parsed);
    setTranscript("");
    setHint(`Got it — “${parsed.name}”${parsed.amountKobo ? `, alert at ₦${(parsed.amountKobo / 100).toLocaleString()}` : ""}.`);
    setTimeout(() => setHint(""), 4000);
  };

  const start = () => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setHint("");
    setTranscript("");
    transcriptRef.current = "";

    const rec = new Ctor();
    rec.lang = "en-NG";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      transcriptRef.current = text;
      setTranscript(text);
    };
    rec.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
      setHint("Microphone unavailable — check your browser permissions.");
    };
    rec.onend = finish;

    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      recognitionRef.current = null;
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  return (
    <>
      <AnimatePresence>
        {(listening || transcript || hint) && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            className="fixed bottom-40 right-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-100 bg-white p-4 shadow-xl sm:bottom-24 sm:right-6 dark:border-white/10 dark:bg-panel-dark"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
                <Mic className="h-3.5 w-3.5" /> Voice create
              </p>
              <button
                type="button"
                onClick={stop}
                aria-label="Close"
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {listening && (
              <p className="mt-2 text-xs text-slate-400">
                Listening… say “create a pot called Trip to Ghana”.
              </p>
            )}
            {transcript && (
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">“{transcript}”</p>
            )}
            {hint && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{hint}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={listening ? stop : start}
        aria-label={listening ? "Stop voice input" : "Create a pot by voice"}
        className={[
          "fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition active:scale-95 sm:bottom-8 sm:right-6",
          listening
            ? "animate-pulse bg-violet-500 shadow-violet-500/40"
            : "bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand-600/40",
        ].join(" ")}
      >
        {listening ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6" />}
        {listening && (
          <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/40" />
        )}
      </button>
    </>
  );
}
