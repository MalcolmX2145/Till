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
