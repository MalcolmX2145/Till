import { lineTotal } from "@shared/cart";
import { formatKes } from "@shared/money";
import type { CartApi } from "@web/hooks/useCart";
import { Button, MoneyField } from "./fields";

export function CartPanel({
  cart,
  onCheckout,
  disabled,
}: {
  cart: CartApi;
  onCheckout: () => void;
  disabled: boolean;
}) {
  const { lines, totals } = cart;

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-900">
          Cart
          {lines.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              {lines.length} {lines.length === 1 ? "item" : "items"}
            </span>
          )}
        </h2>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={cart.clear}
            className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            Clear
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {lines.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-400">
            Scan a barcode or tap a product to start.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lines.map((line) => {
              const atStockCap = line.qty >= line.stockQty;
              return (
                <li key={line.productId} className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {line.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatKes(line.unitPriceCents)} each
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {formatKes(lineTotal(line))}
                    </span>
                    <button
                      type="button"
                      onClick={() => cart.remove(line.productId)}
                      aria-label={`Remove ${line.name}`}
                      className="rounded px-1.5 text-slate-300 hover:bg-slate-100 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-slate-300">
                      <button
                        type="button"
                        onClick={() => cart.setQty(line.productId, line.qty - 1)}
                        aria-label={`One fewer ${line.name}`}
                        className="px-3 py-1.5 text-lg leading-none text-slate-600 hover:bg-slate-100"
                      >
                        −
                      </button>
                      <input
                        value={String(line.qty)}
                        onChange={(e) =>
                          cart.setQty(
                            line.productId,
                            Number(e.target.value.replace(/\D/g, "")) || 0,
                          )
                        }
                        inputMode="numeric"
                        aria-label={`Quantity of ${line.name}`}
                        className="w-12 border-x border-slate-300 py-1.5 text-center tabular-nums outline-none focus:bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={() => cart.setQty(line.productId, line.qty + 1)}
                        disabled={atStockCap}
                        aria-label={`One more ${line.name}`}
                        className="px-3 py-1.5 text-lg leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex-1">
                      <MoneyField
                        valueCents={line.discountCents}
                        onChangeCents={(c) => cart.setDiscount(line.productId, c)}
                        aria-label={`Discount on ${line.name}`}
                      />
                    </div>
                  </div>

                  {atStockCap && (
                    <p className="mt-1 text-xs text-amber-700">
                      All {line.stockQty} in stock are in the cart
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-3">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-slate-600">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatKes(totals.subtotalCents)}</dd>
          </div>
          {totals.lineDiscountCents > 0 && (
            <div className="flex justify-between text-slate-600">
              <dt>Line discounts</dt>
              <dd className="tabular-nums">
                −{formatKes(totals.lineDiscountCents)}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between text-slate-600">
            <dt className="whitespace-nowrap">Cart discount</dt>
            <dd className="w-32">
              <MoneyField
                valueCents={cart.cartDiscountCents}
                onChangeCents={cart.setCartDiscount}
                aria-label="Cart discount"
              />
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
          <span className="font-semibold text-slate-900">Total</span>
          <span className="text-3xl font-bold tabular-nums text-slate-900">
            {formatKes(totals.totalCents)}
          </span>
        </div>

        <Button
          variant="primary"
          onClick={onCheckout}
          disabled={disabled || lines.length === 0}
          className="mt-3 w-full py-3 text-lg"
        >
          Checkout <span className="ml-1 text-sm opacity-60">F2</span>
        </Button>
      </div>
    </div>
  );
}
