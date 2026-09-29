import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// `env` is imported at module scope per the Cloudflare Express guide, so the
// binding is reachable from every route handler without threading it through.
export const db = drizzle(env.DB, { schema, casing: "snake_case" });
export { schema };
export type Db = typeof db;
