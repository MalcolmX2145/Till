import { useCallback, useEffect, useState } from "react";
import { formatKes } from "@shared/money";
import type { CategoryDto, ProductDto } from "@shared/schemas";
import { ApiError } from "@web/api/client";
import { categoriesApi, productsApi } from "@web/api/products";
import { ProductEditor } from "@web/components/ProductEditor";
import { Button, SelectField, TextField } from "@web/components/fields";
import { useDebounced } from "@web/hooks/useDebounced";

const PAGE_SIZE = 50;

export function ProductsPage() {
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductDto | null | undefined>(
    undefined,
  );

  const debouncedSearch = useDebounced(search);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await productsApi.list({
        q: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        lowStock,
        includeInactive,
        limit: PAGE_SIZE,
        offset,
      });
      setProducts(res.products);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load products",
      );
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, categoryId, lowStock, includeInactive, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    categoriesApi
      .list()
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]));
  }, []);

  // Any filter change invalidates the current page.
  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, categoryId, lowStock, includeInactive]);

  async function onDeactivate(product: ProductDto) {
    if (
      !confirm(
        `Deactivate "${product.name}"? It disappears from the sell screen but past sales keep it.`,
      )
    ) {
      return;
    }
    try {
      await productsApi.deactivate(product.id);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not deactivate product",
      );
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold text-slate-900">
          Products
        </h1>
        <Button variant="primary" onClick={() => setEditing(null)}>
          New product
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1">
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU or barcode"
            aria-label="Search products"
          />
        </div>
        <div className="w-48">
          <SelectField
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.productCount})
              </option>
            ))}
          </SelectField>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={lowStock}
            onChange={(e) => setLowStock(e.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          Low stock only
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          Show inactive
        </label>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 text-right font-medium">Stock</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  No products match these filters.
                </td>
              </tr>
            )}
            {products.map((p) => {
              const low = p.stockQty <= p.lowStockThreshold;
              return (
                <tr key={p.id} className={p.active ? "" : "bg-slate-50/60"}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">
                      {p.name}
                      {!p.active && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                          inactive
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.sku}
                      {p.barcode ? ` · ${p.barcode}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {p.categoryName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatKes(p.priceCents)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {formatKes(p.costCents)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      low ? "font-semibold text-amber-700" : ""
                    }`}
                  >
                    {p.stockQty}
                    {low && (
                      <span className="ml-1 text-xs font-normal">
                        ≤ {p.lowStockThreshold}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
                    >
                      Edit
                    </button>
                    {p.active && (
                      <button
                        type="button"
                        onClick={() => void onDeactivate(p)}
                        className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(offset > 0 || hasMore) && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <Button
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            Previous
          </Button>
          <span>
            {offset + 1}–{offset + products.length}
          </span>
          <Button disabled={!hasMore} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
            Next
          </Button>
        </div>
      )}

      {editing !== undefined && (
        <ProductEditor
          product={editing}
          categories={categories}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void load();
            categoriesApi
              .list()
              .then((r) => setCategories(r.categories))
              .catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}
