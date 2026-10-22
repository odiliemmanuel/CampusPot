import { AlertTriangle } from "lucide-react";

/**
 * Red, prominent alert used for a wrong transaction PIN, a wrong password, or
 * any send/pay failure. Deliberately louder than plain inline text so a refused
 * credential can't be missed.
 */
export function AlertError({ message, className = "" }: { message: string; className?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={`flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export default AlertError;
