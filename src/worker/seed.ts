/**
 * Generates seed.sql, which is applied with:
 *   wrangler d1 execute till-db --local --file=./seed.sql
 *
 * Runs under Node (`npm run seed:gen`) but reuses the Worker's PBKDF2 helpers,
 * so seeded PINs verify through exactly the same code path as live logins.
 */
import { writeFileSync } from "node:fs";
import { hashPin } from "./lib/crypto";
import { ulid } from "./lib/ids";

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
const nullable = (v: string | null) => (v === null ? "NULL" : q(v));

interface SeedUser {
  username: string;
  pin: string;
  role: "admin" | "cashier";
}

const SEED_USERS: SeedUser[] = [
  { username: "admin", pin: "1234", role: "admin" },
  { username: "cashier", pin: "4321", role: "cashier" },
];

const CATEGORIES = [
  "Drinks",
  "Snacks",
  "Staples",
  "Dairy",
  "Household",
  "Personal Care",
] as const;

type CategoryName = (typeof CATEGORIES)[number];

interface SeedProduct {
  name: string;
  category: CategoryName;
  /** KES shillings; converted to cents below so the table stays readable. */
  price: number;
  cost: number;
  stock: number;
  lowStock: number;
}

// Prices are plausible small-shop KES. Cost sits below price so the gross
// profit report has something real to work with.
const PRODUCTS: SeedProduct[] = [
  { name: "Coca-Cola 500ml", category: "Drinks", price: 80, cost: 58, stock: 48, lowStock: 12 },
  { name: "Fanta Orange 500ml", category: "Drinks", price: 80, cost: 58, stock: 36, lowStock: 12 },
  { name: "Sprite 500ml", category: "Drinks", price: 80, cost: 58, stock: 24, lowStock: 12 },
  { name: "Dasani Water 1L", category: "Drinks", price: 60, cost: 40, stock: 60, lowStock: 15 },
  { name: "Minute Maid Mango 400ml", category: "Drinks", price: 90, cost: 66, stock: 18, lowStock: 10 },
  { name: "Ketepa Tea Leaves 250g", category: "Drinks", price: 210, cost: 168, stock: 14, lowStock: 6 },
  { name: "Nescafe Classic 50g", category: "Drinks", price: 390, cost: 320, stock: 9, lowStock: 4 },

  { name: "Tropical Heat Crisps 50g", category: "Snacks", price: 55, cost: 38, stock: 40, lowStock: 12 },
  { name: "Britania Digestive 200g", category: "Snacks", price: 120, cost: 90, stock: 22, lowStock: 8 },
  { name: "Cadbury Dairy Milk 80g", category: "Snacks", price: 250, cost: 195, stock: 11, lowStock: 5 },
  { name: "Roasted Peanuts 100g", category: "Snacks", price: 70, cost: 48, stock: 30, lowStock: 10 },
  { name: "Mandazi (pack of 4)", category: "Snacks", price: 50, cost: 30, stock: 16, lowStock: 8 },

  { name: "Pembe Maize Flour 2kg", category: "Staples", price: 230, cost: 190, stock: 32, lowStock: 10 },
  { name: "Exe Wheat Flour 2kg", category: "Staples", price: 260, cost: 215, stock: 20, lowStock: 8 },
  { name: "Mwea Pishori Rice 2kg", category: "Staples", price: 420, cost: 350, stock: 15, lowStock: 6 },
  { name: "Kabras Sugar 1kg", category: "Staples", price: 180, cost: 152, stock: 28, lowStock: 10 },
  { name: "Elianto Cooking Oil 1L", category: "Staples", price: 320, cost: 268, stock: 18, lowStock: 8 },
  { name: "Ndengu (Green Grams) 1kg", category: "Staples", price: 200, cost: 160, stock: 12, lowStock: 5 },
  { name: "Table Salt 500g", category: "Staples", price: 40, cost: 26, stock: 44, lowStock: 12 },
  { name: "Royco Cubes 8pk", category: "Staples", price: 65, cost: 46, stock: 26, lowStock: 10 },

  { name: "Brookside Fresh Milk 500ml", category: "Dairy", price: 70, cost: 55, stock: 34, lowStock: 12 },
  { name: "Brookside Yoghurt 250ml", category: "Dairy", price: 95, cost: 72, stock: 17, lowStock: 8 },
  { name: "Blue Band Margarine 250g", category: "Dairy", price: 190, cost: 152, stock: 13, lowStock: 6 },
  { name: "Eggs (tray of 30)", category: "Dairy", price: 480, cost: 410, stock: 8, lowStock: 4 },

  { name: "Sunlight Bar Soap 800g", category: "Household", price: 195, cost: 155, stock: 21, lowStock: 8 },
  { name: "Omo Washing Powder 500g", category: "Household", price: 170, cost: 136, stock: 19, lowStock: 8 },
  { name: "Jik Bleach 750ml", category: "Household", price: 150, cost: 118, stock: 14, lowStock: 6 },
  { name: "Steel Wool 3pk", category: "Household", price: 45, cost: 28, stock: 38, lowStock: 12 },

  { name: "Colgate Toothpaste 140g", category: "Personal Care", price: 230, cost: 184, stock: 16, lowStock: 6 },
  { name: "Geisha Soap 125g", category: "Personal Care", price: 85, cost: 62, stock: 27, lowStock: 10 },
  { name: "Nice & Lovely Lotion 400ml", category: "Personal Care", price: 265, cost: 210, stock: 10, lowStock: 5 },
  { name: "Always Pads 8pk", category: "Personal Care", price: 155, cost: 122, stock: 4, lowStock: 8 },
];

/** EAN-13 style filler; unique per product and scanner-friendly. */
function barcodeFor(index: number): string {
  return `620${String(index + 1).padStart(10, "0")}`;
}

// Explicit codes: deriving initials would give "Drinks" and "Dairy" the same
// prefix, and likewise "Snacks" and "Staples".
const CATEGORY_CODES: Record<CategoryName, string> = {
  Drinks: "DRK",
  Snacks: "SNK",
  Staples: "STP",
  Dairy: "DRY",
  Household: "HSE",
  "Personal Care": "PRS",
};

function skuFor(category: CategoryName, index: number): string {
  return `${CATEGORY_CODES[category]}-${String(index + 1).padStart(3, "0")}`;
}

async function main(): Promise<void> {
  const now = Date.now();
  const lines: string[] = [
    "-- Generated by `npm run seed:gen`. Do not edit by hand.",
    "PRAGMA defer_foreign_keys = true;",
    "DELETE FROM stock_movements;",
    "DELETE FROM payments;",
    "DELETE FROM sale_items;",
    "DELETE FROM sales;",
    "DELETE FROM products;",
    "DELETE FROM categories;",
    "DELETE FROM sessions;",
    "DELETE FROM users;",
  ];

  const userIds = new Map<string, string>();
  for (const u of SEED_USERS) {
    const id = ulid();
    userIds.set(u.username, id);
    const { hash, salt } = await hashPin(u.pin);
    lines.push(
      `INSERT INTO users (id, username, pin_hash, pin_salt, role, active, created_at) VALUES (${q(id)}, ${q(u.username)}, ${q(hash)}, ${q(salt)}, ${q(u.role)}, 1, ${now});`,
    );
  }
  const adminId = userIds.get("admin")!;

  const categoryIds = new Map<CategoryName, string>();
  for (const name of CATEGORIES) {
    const id = ulid();
    categoryIds.set(name, id);
    lines.push(
      `INSERT INTO categories (id, name) VALUES (${q(id)}, ${q(name)});`,
    );
  }

  PRODUCTS.forEach((p, i) => {
    const id = ulid();
    const categoryId = categoryIds.get(p.category)!;
    lines.push(
      `INSERT INTO products (id, name, sku, barcode, category_id, price_cents, cost_cents, stock_qty, low_stock_threshold, active, created_at, updated_at) VALUES (${q(id)}, ${q(p.name)}, ${q(skuFor(p.category, i))}, ${nullable(barcodeFor(i))}, ${q(categoryId)}, ${p.price * 100}, ${p.cost * 100}, ${p.stock}, ${p.lowStock}, 1, ${now}, ${now});`,
    );
    lines.push(
      `INSERT INTO stock_movements (id, product_id, delta, reason, note, user_id, created_at) VALUES (${q(ulid())}, ${q(id)}, ${p.stock}, 'restock', 'Opening stock', ${q(adminId)}, ${now});`,
    );
  });

  writeFileSync("seed.sql", `${lines.join("\n")}\n`, "utf8");

  const lowStock = PRODUCTS.filter((p) => p.stock <= p.lowStock).length;
  console.log(
    `Wrote seed.sql: ${SEED_USERS.length} users, ${CATEGORIES.length} categories, ${PRODUCTS.length} products (${lowStock} already at or below the low-stock threshold).`,
  );
  for (const u of SEED_USERS) {
    console.log(`  ${u.role.padEnd(8)} ${u.username} / PIN ${u.pin}`);
  }
}

void main();
