export type StatusTone = "success" | "info" | "warning" | "danger";

const tones: Record<StatusTone, { pill: string; dot: string }> = {
  success: { pill: "bg-violet-50 text-violet-700 ring-violet-600/20", dot: "bg-violet-500" },
  info: { pill: "bg-brand-50 text-brand-700 ring-brand-600/20", dot: "bg-brand-600" },
  warning: { pill: "bg-violet-50 text-violet-700 ring-violet-600/20", dot: "bg-violet-500" },
  danger: { pill: "bg-violet-50 text-violet-700 ring-violet-600/20", dot: "bg-violet-500" },
};

// Rounded status pill with a coloured dot, e.g. Paid / Pending / Overdue.
export default function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  const t = tones[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${t.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
