// Transaction PIN entry shared by every surface that moves money out of a
// wallet (send, pay-a-pot, contributions, settings). Numeric-only, 4–6 digits.

interface PinFieldProps {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export function PinField({
  value,
  onChange,
  label = "Transaction PIN",
  hint,
  placeholder = "••••",
  autoFocus = false,
}: PinFieldProps) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
        placeholder={placeholder}
        className="cp-input mt-1 tracking-[0.45em]"
      />
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </label>
  );
}

export default PinField;
