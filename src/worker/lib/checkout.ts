import { allocateCartDiscount, computeTotals, lineGross } from "../../shared/cart";
import type { CreateSaleInput, PaymentInput } from "../../shared/schemas";
import { badRequest, conflict } from "./http";

export interface PricedProduct {
  id: string;
  name: string;
  sku: string;
  priceCents: number;
  costCents: number;
  stockQty: number;
  active: number;
}

export interface PreparedLine {
  productId: string;
  name: string;
  sku: string;
  unitPriceCents: number;
  unitCostCents: number;
  qty: number;
  /** Line discount plus this line's share of the cart discount. */
  discountCents: number;
  lineTotalCents: number;
}

export interface PreparedSale {
  lines: PreparedLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  costTotalCents: number;
  payments: PreparedPayment[];
  changeCents: number;
}

export interface PreparedPayment {
  method: "cash" | "mpesa";
  amountCents: number;
  tenderedCents: number | null;
  changeCents: number | null;
  mpesaCode: string | null;
}

/**
 * Two lines for the same product would each deduct stock separately and
 * produce two snapshot rows for one item, so they are merged first.
 */
export function mergeItems(
  items: CreateSaleInput["items"],
): { productId: string; qty: number; discountCents: number }[] {
  const merged = new Map<string, { productId: string; qty: number; discountCents: number }>();
  for (const item of items) {
    const existing = merged.get(item.productId);
    if (existing) {
      existing.qty += item.qty;
      existing.discountCents += item.discountCents;
    } else {
      merged.set(item.productId, { ...item });
    }
  }
  return [...merged.values()];
}

/**
 * Turns the request into the exact rows to write. Prices, costs, names and
 * SKUs all come from `products` — never from the client — so a tampered
 * request cannot set its own price.
 */
export function prepareSale(
  input: CreateSaleInput,
  products: Map<string, PricedProduct>,
): PreparedSale {
  const items = mergeItems(input.items);

  const priced = items.map((item) => {
    const product = products.get(item.productId);
    if (!product) {
      throw badRequest(`Product ${item.productId} no longer exists`);
    }
    if (product.active !== 1) {
      throw badRequest(`"${product.name}" is no longer for sale`);
    }
    return { item, product };
  });

  const mathLines = priced.map(({ item, product }) => ({
    qty: item.qty,
    unitPriceCents: product.priceCents,
    unitCostCents: product.costCents,
    discountCents: item.discountCents,
  }));

  for (const [i, line] of mathLines.entries()) {
    if (line.discountCents > lineGross(line)) {
      throw badRequest(
        `Discount on "${priced[i]!.product.name}" is more than the line total`,
      );
    }
  }

  const totals = computeTotals(mathLines, input.cartDiscountCents);

  if (input.cartDiscountCents > totals.cartDiscountCents) {
    throw badRequest("Cart discount is more than the cart is worth");
  }

  // Spread the cart discount over the lines so a later partial refund knows
  // what each line was actually worth.
  const cartShares = allocateCartDiscount(mathLines, totals.cartDiscountCents);

  const lines: PreparedLine[] = priced.map(({ item, product }, i) => {
    const discountCents = item.discountCents + cartShares[i]!;
    return {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unitPriceCents: product.priceCents,
      unitCostCents: product.costCents,
      qty: item.qty,
      discountCents,
      lineTotalCents: item.qty * product.priceCents - discountCents,
    };
  });

  // A friendlier error than the CHECK constraint would give. The constraint
  // is still what guarantees correctness under concurrency; this only makes
  // the common case readable.
  const short = priced.filter(({ item, product }) => product.stockQty < item.qty);
  if (short.length > 0) {
    const detail = short
      .map(({ item, product }) => `${product.name} (have ${product.stockQty}, need ${item.qty})`)
      .join(", ");
    throw conflict(`Not enough stock: ${detail}`);
  }

  const payments = preparePayments(input.payments, totals.totalCents);

  return {
    lines,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    costTotalCents: totals.costTotalCents,
    payments: payments.rows,
    changeCents: payments.changeCents,
  };
}

function preparePayments(
  payments: PaymentInput[],
  totalCents: number,
): { rows: PreparedPayment[]; changeCents: number } {
  const applied = payments.reduce((sum, p) => sum + p.amountCents, 0);

  // `amountCents` is what each payment puts towards the sale, so the parts
  // must add up exactly. Over-tendering is expressed as change, not as a
  // payment larger than the sale.
  if (applied !== totalCents) {
    throw badRequest(
      `Payments come to ${applied} cents but the sale is ${totalCents} cents`,
    );
  }

  let changeCents = 0;
  const rows: PreparedPayment[] = payments.map((p) => {
    if (p.method === "cash") {
      if (p.tenderedCents < p.amountCents) {
        throw badRequest("Cash tendered is less than the amount being paid");
      }
      const change = p.tenderedCents - p.amountCents;
      changeCents += change;
      return {
        method: "cash",
        amountCents: p.amountCents,
        tenderedCents: p.tenderedCents,
        changeCents: change,
        mpesaCode: null,
      };
    }
    return {
      method: "mpesa",
      amountCents: p.amountCents,
      tenderedCents: null,
      changeCents: null,
      mpesaCode: p.mpesaCode,
    };
  });

  return { rows, changeCents };
}

/**
 * D1 allows at most 100 bound parameters per statement, so multi-row inserts
 * are split into chunks that stay under it.
 */
export function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
