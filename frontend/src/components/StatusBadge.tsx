export type StatusTone = "success" | "info" | "warning" | "danger";

const tones: Record<StatusTone, { pill: string; dot: string }> = {
  success: { pill: "bg-green-50 text-green-700 ring-green-600/20", dot: "bg-green-500" },
  info: { pill: "bg-brand-50 text-brand-700 ring-brand-600/20", dot: "bg-brand-600" },
  warning: { pill: "bg-amber-50 text-amber-700 ring-amber-600/20", dot: "bg-amber-500" },
  danger: { pill: "bg-red-50 text-red-700 ring-red-600/20", dot: "bg-red-500" },
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
