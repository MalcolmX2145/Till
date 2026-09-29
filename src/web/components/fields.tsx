import { useEffect, useState, type ReactNode } from "react";
import { parseKes } from "@shared/money";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-50";

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

// ComponentPropsWithRef so the sell screen can keep focus on the scan box.
export function TextField(props: React.ComponentPropsWithRef<"input">) {
  return <input {...props} className={inputClass} />;
}

export function SelectField(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return <select {...props} className={inputClass} />;
}

/**
 * Edits shillings but reports integer cents, so no float ever reaches the API.
 * Keeps its own text state so a half-typed "12." is not clobbered on rerender.
 */
export function MoneyField({
  valueCents,
  onChangeCents,
  ...rest
}: {
  valueCents: number;
  onChangeCents: (cents: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState(() => (valueCents / 100).toFixed(2));

  useEffect(() => {
    const parsed = parseKes(text);
    if (parsed !== valueCents) setText((valueCents / 100).toFixed(2));
    // Only resync when the owner changes the value out from under us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueCents]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400">
        KSh
      </span>
      <input
        {...rest}
        value={text}
        inputMode="decimal"
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const cents = parseKes(next);
          if (cents !== null) onChangeCents(cents);
        }}
        onBlur={() => setText((valueCents / 100).toFixed(2))}
        className={`${inputClass} pl-12 text-right tabular-nums`}
      />
    </div>
  );
}

export function NumberField({
  value,
  onChangeNumber,
  ...rest
}: {
  value: number;
  onChangeNumber: (n: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      type="number"
      value={String(value)}
      onChange={(e) => {
        const n = Number(e.target.value);
        onChangeNumber(Number.isFinite(n) ? Math.trunc(n) : 0);
      }}
      className={`${inputClass} text-right tabular-nums`}
    />
  );
}

export function Button({
  variant = "secondary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary:
      "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  } as const;
  return (
    <button
      {...rest}
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
