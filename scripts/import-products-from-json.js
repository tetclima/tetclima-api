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
 *   PRODUCTS_JSON=/path/to/products.json  (if not using tetclima-api/products.json)
 */

"use strict";

const fs = require("fs");
const path = require("path");

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(
  /\/$/,
  "",
);
const API_TOKEN = process.env.STRAPI_API_TOKEN;

function loadProducts() {
  // Default: tetclima-api/products.json next to this script's parent folder
  const jsonPath = process.env.PRODUCTS_JSON
    ? path.resolve(process.env.PRODUCTS_JSON)
    : path.join(__dirname, "..", "products.json");

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

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Invalid JSON in:", jsonPath);
    console.error(e.message);
    process.exit(1);
  }
}

function buildData(item) {
  const { Specifications, ...rest } = item;
  const specs =
    Specifications && typeof Specifications === "object"
      ? { ...Specifications }
      : {};
  delete specs.id;
  delete specs.documentId;

  const data = {
    type: rest.type,
    brand: rest.brand,
    model: rest.model,
    price: Math.round(Number(rest.price)) || 0,
    efficiency: rest.efficiency != null ? String(rest.efficiency) : "",
    description: rest.description != null ? String(rest.description) : "",
    Specifications: specs,
    publishedAt: new Date().toISOString(),
  };

  if (rest.badge) data.badge = String(rest.badge);

  return data;
}

async function createProduct(data, index) {
  let res = await fetch(`${STRAPI_URL}/api/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({ data }),
  });

  let body = await res.json().catch(() => ({}));

  // Retry without publishedAt if API rejects it (publish entries manually in Admin)
  if (!res.ok && data.publishedAt && body?.error) {
    const { publishedAt, ...rest } = data;
    res = await fetch(`${STRAPI_URL}/api/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ data: rest }),
    });
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

  const products = loadProducts();
  if (!Array.isArray(products)) {
    console.error("products.json must be a JSON array.");
    process.exit(1);
  }

  const jsonPath = process.env.PRODUCTS_JSON
    ? path.resolve(process.env.PRODUCTS_JSON)
    : path.join(__dirname, "..", "products.json");

  console.log(`Strapi: ${STRAPI_URL}`);
  console.log(`JSON:  ${jsonPath}`);
  console.log(`Importing ${products.length} product(s)...\n`);

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
      console.error(e.message);
      process.exit(1);
    }
  }

  console.log("\nDone. Add product images in Strapi Admin if needed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
