import { useEffect, useState } from "react";
import { Cpu, Landmark } from "lucide-react";
import { getMeta, type AppMeta } from "../lib/api";

// ModeBadges shows which AI and B Moni backends are live. It is deliberately
// transparent for judges: the app is fully usable with the offline
// rule-based AI and the in-process B Moni mock.
export default function ModeBadges() {
  const [meta, setMeta] = useState<AppMeta | null>(null);

  useEffect(() => {
    let alive = true;
    getMeta()
      .then((m) => alive && setMeta(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!meta) return null;

  const llmLive = meta.aiMode === "llm";
  const sandboxLive = meta.bmoniMode === "sandbox";

  return (
    <div className="hidden items-center gap-1.5 md:flex">
      <Badge
        icon={<Cpu className="h-3.5 w-3.5" />}
        label={`AI: ${meta.aiMode}`}
        tone={llmLive ? "green" : "slate"}
      />
      <Badge
        icon={<Landmark className="h-3.5 w-3.5" />}
        label={`B Moni: ${meta.bmoniMode}`}
        tone={sandboxLive ? "green" : "amber"}
      />
    </div>
  );
}

function Badge({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "green" | "amber" | "slate";
}) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {icon}
      {label}
    </span>
  );
}
