import { useMemo, useState } from "react";
import { formatKes } from "@shared/money";
import {
  mpesaCodeSchema,
  type PaymentInput,
  type PaymentMethod,
} from "@shared/schemas";
import { Modal } from "./Modal";
import { Button, Field, MoneyField, TextField } from "./fields";

interface DraftPayment {
  method: PaymentMethod;
  amountCents: number;
  tenderedCents: number;
  mpesaCode: string;
}

/** Kenyan note denominations, for one-tap cash tendering. */
const QUICK_NOTES = [5000, 10000, 20000, 50000, 100000];

function newDraft(method: PaymentMethod, amountCents: number): DraftPayment {
  return { method, amountCents, tenderedCents: amountCents, mpesaCode: "" };
}

export function CheckoutModal({
  totalCents,
  busy,
  onClose,
  onComplete,
}: {
  totalCents: number;
  busy: boolean;
  onClose: () => void;
  onComplete: (payments: PaymentInput[]) => void;
}) {
  const [drafts, setDrafts] = useState<DraftPayment[]>(() => [
    newDraft("cash", totalCents),
  ]);
  const [error, setError] = useState<string | null>(null);

  const applied = drafts.reduce((sum, d) => sum + d.amountCents, 0);
  const remaining = totalCents - applied;

  const changeCents = useMemo(
    () =>
      drafts.reduce(
        (sum, d) =>
          d.method === "cash"
            ? sum + Math.max(0, d.tenderedCents - d.amountCents)
            : sum,
        0,
      ),
    [drafts],
  );

  function update(index: number, patch: Partial<DraftPayment>) {
    setDrafts((current) =>
      current.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
    setError(null);
  }

  function setMethod(index: number, method: PaymentMethod) {
    update(index, {
      method,
      // Cash defaults to tendering exactly; M-Pesa has no tender concept.
      tenderedCents: drafts[index]?.amountCents ?? 0,
      mpesaCode: "",
    });
  }

  function addSplit() {
    if (remaining <= 0) return;
    const other = drafts[0]?.method === "cash" ? "mpesa" : "cash";
    setDrafts((current) => [...current, newDraft(other, remaining)]);
    setError(null);
  }

  function submit() {
    if (applied !== totalCents) {
      setError(
        remaining > 0
          ? `${formatKes(remaining)} still unpaid`
          : `Payments exceed the total by ${formatKes(-remaining)}`,
      );
      return;
    }

    const payments: PaymentInput[] = [];
    for (const d of drafts) {
      if (d.amountCents <= 0) {
        setError("Every payment must be more than zero");
        return;
      }
      if (d.method === "cash") {
        if (d.tenderedCents < d.amountCents) {
          setError("Cash tendered is less than the amount being paid");
          return;
        }
        payments.push({
          method: "cash",
          amountCents: d.amountCents,
          tenderedCents: d.tenderedCents,
        });
      } else {
        const parsed = mpesaCodeSchema.safeParse(d.mpesaCode);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the M-Pesa code");
          return;
        }
        payments.push({
          method: "mpesa",
          amountCents: d.amountCents,
          mpesaCode: parsed.data,
        });
      }
    }
    onComplete(payments);
  }

  return (
    <Modal
      title="Checkout"
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Completing…" : "Complete sale"}
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-xl bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-300">Total due</span>
          <span className="text-3xl font-bold tabular-nums">
            {formatKes(totalCents)}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {drafts.map((draft, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 p-3"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex rounded-lg bg-slate-100 p-1">
                {(["cash", "mpesa"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(i, m)}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize ${
                      draft.method === m
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500"
                    }`}
                  >
                    {m === "mpesa" ? "M-Pesa" : "Cash"}
                  </button>
                ))}
              </div>
              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setDrafts((c) => c.filter((_, idx) => idx !== i))
                  }
                  className="ml-auto rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <MoneyField
                  valueCents={draft.amountCents}
                  onChangeCents={(c) =>
                    update(i, {
                      amountCents: c,
                      // Snap tendered to the new amount. Leaving a higher
                      // figure behind would record change the customer was
                      // never given.
                      ...(draft.method === "cash" ? { tenderedCents: c } : {}),
                    })
                  }
                />
              </Field>

              {draft.method === "cash" ? (
                <Field
                  label="Cash tendered"
                  hint={
                    draft.tenderedCents > draft.amountCents
                      ? `Change ${formatKes(draft.tenderedCents - draft.amountCents)}`
                      : undefined
                  }
                >
                  <MoneyField
                    valueCents={draft.tenderedCents}
                    onChangeCents={(c) => update(i, { tenderedCents: c })}
                  />
                </Field>
              ) : (
                <Field label="M-Pesa code" hint="From the customer's SMS">
                  <TextField
                    value={draft.mpesaCode}
                    onChange={(e) =>
                      update(i, {
                        mpesaCode: e.target.value.toUpperCase(),
                      })
                    }
                    placeholder="SFH7K2L9XA"
                    spellCheck={false}
                    autoCapitalize="characters"
                  />
                </Field>
              )}
            </div>

            {draft.method === "cash" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => update(i, { tenderedCents: draft.amountCents })}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                >
                  Exact
                </button>
                {QUICK_NOTES.filter((n) => n >= draft.amountCents).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => update(i, { tenderedCents: n })}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 tabular-nums hover:bg-slate-200"
                  >
                    {n / 100}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {remaining !== 0 && (
        <p className="mt-3 text-sm text-amber-700">
          {remaining > 0
            ? `${formatKes(remaining)} still to pay`
            : `Over by ${formatKes(-remaining)}`}
        </p>
      )}

      {drafts.length < 4 && remaining > 0 && (
        <Button type="button" className="mt-3 w-full" onClick={addSplit}>
          Split the remaining {formatKes(remaining)}
        </Button>
      )}

      {changeCents > 0 && (
        <div className="mt-4 flex items-baseline justify-between rounded-xl bg-emerald-50 px-4 py-3">
          <span className="text-sm font-medium text-emerald-900">
            Change due
          </span>
          <span className="text-2xl font-bold text-emerald-900 tabular-nums">
            {formatKes(changeCents)}
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </Modal>
  );
}
