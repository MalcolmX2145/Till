// Hand-maintained until `npm run cf-typegen` is run against a real account.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    SESSION_SECRET: string;
    ENVIRONMENT?: string;
    SHOP_NAME?: string;
    SHOP_ADDRESS?: string;
    SHOP_PHONE?: string;
    SHOP_FOOTER?: string;
  }
}
interface Env extends Cloudflare.Env {}

declare module "cloudflare:workers" {
  export const env: Env;
}

declare module "cloudflare:node" {
  export function httpServerHandler(options: { port: number }): ExportedHandler<Env>;
}
