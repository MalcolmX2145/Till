import { defineConfig } from "drizzle-kit";

// Schema is the source of truth; `npm run db:generate` emits SQL into
// ./migrations, which `wrangler d1 migrations apply` runs locally or remotely.
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/worker/db/schema.ts",
  out: "./migrations",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
});
