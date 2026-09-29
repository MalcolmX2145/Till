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

// ---------------------------------------------------------------------------
// Sales and checkout
// ---------------------------------------------------------------------------

/**
 * Hard cap on cart lines. D1 allows 50 queries per Worker invocation on the
 * free plan; a checkout costs roughly 1 read + 1 sale + ceil(n/9) item
 * inserts + n stock updates + ceil(n/14) movement inserts + 1 payments
 * insert, so 30 lines lands near 40 and leaves headroom.
 */
export const MAX_CART_LINES = 30;

export const paymentMethodSchema = z.enum(["cash", "mpesa"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const mpesaCodeSchema = z
  .string()
  .trim()
  .min(6, "M-Pesa code looks too short")
  .max(20, "M-Pesa code looks too long")
  .regex(/^[A-Za-z0-9]+$/, "M-Pesa codes are letters and numbers only");

const paymentBase = {
  amountCents: z.number().int().positive("Payment must be greater than zero"),
};

export const paymentInputSchema = z.discriminatedUnion("method", [
  z.object({
    ...paymentBase,
    method: z.literal("cash"),
    /** What the customer handed over; change is tendered minus amount. */
    tenderedCents: z.number().int().nonnegative(),
  }),
  z.object({
    ...paymentBase,
    method: z.literal("mpesa"),
    mpesaCode: mpesaCodeSchema,
  }),
]);
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const saleItemInputSchema = z.object({
  productId: z.string().trim().min(1),
  qty: z.number().int().positive("Quantity must be at least 1"),
  discountCents: z.number().int().nonnegative().default(0),
});
export type SaleItemInput = z.infer<typeof saleItemInputSchema>;

export const createSaleSchema = z.object({
  // Prices are never taken from the client; the server reads them from the
  // products table and snapshots those.
  items: z
    .array(saleItemInputSchema)
    .min(1, "Add at least one item")
    .max(MAX_CART_LINES, `A sale can hold at most ${MAX_CART_LINES} lines`),
  cartDiscountCents: z.number().int().nonnegative().default(0),
  payments: z
    .array(paymentInputSchema)
    .min(1, "Add a payment")
    .max(4, "Too many split payments"),
  note: z.string().trim().max(200).optional(),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const saleListQuerySchema = z.object({
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  cashierId: z.string().trim().min(1).optional(),
  status: z
    .enum(["completed", "voided", "refunded", "partially_refunded"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;

export type SaleStatus =
  | "completed"
  | "voided"
  | "refunded"
  | "partially_refunded";

export interface SaleItemDto {
  id: string;
  productId: string | null;
  name: string;
  sku: string;
  unitPriceCents: number;
  unitCostCents: number;
  qty: number;
  discountCents: number;
  lineTotalCents: number;
  refundedQty: number;
}

export interface PaymentDto {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  tenderedCents: number | null;
  changeCents: number | null;
  mpesaCode: string | null;
}

export interface SaleSummaryDto {
  id: string;
  saleNo: string;
  status: SaleStatus;
  cashierId: string;
  cashierName: string;
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  createdAt: number;
}

export interface SaleDto extends SaleSummaryDto {
  costTotalCents: number;
  note: string | null;
  voidedAt: number | null;
  voidReason: string | null;
  items: SaleItemDto[];
  payments: PaymentDto[];
}

/** Sale numbers are derived from the sequence, not stored twice. */
export function formatSaleNo(seq: number): string {
  return `S-${String(seq).padStart(6, "0")}`;
}
