import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@shared/dates";
import {
  REASON_LABELS,
  type LowStockDto,
  type MovementReason,
  type ProductDto,
  type StockMovementDto,
} from "@shared/schemas";
import { ApiError } from "@web/api/client";
import { inventoryApi } from "@web/api/inventory";
import { productsApi } from "@web/api/products";
import { AdjustStockModal } from "@web/components/AdjustStockModal";
import { Button, SelectField, TextField } from "@web/components/fields";
import { useDebounced } from "@web/hooks/useDebounced";

const PAGE_SIZE = 50;

export function InventoryPage() {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [lowStock, setLowStock] = useState<LowStockDto[]>([]);
  const [movements, setMovements] = useState<StockMovementDto[]>([]);
  const [reasonFilter, setReasonFilter] = useState<MovementReason | "">("");
  const [productFilter, setProductFilter] = useState<ProductDto | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [adjusting, setAdjusting] = useState<ProductDto | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search);

  const loadMovements = useCallback(async () => {
    try {
      const res = await inventoryApi.movements({
        ...(productFilter ? { productId: productFilter.id } : {}),
        ...(reasonFilter ? { reason: reasonFilter } : {}),
        limit: PAGE_SIZE,
        offset,
      });
      setMovements(res.movements);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load the history",
      );
    }
  }, [productFilter, reasonFilter, offset]);

  const loadLowStock = useCallback(async () => {
    try {
      const res = await inventoryApi.lowStock();
      setLowStock(res.products);
    } catch {
      setLowStock([]);
    }
  }, []);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  useEffect(() => {
    void loadLowStock();
  }, [loadLowStock]);

  useEffect(() => {
    if (!debouncedSearch) {
      setProducts([]);
      return;
    }
    productsApi
      .list({ q: debouncedSearch, includeInactive: true, limit: 8 })
      .then((r) => setProducts(r.products))
      .catch(() => setProducts([]));
  }, [debouncedSearch]);

  useEffect(() => {
    setOffset(0);
  }, [productFilter, reasonFilter]);

  async function refreshAfterAdjust(delta: number, stockQty: number) {
    const name = adjusting?.name ?? "Stock";
    setAdjusting(null);
    setFlash(
      `${name}: ${delta > 0 ? "+" : ""}${delta}, now ${stockQty} on hand`,
    );
    setSearch("");
    setProducts([]);
    await Promise.all([loadMovements(), loadLowStock()]);
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Inventory</h1>

      {flash && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-medium text-slate-900">Adjust stock</h2>
            <TextField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a product by name, SKU or barcode"
              aria-label="Find a product to adjust"
            />
            {products.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {products.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {p.name}
                        {!p.active && (
                          <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                            inactive
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">{p.sku}</p>
                    </div>
                    <span className="tabular-nums text-slate-600">
                      {p.stockQty} on hand
                    </span>
                    <Button onClick={() => setAdjusting(p)}>Adjust</Button>
                  </li>
                ))}
              </ul>
            )}
            {debouncedSearch && products.length === 0 && (
              <p className="mt-2 text-sm text-slate-400">
                Nothing matches that search.
              </p>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
              <h2 className="mr-auto font-medium text-slate-900">
                Movement history
              </h2>
              {productFilter && (
                <button
                  type="button"
                  onClick={() => setProductFilter(null)}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                >
                  {productFilter.name} ×
                </button>
              )}
              <div className="w-44">
                <SelectField
                  value={reasonFilter}
                  onChange={(e) =>
                    setReasonFilter(e.target.value as MovementReason | "")
                  }
                  aria-label="Filter by reason"
                >
                  <option value="">All reasons</option>
                  {Object.entries(REASON_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Change</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-8 text-center text-slate-400"
                    >
                      No stock movements yet.
                    </td>
                  </tr>
                )}
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">
                        {m.productName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {m.productSku}
                      </div>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        m.delta > 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {m.delta > 0 ? "+" : ""}
                      {m.delta}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {REASON_LABELS[m.reason]}
                      {m.refSaleNo && (
                        <span className="ml-1 text-xs text-slate-400">
                          {m.refSaleNo}
                        </span>
                      )}
                      {m.note && (
                        <div className="text-xs text-slate-400">{m.note}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {m.userName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(offset > 0 || hasMore) && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-slate-600">
                <Button
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                >
                  Previous
                </Button>
                <span>
                  {offset + 1}–{offset + movements.length}
                </span>
                <Button
                  disabled={!hasMore}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-4 py-3 font-medium text-slate-900">
            Low stock
            {lowStock.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                {lowStock.length}
              </span>
            )}
          </h2>
          {lowStock.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Everything is above its threshold.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStock.map((p) => (
                <li key={p.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-slate-900">
                      {p.name}
                    </span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        p.stockQty === 0
                          ? "font-semibold text-red-700"
                          : "text-amber-700"
                      }`}
                    >
                      {p.stockQty} / {p.lowStockThreshold}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      {p.categoryName ?? "Uncategorised"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSearch(p.sku)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Restock
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {adjusting && (
        <AdjustStockModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onAdjusted={(delta, stockQty) =>
            void refreshAfterAdjust(delta, stockQty)
          }
        />
      )}
    </div>
  );
}
