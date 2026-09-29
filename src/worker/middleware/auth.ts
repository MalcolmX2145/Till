import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import { db, schema } from "../db/client";
import { sessionIdFor, verifySignedToken } from "../lib/crypto";
import { forbidden, unauthorized } from "../lib/http";

export const SESSION_COOKIE = "till_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * Resolves the session if one is present. Never rejects: routes that need a
 * user use requireAuth, which runs this first.
 */
export const attachUser: RequestHandler = async (req, _res, next) => {
  const raw = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!raw) return next();

  // HMAC check first: a forged cookie costs zero D1 queries.
  const token = await verifySignedToken(raw, env.SESSION_SECRET);
  if (!token) return next();

  const id = await sessionIdFor(token);
  const row = await db
    .select({
      sessionId: schema.sessions.id,
      expiresAt: schema.sessions.expiresAt,
      userId: schema.users.id,
      username: schema.users.username,
      role: schema.users.role,
      active: schema.users.active,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, id))
    .get();

  if (!row || row.expiresAt < Date.now() || row.active !== 1) return next();

  req.sessionId = row.sessionId;
  req.user = { id: row.userId, username: row.username, role: row.role };
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== "admin") {
    return next(forbidden("Admin access required"));
  }
  next();
};
