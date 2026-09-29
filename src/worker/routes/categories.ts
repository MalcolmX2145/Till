import { count, eq } from "drizzle-orm";
import { Router } from "express";
import { categorySchema } from "../../shared/schemas";
import { db, schema } from "../db/client";
import { mapConstraintError } from "../lib/dbErrors";
import { conflict, notFound } from "../lib/http";
import { ulid } from "../lib/ids";
import { requireAdmin } from "../middleware/auth";
import { params, validateBody } from "../middleware/validate";

export const categoriesRouter: Router = Router();

const NAME_TAKEN = {
  "categories.name": "A category with that name already exists",
};

// Cashiers need categories to filter the sell screen, so reading is open to
// any signed-in user; writing is admin-only.
categoriesRouter.get("/", async (_req, res) => {
  const rows = await db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      productCount: count(schema.products.id),
    })
    .from(schema.categories)
    .leftJoin(
      schema.products,
      eq(schema.products.categoryId, schema.categories.id),
    )
    .groupBy(schema.categories.id)
    .orderBy(schema.categories.name)
    .all();

  res.json({ categories: rows });
});

categoriesRouter.post(
  "/",
  requireAdmin,
  validateBody(categorySchema),
  async (req, res) => {
    const { name } = req.body as { name: string };
    const id = ulid();
    try {
      await db.insert(schema.categories).values({ id, name }).run();
    } catch (err) {
      throw mapConstraintError(err, NAME_TAKEN);
    }
    res.status(201).json({ category: { id, name, productCount: 0 } });
  },
);

categoriesRouter.patch(
  "/:id",
  requireAdmin,
  validateBody(categorySchema),
  async (req, res) => {
    const id = params(req, "id");
    const { name } = req.body as { name: string };
    try {
      const result = await db
        .update(schema.categories)
        .set({ name })
        .where(eq(schema.categories.id, id))
        .run();
      if (result.meta.changes === 0) throw notFound("Category not found");
    } catch (err) {
      throw mapConstraintError(err, NAME_TAKEN);
    }
    res.json({ category: { id, name } });
  },
);

categoriesRouter.delete("/:id", requireAdmin, async (req, res) => {
  const id = params(req, "id");

  // products.category_id is ON DELETE SET NULL, so deleting a category with
  // products would silently uncategorise them. Make that explicit instead.
  const inUse = await db
    .select({ n: count() })
    .from(schema.products)
    .where(eq(schema.products.categoryId, id))
    .get();

  if ((inUse?.n ?? 0) > 0) {
    throw conflict(
      `Category still has ${inUse?.n} product(s). Move them first.`,
    );
  }

  const result = await db
    .delete(schema.categories)
    .where(eq(schema.categories.id, id))
    .run();
  if (result.meta.changes === 0) throw notFound("Category not found");

  res.json({ ok: true });
});
