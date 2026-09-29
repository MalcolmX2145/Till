import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { Router } from "express";
import {
  createSaleSchema,
  formatSaleNo,
  saleListQuerySchema,
  type CreateSaleInput,
  type SaleDto,
} from "../../shared/schemas";
import { db, schema } from "../db/client";
import { chunk, prepareSale, type PricedProduct } from "../lib/checkout";
import { isStockConstraintViolation } from "../lib/dbErrors";
import { conflict, forbidden, notFound } from "../lib/http";
import { ulid } from "../lib/ids";
import { requireAuth } from "../middleware/auth";
import { params, query, validateBody, validateQuery } from "../middleware/validate";

export const salesRouter: Router = Router();

// Bound-parameter budget per statement is 100. sale_items writes 10 columns
// per row and stock_movements writes 8, so these are the largest safe chunks.
const ITEM_ROWS_PER_STATEMENT = 9;
const MOVEMENT_ROWS_PER_STATEMENT = 12;

salesRouter.post(
  "/",
  requireAuth,
  validateBody(createSaleSchema),
  async (req, res) => {
    const input = req.body as CreateSaleInput;
    const cashier = req.user!;

    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const rows = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        sku: schema.products.sku,
        priceCents: schema.products.priceCents,
        costCents: schema.products.costCents,
        stockQty: schema.products.stockQty,
        active: schema.products.active,
      })
      .from(schema.products)
      .where(inArray(schema.products.id, productIds))
      .all();

    const products = new Map<string, PricedProduct>(rows.map((r) => [r.id, r]));
    const prepared = prepareSale(input, products);

    const saleId = ulid();
    const now = Date.now();

    const insertSale = db
      .insert(schema.sales)
      .values({
        id: saleId,
        // Assigned in SQL inside the transaction. D1 serialises writes, so
        // two tills cannot land on the same number.
        seq: sql`(select coalesce(max(${schema.sales.seq}), 0) + 1 from ${schema.sales})`,
        cashierId: cashier.id,
        status: "completed",
        subtotalCents: prepared.subtotalCents,
        discountCents: prepared.discountCents,
        totalCents: prepared.totalCents,
        costTotalCents: prepared.costTotalCents,
        note: input.note ?? null,
        createdAt: now,
      })
      .returning({ seq: schema.sales.seq });

    const itemInserts = chunk(prepared.lines, ITEM_ROWS_PER_STATEMENT).map(
      (group) =>
        db.insert(schema.saleItems).values(
          group.map((line) => ({
            id: ulid(),
            saleId,
            productId: line.productId,
            nameSnapshot: line.name,
            skuSnapshot: line.sku,
            unitPriceCents: line.unitPriceCents,
            unitCostCents: line.unitCostCents,
            qty: line.qty,
            discountCents: line.discountCents,
            lineTotalCents: line.lineTotalCents,
          })),
        ),
    );

    // The real atomicity guard. products.stock_qty has CHECK (stock_qty >= 0),
    // so if any of these would oversell, SQLite aborts and D1 rolls the whole
    // batch back — the sale, its lines and every other deduction with it.
    // Products are only ever soft-deleted, so the row is always still there
    // and a zero-row UPDATE is not a case we have to defend against.
    const stockUpdates = prepared.lines.map((line) =>
      db
        .update(schema.products)
        .set({
          stockQty: sql`${schema.products.stockQty} - ${line.qty}`,
          updatedAt: now,
        })
        .where(eq(schema.products.id, line.productId)),
    );

    const movementInserts = chunk(
      prepared.lines,
      MOVEMENT_ROWS_PER_STATEMENT,
    ).map((group) =>
      db.insert(schema.stockMovements).values(
        group.map((line) => ({
          id: ulid(),
          productId: line.productId,
          delta: -line.qty,
          reason: "sale" as const,
          refSaleId: saleId,
          note: null,
          userId: cashier.id,
          createdAt: now,
        })),
      ),
    );

    const insertPayments = db.insert(schema.payments).values(
      prepared.payments.map((p) => ({
        id: ulid(),
        saleId,
        method: p.method,
        amountCents: p.amountCents,
        tenderedCents: p.tenderedCents,
        changeCents: p.changeCents,
        mpesaCode: p.mpesaCode,
        createdAt: now,
      })),
    );

    let seq: number;
    try {
      const results = await db.batch([
        insertSale,
        ...itemInserts,
        ...stockUpdates,
        ...movementInserts,
        insertPayments,
      ] as unknown as Parameters<typeof db.batch>[0]);
      seq = (results[0] as { seq: number }[])[0]!.seq;
    } catch (err) {
      if (isStockConstraintViolation(err)) {
        // Someone else sold the last of something between our read and our
        // write. Nothing was committed.
        throw conflict(
          "Stock changed while this sale was being completed. Check quantities and try again.",
        );
      }
      throw err;
    }

    res.status(201).json({
      sale: {
        id: saleId,
        seq,
        saleNo: formatSaleNo(seq),
        totalCents: prepared.totalCents,
        changeCents: prepared.changeCents,
        createdAt: now,
      },
    });
  },
);

salesRouter.get(
  "/",
  requireAuth,
  validateQuery(saleListQuerySchema),
  async (req, res) => {
    const q = query(res, saleListQuerySchema);
    const me = req.user!;

    const filters: SQL[] = [];
    // A cashier only ever sees their own sales, whatever they ask for.
    const cashierId = me.role === "admin" ? q.cashierId : me.id;
    if (cashierId) filters.push(eq(schema.sales.cashierId, cashierId));
    if (q.status) filters.push(eq(schema.sales.status, q.status));
    if (q.from !== undefined) filters.push(gte(schema.sales.createdAt, q.from));
    if (q.to !== undefined) filters.push(lte(schema.sales.createdAt, q.to));

    const rows = await db
      .select({
        id: schema.sales.id,
        seq: schema.sales.seq,
        status: schema.sales.status,
        cashierId: schema.sales.cashierId,
        cashierName: schema.users.username,
        subtotalCents: schema.sales.subtotalCents,
        discountCents: schema.sales.discountCents,
        totalCents: schema.sales.totalCents,
        createdAt: schema.sales.createdAt,
        itemCount: count(schema.saleItems.id),
      })
      .from(schema.sales)
      .innerJoin(schema.users, eq(schema.users.id, schema.sales.cashierId))
      .leftJoin(schema.saleItems, eq(schema.saleItems.saleId, schema.sales.id))
      .where(filters.length ? and(...filters) : undefined)
      .groupBy(schema.sales.id)
      .orderBy(desc(schema.sales.createdAt))
      .limit(q.limit + 1)
      .offset(q.offset)
      .all();

    const hasMore = rows.length > q.limit;
    res.json({
      sales: rows.slice(0, q.limit).map((r) => ({
        ...r,
        saleNo: formatSaleNo(r.seq),
      })),
      hasMore,
      limit: q.limit,
      offset: q.offset,
    });
  },
);

salesRouter.get("/:id", requireAuth, async (req, res) => {
  const sale = await loadSale(params(req, "id"));
  const me = req.user!;
  if (me.role !== "admin" && sale.cashierId !== me.id) {
    throw forbidden("That sale belongs to another cashier");
  }
  res.json({ sale });
});

export async function loadSale(id: string): Promise<SaleDto> {
  const head = await db
    .select({
      id: schema.sales.id,
      seq: schema.sales.seq,
      status: schema.sales.status,
      cashierId: schema.sales.cashierId,
      cashierName: schema.users.username,
      subtotalCents: schema.sales.subtotalCents,
      discountCents: schema.sales.discountCents,
      totalCents: schema.sales.totalCents,
      costTotalCents: schema.sales.costTotalCents,
      note: schema.sales.note,
      createdAt: schema.sales.createdAt,
      voidedAt: schema.sales.voidedAt,
      voidReason: schema.sales.voidReason,
    })
    .from(schema.sales)
    .innerJoin(schema.users, eq(schema.users.id, schema.sales.cashierId))
    .where(eq(schema.sales.id, id))
    .get();

  if (!head) throw notFound("Sale not found");

  const [items, payments] = await Promise.all([
    db
      .select({
        id: schema.saleItems.id,
        productId: schema.saleItems.productId,
        name: schema.saleItems.nameSnapshot,
        sku: schema.saleItems.skuSnapshot,
        unitPriceCents: schema.saleItems.unitPriceCents,
        unitCostCents: schema.saleItems.unitCostCents,
        qty: schema.saleItems.qty,
        discountCents: schema.saleItems.discountCents,
        lineTotalCents: schema.saleItems.lineTotalCents,
        refundedQty: schema.saleItems.refundedQty,
      })
      .from(schema.saleItems)
      .where(eq(schema.saleItems.saleId, id))
      .all(),
    db
      .select({
        id: schema.payments.id,
        method: schema.payments.method,
        amountCents: schema.payments.amountCents,
        tenderedCents: schema.payments.tenderedCents,
        changeCents: schema.payments.changeCents,
        mpesaCode: schema.payments.mpesaCode,
      })
      .from(schema.payments)
      .where(eq(schema.payments.saleId, id))
      .all(),
  ]);

  return {
    ...head,
    saleNo: formatSaleNo(head.seq),
    itemCount: items.length,
    items,
    payments,
  };
}
