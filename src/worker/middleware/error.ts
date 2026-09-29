import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http";

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Unknown API route", code: "not_found" });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: "validation_failed",
      details: err.flatten(),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details === undefined ? {} : { details: err.details }),
    });
    return;
  }
  console.error("Unhandled error", err);
  res.status(500).json({ error: "Something went wrong", code: "internal" });
};
