/**
 * Cart arithmetic, shared by the sell screen and the checkout route so the
 * total a cashier reads off the screen is computed by the same code that
 * writes the sale. All values are integer cents.
 */

export interface CartLineMath {
  qty: number;
  unitPriceCents: number;
  unitCostCents: number;
  /** Discount applied to the whole line, not per unit. */
  discountCents: number;
}

export interface CartTotals {
  /** Sum of qty x unit price, before any discount. */
  subtotalCents: number;
  lineDiscountCents: number;
  cartDiscountCents: number;
  /** Line discounts plus the cart-level discount. */
  discountCents: number;
  totalCents: number;
  /** Sum of qty x unit cost, for the gross profit report. */
  costTotalCents: number;
}

export function lineGross(line: CartLineMath): number {
  return line.qty * line.unitPriceCents;
}

export function lineTotal(line: CartLineMath): number {
  return lineGross(line) - line.discountCents;
}

export function computeTotals(
  lines: readonly CartLineMath[],
  cartDiscountCents = 0,
): CartTotals {
  let subtotalCents = 0;
  let lineDiscountCents = 0;
  let costTotalCents = 0;

  for (const line of lines) {
    subtotalCents += lineGross(line);
    lineDiscountCents += line.discountCents;
    costTotalCents += line.qty * line.unitCostCents;
  }

  const afterLines = subtotalCents - lineDiscountCents;
  // A cart discount larger than what is left would make the total negative.
  const cartDiscount = Math.min(Math.max(cartDiscountCents, 0), afterLines);

  return {
    subtotalCents,
    lineDiscountCents,
    cartDiscountCents: cartDiscount,
    discountCents: lineDiscountCents + cartDiscount,
    totalCents: afterLines - cartDiscount,
    costTotalCents,
  };
}

/**
 * Splits a cart-level discount across lines so each sale_item carries its
 * share. Without this a refund of one line could not tell how much of the
 * cart discount belonged to it.
 *
 * Distributes by line value and gives any remaining cents to the largest
 * lines, so the parts always sum exactly to the cart discount.
 */
export function allocateCartDiscount(
  lines: readonly CartLineMath[],
  cartDiscountCents: number,
): number[] {
  const values = lines.map((l) => lineTotal(l));
  const pool = values.reduce((a, b) => a + b, 0);
  if (cartDiscountCents <= 0 || pool <= 0) return lines.map(() => 0);

  const capped = Math.min(cartDiscountCents, pool);
  const shares = values.map((v) => Math.floor((v * capped) / pool));
  let remainder = capped - shares.reduce((a, b) => a + b, 0);

  // Hand out the rounding remainder one cent at a time, largest line first,
  // skipping lines that would end up discounted below zero value.
  const order = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.i);

  for (let pass = 0; remainder > 0 && pass < 2; pass++) {
    for (const i of order) {
      if (remainder === 0) break;
      if (shares[i]! < values[i]!) {
        shares[i]! += 1;
        remainder -= 1;
      }
    }
  }

  return shares;
}
