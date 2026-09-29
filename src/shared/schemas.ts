import { z } from "zod";

// Shared by the Worker (request validation) and the React app (form validation).

export const roleSchema = z.enum(["admin", "cashier"]);
export type Role = z.infer<typeof roleSchema>;

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[a-z0-9._-]+$/i, "Letters, numbers, dot, dash and underscore only");

export const pinSchema = z
  .string()
  .regex(/^\d{4,8}$/, "PIN must be 4 to 8 digits");

export const loginSchema = z.object({
  username: usernameSchema,
  pin: pinSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  username: usernameSchema,
  pin: pinSchema,
  role: roleSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    username: usernameSchema.optional(),
    pin: pinSchema.optional(),
    role: roleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changePinSchema = z.object({
  currentPin: pinSchema,
  newPin: pinSchema,
});

/** The shape returned by /api/auth/me and embedded in other responses. */
export interface SessionUser {
  id: string;
  username: string;
  role: Role;
}

// ---------------------------------------------------------------------------
// Products and categories
// ---------------------------------------------------------------------------

/** Money arrives from forms as integer cents; reject anything else outright. */
const centsSchema = z
  .number()
  .int("Must be a whole number of cents")
  .min(0, "Cannot be negative")
  .max(1_000_000_00, "Unrealistically large");

export const skuSchema = z
  .string()
  .trim()
  .min(1, "SKU is required")
  .max(40, "SKU is too long");

export const barcodeSchema = z
  .string()
  .trim()
  .max(64, "Barcode is too long")
  .regex(/^[\x20-\x7e]*$/, "Barcode has unsupported characters");

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Name is too long"),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
    sku: skuSchema,
    barcode: barcodeSchema.optional().or(z.literal("")),
    categoryId: z.string().trim().min(1).nullable().optional(),
    priceCents: centsSchema,
    costCents: centsSchema.default(0),
    stockQty: z.number().int().min(0, "Stock cannot be negative").default(0),
    lowStockThreshold: z.number().int().min(0).max(100_000).default(5),
    active: z.boolean().default(true),
  })
  .refine((v) => v.costCents <= v.priceCents || v.costCents === 0, {
    message: "Cost is higher than price — margin would be negative",
    path: ["costCents"],
  });
export type CreateProductInput = z.infer<typeof createProductSchema>;

// Partial of the same fields. The cross-field cost/price check cannot run here
// because a patch may carry only one of the two; the route re-checks it against
// the stored row instead.
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    sku: skuSchema.optional(),
    barcode: barcodeSchema.nullable().optional(),
    categoryId: z.string().trim().min(1).nullable().optional(),
    priceCents: centsSchema.optional(),
    costCents: centsSchema.optional(),
    lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  categoryId: z.string().trim().min(1).optional(),
  lowStock: z.coerce.boolean().optional(),
  includeInactive: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const barcodeLookupSchema = z.object({
  barcode: barcodeSchema.min(1, "Barcode is required"),
});

/** Product as returned by the API. */
export interface ProductDto {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  priceCents: number;
  costCents: number;
  stockQty: number;
  lowStockThreshold: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CategoryDto {
  id: string;
  name: string;
  productCount: number;
}
