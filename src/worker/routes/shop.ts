import { env } from "cloudflare:workers";
import { Router } from "express";

export const shopRouter: Router = Router();

/**
 * Receipt header and footer. These are plain vars in wrangler.jsonc rather
 * than database rows: a shop changes its name about once, and keeping them
 * in config saves a D1 query on every receipt.
 */
shopRouter.get("/", (_req, res) => {
  res.json({
    shop: {
      name: env.SHOP_NAME ?? "Till",
      address: env.SHOP_ADDRESS ?? "",
      phone: env.SHOP_PHONE ?? "",
      footer: env.SHOP_FOOTER ?? "",
    },
  });
});
