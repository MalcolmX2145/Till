import { useState, type FormEvent } from "react";
import { formatKes } from "@shared/money";
import {
  createProductSchema,
  type CategoryDto,
  type ProductDto,
} from "@shared/schemas";
import { ApiError } from "@web/api/client";
import { productsApi } from "@web/api/products";
import { Modal } from "./Modal";
import {
  Button,
  Field,
  MoneyField,
  NumberField,
  SelectField,
  TextField,
} from "./fields";

interface Draft {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  priceCents: number;
  costCents: number;
  stockQty: number;
  lowStockThreshold: number;
  active: boolean;
}

function draftFrom(product: ProductDto | null): Draft {
  return {
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    categoryId: product?.categoryId ?? "",
    priceCents: product?.priceCents ?? 0,
    costCents: product?.costCents ?? 0,
    stockQty: product?.stockQty ?? 0,
    lowStockThreshold: product?.lowStockThreshold ?? 5,
    active: product?.active ?? true,
  };
}

export function ProductEditor({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: ProductDto | null;
  categories: CategoryDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = product !== null;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors(({ [key as string]: _drop, ...rest }) => rest);
    setFormError(null);
  };

  const margin = draft.priceCents - draft.costCents;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const candidate = {
      ...draft,
      barcode: draft.barcode.trim(),
      categoryId: draft.categoryId === "" ? null : draft.categoryId,
    };

    const parsed = createProductSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setBusy(true);
    try {
      if (isEdit) {
        // stockQty is intentionally not sent: stock only moves through
        // inventory adjustments so every change is logged.
        await productsApi.update(product.id, {
          name: parsed.data.name,
          sku: parsed.data.sku,
          barcode: candidate.barcode === "" ? null : candidate.barcode,
          categoryId: candidate.categoryId,
          priceCents: parsed.data.priceCents,
          costCents: parsed.data.costCents,
          lowStockThreshold: parsed.data.lowStockThreshold,
          active: parsed.data.active,
        });
      } else {
        await productsApi.create(parsed.data);
      }
      onSaved();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save the product",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${product.name}` : "New product"}
      onClose={onClose}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="product-form"
            variant="primary"
            disabled={busy}
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create product"}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} className="space-y-3">
        <Field label="Name" error={errors.name}>
          <TextField
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU" error={errors.sku}>
            <TextField
              value={draft.sku}
              onChange={(e) => set("sku", e.target.value)}
              spellCheck={false}
            />
          </Field>
          <Field
            label="Barcode"
            error={errors.barcode}
            hint="Optional. Scanned on the sell screen."
          >
            <TextField
              value={draft.barcode}
              onChange={(e) => set("barcode", e.target.value)}
              spellCheck={false}
              inputMode="numeric"
            />
          </Field>
        </div>

        <Field label="Category" error={errors.categoryId}>
          <SelectField
            value={draft.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
          >
            <option value="">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Selling price" error={errors.priceCents}>
            <MoneyField
              valueCents={draft.priceCents}
              onChangeCents={(c) => set("priceCents", c)}
            />
          </Field>
          <Field
            label="Cost price"
            error={errors.costCents}
            hint={
              draft.costCents > 0
                ? `Margin ${formatKes(margin)}`
                : "Used for the gross profit report"
            }
          >
            <MoneyField
              valueCents={draft.costCents}
              onChangeCents={(c) => set("costCents", c)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={isEdit ? "Stock on hand" : "Opening stock"}
            error={errors.stockQty}
            hint={
              isEdit
                ? "Change stock from the Inventory screen so it is logged"
                : undefined
            }
          >
            <NumberField
              value={draft.stockQty}
              onChangeNumber={(n) => set("stockQty", n)}
              min={0}
              disabled={isEdit}
            />
          </Field>
          <Field
            label="Low-stock alert at"
            error={errors.lowStockThreshold}
            hint="Appears on the dashboard at or below this"
          >
            <NumberField
              value={draft.lowStockThreshold}
              onChangeNumber={(n) => set("lowStockThreshold", n)}
              min={0}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => set("active", e.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            Active — available on the sell screen
          </span>
        </label>

        {formError && (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
