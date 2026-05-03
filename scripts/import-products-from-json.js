#!/usr/bin/env node
/**
 * Import air conditioners from products.json into Strapi (Product collection).
 *
 * Prerequisites:
 * 1. Strapi is running (e.g. npm run develop).
 * 2. Create an API token: Admin → Settings → API Tokens → Create (Full access, or Custom with Product → create).
 * 3. Run from tetclima-api folder:
 *    STRAPI_API_TOKEN=your_token_here node scripts/import-products-from-json.js
 *
 * Use the real token from Admin → Settings → API Tokens (long string), not the word "Full_Access".
 *
 * Optional:
 *   STRAPI_URL=https://your-strapi.com  (default: http://localhost:1337)
 *   PRODUCTS_JSON=/path/to/products.json
 *
 * JSON file: either a plain array of products, or Strapi export shape `{ "data": [ ... ] }`.
 * Default file: tetclima-api/products.json (then Websites/products.json if the API file is missing).
 *
 * This uses Strapi’s REST API only — Strapi persists rows to the database in tetclima-api/.env
 * (DATABASE_CLIENT + DATABASE_URL). For Supabase, use postgres + your Supabase connection string;
 * then run this while Strapi is running so POST /api/products hits that instance.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(
  /\/$/,
  "",
);
const API_TOKEN = process.env.STRAPI_API_TOKEN;

/** Best-effort parse of tetclima-api/.env so we can warn if DB is not Postgres/Supabase. */
function readStrapiDatabaseHint() {
  try {
    const envPath = path.join(__dirname, "..", ".env");
    const raw = fs.readFileSync(envPath, "utf8");
    const line = (key) => {
      const m = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
      return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
    };
    const client = line("DATABASE_CLIENT");
    const url = line("DATABASE_URL");
    if (client === "postgres" && /supabase/i.test(url)) {
      return "DB hint: .env uses Postgres + Supabase — imported products will be stored in that Supabase database.";
    }
    if (client === "postgres") {
      return "DB hint: .env uses Postgres — imported products will be stored in that DATABASE_URL database.";
    }
    if (client === "sqlite" || client === "") {
      return "WARNING: .env has DATABASE_CLIENT=sqlite or unset — imports go to local SQLite, not Supabase. Set DATABASE_CLIENT=postgres and DATABASE_URL to your Supabase URI, restart Strapi, then import.";
    }
    return null;
  } catch {
    return null;
  }
}

function resolveProductsJsonPath() {
  if (process.env.PRODUCTS_JSON) {
    return path.resolve(process.env.PRODUCTS_JSON);
  }
  const apiLocal = path.join(__dirname, "..", "products.json");
  const parentRepo = path.join(__dirname, "..", "..", "products.json");
  if (fs.existsSync(apiLocal)) return apiLocal;
  if (fs.existsSync(parentRepo)) return parentRepo;
  return apiLocal;
}

function normalizeProductsArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.data)) return parsed.data;
  return null;
}

function loadProducts() {
  const jsonPath = resolveProductsJsonPath();

  if (!fs.existsSync(jsonPath)) {
    console.error("Missing file:", jsonPath);
    console.error(
      "Set PRODUCTS_JSON=/full/path/to/products.json if the file is elsewhere.",
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, "utf8");
  const trimmed = raw.trim();

  if (!trimmed) {
    console.error("products.json is empty:", jsonPath);
    console.error(
      "Save the file in your editor (valid JSON array) and run again.",
    );
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid JSON in:", jsonPath);
    console.error(e.message);
    process.exit(1);
  }

  const products = normalizeProductsArray(parsed);
  if (!products) {
    console.error(
      "products.json must be a JSON array or Strapi export { \"data\": [ ... ] }.",
    );
    process.exit(1);
  }

  return { products, jsonPath };
}

function buildData(item) {
  const {
    Specifications,
    id: _id,
    documentId: _doc,
    createdAt: _c,
    updatedAt: _u,
    image: _img,
    ...rest
  } = item;
  const specs =
    Specifications && typeof Specifications === "object"
      ? { ...Specifications }
      : {};
  delete specs.id;
  delete specs.documentId;
  for (const k of Object.keys(specs)) {
    if (specs[k] === null || specs[k] === undefined) delete specs[k];
  }

  const data = {
    type: rest.type,
    brand: rest.brand,
    model: rest.model,
    price: Math.round(Number(rest.price)) || 0,
    efficiency: rest.efficiency != null ? String(rest.efficiency) : "",
    description: rest.description != null ? String(rest.description) : "",
    isAvailable: rest.isAvailable === false ? false : true,
    Specifications: specs,
    publishedAt:
      typeof rest.publishedAt === "string" && rest.publishedAt
        ? rest.publishedAt
        : new Date().toISOString(),
  };

  if (rest.badge) data.badge = String(rest.badge);
  if (rest.isRefurbished === true || rest.isRefurbished === false) {
    data.isRefurbished = rest.isRefurbished;
  }

  return data;
}

function formatFetchError(e, url) {
  const cause = e && typeof e === "object" && "cause" in e && e.cause ? String(e.cause.message || e.cause) : "";
  const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
  const detail = cause && cause !== msg ? `${msg} (${cause})` : msg;
  return `Could not reach ${url}\n  ${detail}\n  → Start Strapi from tetclima-api: npm run develop\n  → Or set STRAPI_URL to your deployed API if importing remotely.`;
}

async function createProduct(data, index) {
  const postUrl = `${STRAPI_URL}/api/products`;
  let res;
  try {
    res = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ data }),
    });
  } catch (e) {
    throw new Error(formatFetchError(e, postUrl));
  }

  let body = await res.json().catch(() => ({}));

  // Retry without publishedAt if API rejects it (publish entries manually in Admin)
  if (!res.ok && data.publishedAt && body?.error) {
    const { publishedAt, ...rest } = data;
    try {
      res = await fetch(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify({ data: rest }),
      });
    } catch (e) {
      throw new Error(formatFetchError(e, postUrl));
    }
    body = await res.json().catch(() => ({}));
    if (res.ok) {
      console.warn(
        `  (draft) Use Admin → Publish for item #${index + 1} if needed.`,
      );
    }
  }

  if (!res.ok) {
    const err = new Error(
      `HTTP ${res.status} for item #${index + 1}: ${JSON.stringify(body)}`,
    );
    err.body = body;
    throw err;
  }

  return body;
}

/** Fails fast with a clear message if Strapi is not listening (common cause of opaque "fetch failed"). */
async function assertStrapiReachable() {
  const pingUrl = `${STRAPI_URL}/api/products?pagination[pageSize]=1`;
  try {
    await fetch(pingUrl, { method: "GET" });
  } catch (e) {
    console.error(formatFetchError(e, pingUrl));
    process.exit(1);
  }
}

async function main() {
  if (!API_TOKEN) {
    console.error(`
Missing STRAPI_API_TOKEN.

Create a token in Strapi Admin → Settings → API Tokens, then run:

  STRAPI_API_TOKEN=your_token_here node scripts/import-products-from-json.js
`);
    process.exit(1);
  }

  if (API_TOKEN === "Full_Access" || API_TOKEN.length < 20) {
    console.warn(
      "Warning: STRAPI_API_TOKEN should be the long secret from Strapi (Settings → API Tokens), not the token type name.\n",
    );
  }

  await assertStrapiReachable();

  const { products, jsonPath } = loadProducts();

  const dbHint = readStrapiDatabaseHint();
  if (dbHint) console.log(`${dbHint}\n`);

  console.log(`Strapi: ${STRAPI_URL}`);
  console.log(`JSON:  ${jsonPath}`);
  console.log(
    `Importing ${products.length} product(s) via Strapi API (same DB as this Strapi instance)...\n`,
  );

  for (let i = 0; i < products.length; i++) {
    const item = products[i];
    const data = buildData(item);
    try {
      const result = await createProduct(data, i);
      const created = result.data || result;
      const id =
        created.documentId ||
        created.id ||
        (created.attributes && created.attributes.documentId) ||
        "?";
      console.log(`✓ [${i + 1}] ${item.brand} ${item.model} → id: ${id}`);
    } catch (e) {
      console.error(`✗ [${i + 1}] Failed: ${item.brand} ${item.model}`);
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  console.log("\nDone. Add product images in Strapi Admin if needed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
