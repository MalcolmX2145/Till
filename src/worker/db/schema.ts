import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Money is always INTEGER cents (KES). Timestamps are INTEGER epoch millis.
const now = sql`(unixepoch() * 1000)`;

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    pinHash: text("pin_hash").notNull(),
    pinSalt: text("pin_salt").notNull(),
    role: text("role").notNull().$type<"admin" | "cashier">(),
    active: integer("active").notNull().default(1),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("users_username_unique").on(t.username),
    check("users_role_check", sql`${t.role} in ('admin','cashier')`),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    // SHA-256 of the opaque cookie token; the raw token is never stored.
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("categories_name_unique").on(t.name)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    priceCents: integer("price_cents").notNull(),
    costCents: integer("cost_cents").notNull().default(0),
    stockQty: integer("stock_qty").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    active: integer("active").notNull().default(1),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("products_sku_unique").on(t.sku),
    uniqueIndex("products_barcode_unique").on(t.barcode),
    index("products_category_idx").on(t.categoryId),
    index("products_name_idx").on(t.name),
    // The atomicity guard for checkout: D1 has no interactive transactions,
    // so an oversell is caught by this constraint, which aborts the batch.
    check("products_stock_nonneg", sql`${t.stockQty} >= 0`),
    check("products_price_nonneg", sql`${t.priceCents} >= 0`),
    check("products_cost_nonneg", sql`${t.costCents} >= 0`),
  ],
);

export const sales = sqliteTable(
  "sales",
  {
    id: text("id").primaryKey(),
    seq: integer("seq").notNull(),
    cashierId: text("cashier_id")
      .notNull()
      .references(() => users.id),
    status: text("status")
      .notNull()
      .default("completed")
      .$type<"completed" | "voided" | "refunded" | "partially_refunded">(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    costTotalCents: integer("cost_total_cents").notNull().default(0),
    note: text("note"),
    createdAt: integer("created_at").notNull().default(now),
    voidedAt: integer("voided_at"),
    voidedBy: text("voided_by").references(() => users.id),
    voidReason: text("void_reason"),
  },
  (t) => [
    uniqueIndex("sales_seq_unique").on(t.seq),
    index("sales_created_idx").on(t.createdAt),
    index("sales_cashier_created_idx").on(t.cashierId, t.createdAt),
    check(
      "sales_status_check",
      sql`${t.status} in ('completed','voided','refunded','partially_refunded')`,
    ),
  ],
);

export const saleItems = sqliteTable(
  "sale_items",
  {
    id: text("id").primaryKey(),
    saleId: text("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    // Snapshots: a later rename or reprice must not rewrite history.
    nameSnapshot: text("name_snapshot").notNull(),
    skuSnapshot: text("sku_snapshot").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    qty: integer("qty").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    lineTotalCents: integer("line_total_cents").notNull(),
    refundedQty: integer("refunded_qty").notNull().default(0),
  },
  (t) => [
    index("sale_items_sale_idx").on(t.saleId),
    index("sale_items_product_idx").on(t.productId),
    check("sale_items_qty_pos", sql`${t.qty} > 0`),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    saleId: text("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    method: text("method").notNull().$type<"cash" | "mpesa">(),
    amountCents: integer("amount_cents").notNull(),
    tenderedCents: integer("tendered_cents"),
    changeCents: integer("change_cents"),
    mpesaCode: text("mpesa_code"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("payments_sale_idx").on(t.saleId),
    check("payments_method_check", sql`${t.method} in ('cash','mpesa')`),
  ],
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason")
      .notNull()
      .$type<"sale" | "restock" | "damage" | "correction" | "void" | "refund">(),
    refSaleId: text("ref_sale_id").references(() => sales.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    userId: text("user_id").references(() => users.id),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("stock_movements_product_created_idx").on(t.productId, t.createdAt),
    index("stock_movements_sale_idx").on(t.refSaleId),
    check(
      "stock_movements_reason_check",
      sql`${t.reason} in ('sale','restock','damage','correction','void','refund')`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
