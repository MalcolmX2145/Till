import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { Router } from "express";
import {
  adjustStockSchema,
  formatSaleNo,
  movementListQuerySchema,
  type AdjustStockInput,
} from "../../shared/schemas";
import { db, schema } from "../db/client";
import { isStockConstraintViolation } from "../lib/dbErrors";
import { badRequest, conflict, notFound } from "../lib/http";
import { ulid } from "../lib/ids";
import { requireAdmin } from "../middleware/auth";
import { query, validateBody, validateQuery } from "../middleware/validate";

export const inventoryRouter: Router = Router();

/** Restock adds, damage removes, and a correction is the counted difference. */
function deltaFor(input: AdjustStockInput, currentQty: number): number {
  switch (input.reason) {
    case "restock":
      return input.qty;
    case "damage":
      return -input.qty;
    case "correction":
      return input.countedQty - currentQty;
  }
}

inventoryRouter.post(
  "/adjust",
  requireAdmin,
  validateBody(adjustStockSchema),
  async (req, res) => {
    const input = req.body as AdjustStockInput;

    const product = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        stockQty: schema.products.stockQty,
      })
      .from(schema.products)
      .where(eq(schema.products.id, input.productId))
      .get();

    if (!product) throw notFound("Product not found");

    const delta = deltaFor(input, product.stockQty);
    if (delta === 0) {
      throw badRequest("That would not change the stock level");
    }

    const now = Date.now();

    try {
      // Applied relatively, so a sale landing between the read above and this
      // write is kept rather than overwritten. CHECK (stock_qty >= 0) still
      // backstops the whole thing, and aborts the batch if it would go
      // negative — the movement row never survives on its own.
      await db.batch([
        db
          .update(schema.products)
          .set({
            stockQty: sql`${schema.products.stockQty} + ${delta}`,
            updatedAt: now,
          })
          .where(eq(schema.products.id, product.id)),
        db.insert(schema.stockMovements).values({
          id: ulid(),
          productId: product.id,
          delta,
          reason: input.reason,
          refSaleId: null,
          note: input.note ?? null,
          userId: req.user!.id,
          createdAt: now,
        }),
      ]);
    } catch (err) {
      if (isStockConstraintViolation(err)) {
        throw conflict(
          `That would take ${product.name} below zero. It currently has ${product.stockQty}.`,
        );
      }
      throw err;
    }

    res.status(201).json({
      adjustment: {
        productId: product.id,
        delta,
        // What the level would be; a concurrent sale can still move it after.
        stockQty: product.stockQty + delta,
      },
    });
  },
);

inventoryRouter.get(
  "/movements",
  requireAdmin,
  validateQuery(movementListQuerySchema),
  async (_req, res) => {
    const q = query(res, movementListQuerySchema);

    const filters: SQL[] = [];
    if (q.productId) {
      filters.push(eq(schema.stockMovements.productId, q.productId));
    }
    if (q.reason) filters.push(eq(schema.stockMovements.reason, q.reason));
    if (q.from !== undefined) {
      filters.push(gte(schema.stockMovements.createdAt, q.from));
    }
    if (q.to !== undefined) {
      filters.push(lte(schema.stockMovements.createdAt, q.to));
    }

    const rows = await db
      .select({
        id: schema.stockMovements.id,
        productId: schema.stockMovements.productId,
        productName: schema.products.name,
        productSku: schema.products.sku,
        delta: schema.stockMovements.delta,
        reason: schema.stockMovements.reason,
        refSaleId: schema.stockMovements.refSaleId,
        refSaleSeq: schema.sales.seq,
        note: schema.stockMovements.note,
        userName: schema.users.username,
        createdAt: schema.stockMovements.createdAt,
      })
      .from(schema.stockMovements)
      .innerJoin(
        schema.products,
        eq(schema.products.id, schema.stockMovements.productId),
      )
      .leftJoin(schema.users, eq(schema.users.id, schema.stockMovements.userId))
      .leftJoin(schema.sales, eq(schema.sales.id, schema.stockMovements.refSaleId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(schema.stockMovements.createdAt), desc(schema.stockMovements.id))
      .limit(q.limit + 1)
      .offset(q.offset)
      .all();

    const hasMore = rows.length > q.limit;

    res.json({
      movements: rows.slice(0, q.limit).map(({ refSaleSeq, ...row }) => ({
        ...row,
        refSaleNo: refSaleSeq === null ? null : formatSaleNo(refSaleSeq),
      })),
      hasMore,
      limit: q.limit,
      offset: q.offset,
    });
  },
);

inventoryRouter.get("/low-stock", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      sku: schema.products.sku,
      categoryName: schema.categories.name,
      stockQty: schema.products.stockQty,
      lowStockThreshold: schema.products.lowStockThreshold,
    })
    .from(schema.products)
    .leftJoin(
      schema.categories,
      eq(schema.categories.id, schema.products.categoryId),
    )
    .where(
      and(
        eq(schema.products.active, 1),
        lte(schema.products.stockQty, schema.products.lowStockThreshold),
      ),
    )
    // Worst first: out of stock before merely low.
    .orderBy(
      sql`${schema.products.stockQty} - ${schema.products.lowStockThreshold}`,
      schema.products.name,
    )
    .all();

  res.json({
    products: rows.map((r) => ({
      ...r,
      shortfall: r.lowStockThreshold - r.stockQty,
    })),
  });
});
