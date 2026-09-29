import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { formatKes } from "@shared/money";
import type { CategoryDto, PaymentInput, ProductDto } from "@shared/schemas";
import { ApiError } from "@web/api/client";
import { categoriesApi, productsApi } from "@web/api/products";
import { salesApi, type CreatedSale } from "@web/api/sales";
import { CartPanel } from "@web/components/CartPanel";
import { CheckoutModal } from "@web/components/CheckoutModal";
import { TextField } from "@web/components/fields";
import { useCart } from "@web/hooks/useCart";
import { useDebounced } from "@web/hooks/useDebounced";

/** A keyboard-wedge scanner sends digits then Enter; nothing shorter is a barcode. */
const MIN_BARCODE_LENGTH = 6;

export function SellPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState<CreatedSale | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounced(search, 200);

  const focusSearch = useCallback(() => searchRef.current?.focus(), []);

  useEffect(() => {
    categoriesApi
      .list()
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    productsApi
      .list({
        q: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        limit: 60,
      })
      .then((r) => {
        if (!cancelled) setProducts(r.products);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, categoryId]);

  const addProduct = useCallback(
    (product: ProductDto) => {
      const failure = cart.add(product);
      if (failure) {
        setError(failure);
        setNotice(null);
      } else {
        setError(null);
        setNotice(`${product.name} added`);
      }
    },
    [cart],
  );

  /** Enter in the search box: exact barcode first, then a single search hit. */
  const onSearchEnter = useCallback(async () => {
    const term = search.trim();
    if (!term) return;

    if (/^\d+$/.test(term) && term.length >= MIN_BARCODE_LENGTH) {
      try {
        const { product } = await productsApi.lookupBarcode(term);
        addProduct(product);
        setSearch("");
        return;
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 404) {
          setError("Could not reach the server");
          return;
        }
        setError(`No product with barcode ${term}`);
        setSearch("");
        return;
      }
    }

    if (products.length === 1) {
      addProduct(products[0]!);
      setSearch("");
    }
  }, [search, products, addProduct]);

  // A scanner types wherever focus happens to be. If a printable key arrives
  // while nothing is focused, send it to the search box so the scan is not lost.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (e.key === "F2") {
        e.preventDefault();
        if (cart.lines.length > 0) setCheckoutOpen(true);
        return;
      }
      if (e.key === "Escape" && !checkoutOpen) {
        setSearch("");
        focusSearch();
        return;
      }
      if (
        !typing &&
        !checkoutOpen &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        focusSearch();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cart.lines.length, checkoutOpen, focusSearch]);

  async function completeSale(payments: PaymentInput[]) {
    setBusy(true);
    setError(null);
    try {
      const { sale } = await salesApi.create({
        items: cart.lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          discountCents: l.discountCents,
        })),
        cartDiscountCents: cart.cartDiscountCents,
        payments,
      });
      cart.clear();
      setCheckoutOpen(false);
      setLastSale(sale);
      setSearch("");
      focusSearch();
      // Stock changed, so refresh what the grid is showing.
      const refreshed = await productsApi.list({
        q: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        limit: 60,
      });
      setProducts(refreshed.products);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not complete the sale",
      );
      if (err instanceof ApiError && err.status === 409) setCheckoutOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col p-3">
        <div className="flex gap-2">
          <TextField
            ref={searchRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onSearchEnter();
              }
            }}
            placeholder="Scan barcode or search name / SKU"
            aria-label="Scan or search"
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <CategoryChip
            label="All"
            active={categoryId === ""}
            onClick={() => setCategoryId("")}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.name}
              active={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
            />
          ))}
        </div>

        {(error || notice || lastSale) && (
          <div className="mt-2">
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            {!error && lastSale && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span className="font-medium">
                  {lastSale.saleNo} completed · {formatKes(lastSale.totalCents)}
                </span>
                {lastSale.changeCents > 0 && (
                  <span className="font-semibold">
                    Change {formatKes(lastSale.changeCents)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/receipt/${lastSale.id}`)}
                  className="rounded border border-emerald-300 px-2 py-0.5 font-medium hover:bg-emerald-100"
                >
                  Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setLastSale(null)}
                  aria-label="Dismiss"
                  className="ml-auto px-1 text-emerald-600"
                >
                  ×
                </button>
              </div>
            )}
            {!error && !lastSale && notice && (
              <p className="px-1 text-sm text-slate-500">{notice}</p>
            )}
          </div>
        )}

        <div className="mt-2 min-h-0 flex-1 overflow-auto">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => {
              const inCart = cart.lineOf(p.id)?.qty ?? 0;
              const out = p.stockQty <= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  disabled={out}
                  className={`relative flex flex-col rounded-xl border p-3 text-left transition-colors ${
                    out
                      ? "border-slate-200 bg-slate-50 opacity-60"
                      : "border-slate-200 bg-white hover:border-slate-900 active:bg-slate-50"
                  }`}
                >
                  <span className="line-clamp-2 text-sm font-medium text-slate-900">
                    {p.name}
                  </span>
                  <span className="mt-auto pt-2 text-lg font-semibold tabular-nums text-slate-900">
                    {formatKes(p.priceCents)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {out ? "Out of stock" : `${p.stockQty} in stock`}
                  </span>
                  {inCart > 0 && (
                    <span className="absolute top-2 right-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                      {inCart}
                    </span>
                  )}
                </button>
              );
            })}
            {products.length === 0 && (
              <p className="col-span-full py-12 text-center text-sm text-slate-400">
                Nothing matches that search.
              </p>
            )}
          </div>
        </div>
      </section>

      <aside className="h-[55vh] shrink-0 border-t border-slate-200 lg:h-auto lg:w-96 lg:border-t-0 lg:border-l">
        <CartPanel
          cart={cart}
          disabled={busy}
          onCheckout={() => setCheckoutOpen(true)}
        />
      </aside>

      {checkoutOpen && (
        <CheckoutModal
          totalCents={cart.totals.totalCents}
          busy={busy}
          onClose={() => {
            setCheckoutOpen(false);
            focusSearch();
          }}
          onComplete={(payments) => void completeSale(payments)}
        />
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
