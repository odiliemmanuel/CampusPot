// Money helpers. The backend stores every amount as integer kobo
// (1 naira = 100 kobo) so there is never a floating-point rounding error.

/** Format kobo as a Naira string, e.g. 250000 -> "₦2,500.00". */
export function formatNaira(kobo: number): string {
  return (
    "₦" +
    (kobo / 100).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Compact form for hero numbers: "₦2.5k". */
export function formatNairaCompact(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1)}m`;
  if (naira >= 1_000) return `₦${(naira / 1_000).toFixed(1)}k`;
  return `₦${naira.toFixed(0)}`;
}

/** Parse a naira string from a form field into integer kobo. */
export function nairaToKobo(input: string): number {
  const n = Number(input.replace(/[^0-9.]/g, ""));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
