import { env } from "cloudflare:workers";
import { and, eq, lt } from "drizzle-orm";
import { Router } from "express";
import { changePinSchema, loginSchema } from "../../shared/schemas";
import { db, schema } from "../db/client";
import {
  dummyPinWork,
  hashPin,
  randomToken,
  sessionIdFor,
  signToken,
  verifyPin,
} from "../lib/crypto";
import { unauthorized } from "../lib/http";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  requireAuth,
} from "../middleware/auth";
import { validateBody } from "../middleware/validate";

export const authRouter: import("express").Router = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  // Local `wrangler dev` is plain http, so Secure would drop the cookie.
  secure: env.ENVIRONMENT !== "development",
};

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const { username, pin } = req.body as { username: string; pin: string };

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username.toLowerCase()))
    .get();

  if (!user || user.active !== 1) {
    // Burn the same PBKDF2 time so username enumeration is not timeable.
    await dummyPinWork(pin);
    throw unauthorized("Incorrect username or PIN");
  }

  if (!(await verifyPin(pin, user.pinHash, user.pinSalt))) {
    throw unauthorized("Incorrect username or PIN");
  }

  const token = randomToken();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  await db.batch([
    db.insert(schema.sessions).values({
      id: await sessionIdFor(token),
      userId: user.id,
      expiresAt,
      createdAt: now,
    }),
    // Opportunistic sweep, kept in the same round trip as the insert.
    db
      .delete(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, user.id),
          lt(schema.sessions.expiresAt, now),
        ),
      ),
  ]);

  res.cookie(SESSION_COOKIE, await signToken(token, env.SESSION_SECRET), {
    ...cookieOptions,
    maxAge: SESSION_TTL_MS,
  });

  res.json({
    user: { id: user.id, username: user.username, role: user.role },
  });
});

authRouter.post("/logout", async (req, res) => {
  if (req.sessionId) {
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, req.sessionId));
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post(
  "/pin",
  requireAuth,
  validateBody(changePinSchema),
  async (req, res) => {
    const { currentPin, newPin } = req.body as {
      currentPin: string;
      newPin: string;
    };
    const me = req.user!;

    const user = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, me.id))
      .get();
    if (!user) throw unauthorized();

    if (!(await verifyPin(currentPin, user.pinHash, user.pinSalt))) {
      throw unauthorized("Current PIN is incorrect");
    }

    const { hash, salt } = await hashPin(newPin);
    const newSessionToken = randomToken();
    const now = Date.now();

    await db.batch([
      db
        .update(schema.users)
        .set({ pinHash: hash, pinSalt: salt })
        .where(eq(schema.users.id, me.id)),
      // Changing a PIN invalidates every other session for this user.
      db.delete(schema.sessions).where(eq(schema.sessions.userId, me.id)),
      db.insert(schema.sessions).values({
        id: await sessionIdFor(newSessionToken),
        userId: me.id,
        expiresAt: now + SESSION_TTL_MS,
        createdAt: now,
      }),
    ]);

    res.cookie(
      SESSION_COOKIE,
      await signToken(newSessionToken, env.SESSION_SECRET),
      { ...cookieOptions, maxAge: SESSION_TTL_MS },
    );
    res.json({ ok: true });
  },
);

/** Used by the seed check in the UI: is there any admin yet? */
authRouter.get("/status", async (_req, res) => {
  const row = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .limit(1)
    .get();
  res.json({ seeded: Boolean(row) });
});
