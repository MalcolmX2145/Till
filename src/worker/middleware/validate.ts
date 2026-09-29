import type { Request, RequestHandler } from "express";
import type { ZodTypeAny, z } from "zod";

/** Replaces req.body with the parsed value, so handlers get typed input. */
export function validateBody<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data as z.infer<S>;
    next();
  };
}

/**
 * Express 5 exposes req.query as a getter, so the parsed value is stashed on
 * res.locals and read back with `query<T>(res)`.
 */
export function validateQuery<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    res.locals.query = result.data;
    next();
  };
}

export function query<S extends ZodTypeAny>(
  res: { locals: Record<string, unknown> },
  _schema: S,
): z.infer<S> {
  return res.locals.query as z.infer<S>;
}

export function params(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === "string" ? value : "";
}
