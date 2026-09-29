import { conflict } from "./http";

/**
 * Drizzle wraps the D1 failure, which wraps the SQLite one, so the text we
 * need ("UNIQUE constraint failed: products.sku") sits two `cause` levels
 * down. Flatten the chain before matching.
 */
function messageChain(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    parts.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return parts.length ? parts.join(" | ") : String(err);
}

/**
 * Map the SQLite constraint failures we deliberately rely on into useful HTTP
 * errors instead of a 500. Keys are matched against the flattened message, so
 * they are column names for UNIQUE ("products.sku") and constraint names for
 * CHECK ("products_stock_nonneg").
 */
export function mapConstraintError(
  err: unknown,
  labels: Record<string, string>,
): unknown {
  const message = messageChain(err);
  for (const [fragment, friendly] of Object.entries(labels)) {
    if (message.includes(fragment)) return conflict(friendly);
  }
  return err;
}

/** True when a write would have driven stock below zero. */
export function isStockConstraintViolation(err: unknown): boolean {
  return messageChain(err).includes("products_stock_nonneg");
}
