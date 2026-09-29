import { and, eq, like, lte, or, type SQL } from "drizzle-orm";
import { Router } from "express";
import {
  barcodeLookupSchema,
  createProductSchema,
  productListQuerySchema,
  updateProductSchema,
  type CreateProductInput,
  type ProductDto,
  type UpdateProductInput,
} from "../../shared/schemas";
import { db, schema } from "../db/client";
import { mapConstraintError } from "../lib/dbErrors";
import { badRequest, notFound } from "../lib/http";
import { ulid } from "../lib/ids";
import { requireAdmin } from "../middleware/auth";
import {
  params,
  query,
  validateBody,
  validateQuery,
} from "../middleware/validate";

export const productsRouter: Router = Router();

const UNIQUE_LABELS = {
  "products.sku": "Another product already uses that SKU",
  "products.barcode": "Another product already uses that barcode",
};

/** An empty barcode must become NULL: the unique index rejects duplicate "". */
function normaliseBarcode(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const selection = {
  id: schema.products.id,
  name: schema.products.name,
  sku: schema.products.sku,
  barcode: schema.products.barcode,
  categoryId: schema.products.categoryId,
  categoryName: schema.categories.name,
  priceCents: schema.products.priceCents,
  costCents: schema.products.costCents,
  stockQty: schema.products.stockQty,
  lowStockThreshold: schema.products.lowStockThreshold,
  active: schema.products.active,
  createdAt: schema.products.createdAt,
  updatedAt: schema.products.updatedAt,
};

function toDto(row: Record<string, unknown>): ProductDto {
  return { ...row, active: row.active === 1 } as ProductDto;
}

/** Escapes LIKE wildcards so a search for "50%" is not a match-everything. */
function likeTerm(input: string): string {
  return `%${input.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
}

productsRouter.get(
  "/",
  validateQuery(productListQuerySchema),
  async (_req, res) => {
    const q = query(res, productListQuerySchema);
    const filters: SQL[] = [];

    if (!q.includeInactive) filters.push(eq(schema.products.active, 1));
    if (q.categoryId) filters.push(eq(schema.products.categoryId, q.categoryId));
    if (q.lowStock) {
      filters.push(
        lte(schema.products.stockQty, schema.products.lowStockThreshold),
      );
    }
    if (q.q) {
      const term = likeTerm(q.q);
      const match = or(
        like(schema.products.name, term),
        like(schema.products.sku, term),
        like(schema.products.barcode, term),
      );
      if (match) filters.push(match);
    }

    const rows = await db
      .select(selection)
      .from(schema.products)
      .leftJoin(
        schema.categories,
        eq(schema.categories.id, schema.products.categoryId),
      )
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(schema.products.name)
      .limit(q.limit + 1)
      .offset(q.offset)
      .all();

    // Fetching one row past the page tells the client whether to offer "next"
    // without paying for a COUNT(*) over the whole table.
    const hasMore = rows.length > q.limit;

    res.json({
      products: rows.slice(0, q.limit).map(toDto),
      hasMore,
      limit: q.limit,
      offset: q.offset,
    });
  },
);

/** Scanner path on the sell screen. Exact match, active products only. */
productsRouter.get(
  "/lookup",
  validateQuery(barcodeLookupSchema),
  async (_req, res) => {
    const { barcode } = query(res, barcodeLookupSchema);
    const row = await db
      .select(selection)
      .from(schema.products)
      .leftJoin(
        schema.categories,
        eq(schema.categories.id, schema.products.categoryId),
      )
      .where(
        and(eq(schema.products.barcode, barcode), eq(schema.products.active, 1)),
      )
      .get();

    if (!row) throw notFound("No product with that barcode");
    res.json({ product: toDto(row) });
  },
);

productsRouter.get("/:id", async (req, res) => {
  const row = await db
    .select(selection)
    .from(schema.products)
    .leftJoin(
      schema.categories,
      eq(schema.categories.id, schema.products.categoryId),
    )
    .where(eq(schema.products.id, params(req, "id")))
    .get();

  if (!row) throw notFound("Product not found");
  res.json({ product: toDto(row) });
});

productsRouter.post(
  "/",
  requireAdmin,
  validateBody(createProductSchema),
  async (req, res) => {
    const input = req.body as CreateProductInput;
    const id = ulid();
    const now = Date.now();

    if (input.categoryId) await assertCategoryExists(input.categoryId);

    const insertProduct = db.insert(schema.products).values({
      id,
      name: input.name,
      sku: input.sku,
      barcode: normaliseBarcode(input.barcode),
      categoryId: input.categoryId ?? null,
      priceCents: input.priceCents,
      costCents: input.costCents,
      stockQty: input.stockQty,
      lowStockThreshold: input.lowStockThreshold,
      active: input.active ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });

    // Opening stock is a stock movement like any other, so the inventory
    // history starts from a real row rather than an unexplained balance.
    const logOpeningStock = db.insert(schema.stockMovements).values({
      id: ulid(),
      productId: id,
      delta: input.stockQty,
      reason: "restock",
      note: "Opening stock",
      userId: req.user!.id,
      createdAt: now,
    });

    try {
      if (input.stockQty > 0) {
        await db.batch([insertProduct, logOpeningStock]);
      } else {
        await insertProduct.run();
      }
    } catch (err) {
      throw mapConstraintError(err, UNIQUE_LABELS);
    }

    res.status(201).json({ product: { id } });
  },
);

productsRouter.patch(
  "/:id",
  requireAdmin,
  validateBody(updateProductSchema),
  async (req, res) => {
    const id = params(req, "id");
    const input = req.body as UpdateProductInput;

    const existing = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.id, id))
      .get();
    if (!existing) throw notFound("Product not found");

    // stockQty is deliberately absent from updateProductSchema: stock only
    // moves through /api/inventory/adjust, so every change leaves a log entry.
    const price = input.priceCents ?? existing.priceCents;
    const cost = input.costCents ?? existing.costCents;
    if (cost > price && cost !== 0) {
      throw badRequest("Cost is higher than price — margin would be negative");
    }

    if (input.categoryId) await assertCategoryExists(input.categoryId);

    try {
      await db
        .update(schema.products)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.sku === undefined ? {} : { sku: input.sku }),
          ...(input.barcode === undefined
            ? {}
            : { barcode: normaliseBarcode(input.barcode) }),
          ...(input.categoryId === undefined
            ? {}
            : { categoryId: input.categoryId }),
          ...(input.priceCents === undefined
            ? {}
            : { priceCents: input.priceCents }),
          ...(input.costCents === undefined
            ? {}
            : { costCents: input.costCents }),
          ...(input.lowStockThreshold === undefined
            ? {}
            : { lowStockThreshold: input.lowStockThreshold }),
          ...(input.active === undefined ? {} : { active: input.active ? 1 : 0 }),
          updatedAt: Date.now(),
        })
        .where(eq(schema.products.id, id))
        .run();
    } catch (err) {
      throw mapConstraintError(err, UNIQUE_LABELS);
    }

    res.json({ ok: true });
  },
);

/**
 * Soft delete. Sale history references products, so a product is only ever
 * deactivated — it disappears from the sell screen but historical lines keep
 * their link.
 */
productsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const result = await db
    .update(schema.products)
    .set({ active: 0, updatedAt: Date.now() })
    .where(eq(schema.products.id, params(req, "id")))
    .run();

  if (result.meta.changes === 0) throw notFound("Product not found");
  res.json({ ok: true });
});

async function assertCategoryExists(categoryId: string): Promise<void> {
  const row = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(eq(schema.categories.id, categoryId))
    .get();
  if (!row) throw badRequest("That category does not exist");
}
