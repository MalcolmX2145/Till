import { useCallback, useMemo, useState } from "react";
import { computeTotals, lineTotal } from "@shared/cart";
import { MAX_CART_LINES, type ProductDto } from "@shared/schemas";

export interface CartLine {
  productId: string;
  name: string;
  sku: string;
  unitPriceCents: number;
  unitCostCents: number;
  qty: number;
  discountCents: number;
  /** Stock at the time the line was added, used to warn before the server does. */
  stockQty: number;
}

export interface CartApi {
  lines: CartLine[];
  cartDiscountCents: number;
  totals: ReturnType<typeof computeTotals>;
  /** Null on success, otherwise why the product could not be added. */
  add: (product: ProductDto, qty?: number) => string | null;
  setQty: (productId: string, qty: number) => void;
  setDiscount: (productId: string, cents: number) => void;
  remove: (productId: string) => void;
  setCartDiscount: (cents: number) => void;
  clear: () => void;
  lineOf: (productId: string) => CartLine | undefined;
}

export function useCart(): CartApi {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartDiscountCents, setCartDiscountRaw] = useState(0);

  const add = useCallback<CartApi["add"]>((product, qty = 1) => {
    if (product.stockQty <= 0) return `${product.name} is out of stock`;

    let error: string | null = null;
    setLines((current) => {
      const index = current.findIndex((l) => l.productId === product.id);

      if (index === -1) {
        if (current.length >= MAX_CART_LINES) {
          error = `A sale can hold at most ${MAX_CART_LINES} different items`;
          return current;
        }
        return [
          ...current,
          {
            productId: product.id,
            name: product.name,
            sku: product.sku,
            unitPriceCents: product.priceCents,
            unitCostCents: product.costCents,
            qty: Math.min(qty, product.stockQty),
            discountCents: 0,
            stockQty: product.stockQty,
          },
        ];
      }

      const existing = current[index]!;
      const wanted = existing.qty + qty;
      if (wanted > existing.stockQty) {
        error = `Only ${existing.stockQty} of ${product.name} in stock`;
        return current;
      }
      const next = [...current];
      next[index] = { ...existing, qty: wanted };
      return next;
    });

    return error;
  }, []);

  const setQty = useCallback<CartApi["setQty"]>((productId, qty) => {
    setLines((current) =>
      current.flatMap((l) => {
        if (l.productId !== productId) return [l];
        if (qty <= 0) return [];
        const capped = Math.min(qty, l.stockQty);
        // A discount larger than the shrunken line would make it negative.
        const discountCents = Math.min(
          l.discountCents,
          capped * l.unitPriceCents,
        );
        return [{ ...l, qty: capped, discountCents }];
      }),
    );
  }, []);

  const setDiscount = useCallback<CartApi["setDiscount"]>((productId, cents) => {
    setLines((current) =>
      current.map((l) =>
        l.productId === productId
          ? {
              ...l,
              discountCents: Math.max(
                0,
                Math.min(cents, l.qty * l.unitPriceCents),
              ),
            }
          : l,
      ),
    );
  }, []);

  const remove = useCallback<CartApi["remove"]>((productId) => {
    setLines((current) => current.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setCartDiscountRaw(0);
  }, []);

  const totals = useMemo(
    () => computeTotals(lines, cartDiscountCents),
    [lines, cartDiscountCents],
  );

  const setCartDiscount = useCallback<CartApi["setCartDiscount"]>((cents) => {
    setCartDiscountRaw(Math.max(0, cents));
  }, []);

  const lineOf = useCallback(
    (productId: string) => lines.find((l) => l.productId === productId),
    [lines],
  );

  return {
    lines,
    cartDiscountCents,
    totals,
    add,
    setQty,
    setDiscount,
    remove,
    setCartDiscount,
    clear,
    lineOf,
  };
}

export { lineTotal };
