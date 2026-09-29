import { useState } from "react";
import type { AdjustStockInput, ProductDto } from "@shared/schemas";
import { ApiError } from "@web/api/client";
import { inventoryApi } from "@web/api/inventory";
import { Modal } from "./Modal";
import { Button, Field, NumberField, TextField } from "./fields";

type Reason = "restock" | "damage" | "correction";

const REASONS: { value: Reason; label: string; help: string }[] = [
  {
    value: "restock",
    label: "Restock",
    help: "Stock arriving from a supplier.",
  },
  {
    value: "damage",
    label: "Damage / loss",
    help: "Broken, expired or missing stock.",
  },
  {
    value: "correction",
    label: "Correction",
    help: "A stocktake: enter what you actually counted.",
  },
];

export function AdjustStockModal({
  product,
  onClose,
  onAdjusted,
}: {
  product: ProductDto;
  onClose: () => void;
  onAdjusted: (delta: number, stockQty: number) => void;
}) {
  const [reason, setReason] = useState<Reason>("restock");
  const [qty, setQty] = useState(1);
  const [countedQty, setCountedQty] = useState(product.stockQty);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const delta =
    reason === "restock"
      ? qty
      : reason === "damage"
        ? -qty
        : countedQty - product.stockQty;

  const resulting = product.stockQty + delta;
  const wouldGoNegative = resulting < 0;
  const noChange = delta === 0;

  async function submit() {
    setError(null);
    const input: AdjustStockInput =
      reason === "correction"
        ? {
            reason: "correction",
            productId: product.id,
            countedQty,
            ...(note.trim() ? { note: note.trim() } : {}),
          }
        : {
            reason,
            productId: product.id,
            qty,
            ...(note.trim() ? { note: note.trim() } : {}),
          };

    setBusy(true);
    try {
      const res = await inventoryApi.adjust(input);
      onAdjusted(res.adjustment.delta, res.adjustment.stockQty);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not adjust the stock",
      );
    } finally {
      setBusy(false);
    }
  }

  const active = REASONS.find((r) => r.value === reason)!;

  return (
    <Modal
      title={`Adjust stock — ${product.name}`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || noChange || wouldGoNegative}
          >
            {busy ? "Saving…" : "Apply adjustment"}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-baseline justify-between rounded-lg bg-slate-50 px-3 py-2">
        <span className="text-sm text-slate-600">Currently on hand</span>
        <span className="text-xl font-semibold tabular-nums">
          {product.stockQty}
        </span>
      </div>

      <div className="mb-3 flex rounded-lg bg-slate-100 p-1">
        {REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => {
              setReason(r.value);
              setError(null);
            }}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium ${
              reason === r.value
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-slate-500">{active.help}</p>

      {reason === "correction" ? (
        <Field label="Counted on the shelf">
          <NumberField
            value={countedQty}
            onChangeNumber={setCountedQty}
            min={0}
            autoFocus
          />
        </Field>
      ) : (
        <Field
          label={reason === "restock" ? "Quantity received" : "Quantity lost"}
        >
          <NumberField
            value={qty}
            onChangeNumber={setQty}
            min={1}
            autoFocus
          />
        </Field>
      )}

      <div className="mt-3">
        <Field label="Note" hint="Optional, but useful when reviewing later">
          <TextField
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              reason === "restock"
                ? "Delivery from supplier"
                : reason === "damage"
                  ? "Expired stock"
                  : "Monthly stocktake"
            }
            maxLength={200}
          />
        </Field>
      </div>

      <div className="mt-4 flex items-baseline justify-between rounded-lg border border-slate-200 px-3 py-2">
        <span className="text-sm text-slate-600">
          {noChange ? "No change" : delta > 0 ? "Adding" : "Removing"}
        </span>
        <span className="tabular-nums">
          {!noChange && (
            <span
              className={`mr-3 font-semibold ${
                delta > 0 ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          )}
          <span className="text-slate-500">new level</span>{" "}
          <span className="text-xl font-semibold">{resulting}</span>
        </span>
      </div>

      {wouldGoNegative && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          Stock cannot go below zero.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </Modal>
  );
}
