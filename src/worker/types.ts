import type { SessionUser } from "../shared/schemas";

declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAuth / attachUser. */
      user?: SessionUser;
      sessionId?: string;
    }
  }
}

export {};
