#!/usr/bin/env node
/**
 * Link product images from a Strapi-style export (products.json) into the current Strapi DB.
 *
 * Postgres only stores file metadata + relations; binaries live under public/uploads/.
 * If you imported products via API without images, or the DB was recreated, run this while
 * the original files still exist on disk (same machine as this script's public/ folder),
 * or set STRAPI_PUBLIC_DIR to a folder that contains `uploads/...` paths from the export.
 *
 * Prerequisites:
 * 1. Strapi running (e.g. npm run develop).
 * 2. API token with Upload + Product find (Settings → API Tokens → Custom: upload, product find).
 *    Full access also works.
 *
 * Run from tetclima-api:
 *   STRAPI_API_TOKEN=your_token node scripts/attach-product-images-from-export.js
 *
 * Options (env):
 *   STRAPI_URL              default http://localhost:1337
 *   PRODUCTS_JSON           path to export (default: tetclima-api/products.json, then repo root)
 *   STRAPI_PUBLIC_DIR       folder containing `uploads` (default: ./public)
 *   REPLACE=1               re-upload and attach even if product already has images
 */

"use strict";

const fs = require("fs");
const path = require("path");

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(
  /\/$/,
  "",
);
const API_TOKEN = process.env.STRAPI_API_TOKEN;
const REF = "api::product.product";
const FIELD = "image";
const REPLACE = process.env.REPLACE === "1" || process.env.REPLACE === "true";

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

function resolvePublicDir() {
  if (process.env.STRAPI_PUBLIC_DIR) {
    return path.resolve(process.env.STRAPI_PUBLIC_DIR);
  }
  return path.join(__dirname, "..", "public");
}

function loadExport() {
  const jsonPath = resolveProductsJsonPath();
  if (!fs.existsSync(jsonPath)) {
    console.error("Missing:", jsonPath);
    process.exit(1);
  }
  const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.data;
  if (!Array.isArray(rows)) {
    console.error("Expected array or { data: [] } in", jsonPath);
    process.exit(1);
  }
  return { rows, jsonPath };
}

function mimeFromExt(ext) {
  const e = String(ext || "").toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[e] || "application/octet-stream";
}

function diskPathFromUrl(publicDir, urlPath) {
  if (!urlPath || typeof urlPath !== "string") return null;
  const rel = urlPath.replace(/^\//, "");
  return path.join(publicDir, rel);
}

function getExportRefurbished(item) {
  return Boolean(item.isRefurbished);
}

function pickStrapiProduct(candidates, wantRefurbished) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const match = candidates.find((p) => {
    const v = p.isRefurbished ?? p.attributes?.isRefurbished;
    return Boolean(v) === wantRefurbished;
  });
  return match || candidates[0];
}

function existingImageCount(entry) {
  const img = entry.image ?? entry.attributes?.image;
  if (!img) return 0;
  if (Array.isArray(img)) return img.length;
  if (img.data && Array.isArray(img.data)) return img.data.length;
  return 0;
}

function entryDocumentId(entry) {
  return (
    entry.documentId ||
    entry.attributes?.documentId ||
    (typeof entry.id === "string" && entry.id.includes("-") ? entry.id : null)
  );
}

function entryNumericId(entry) {
  const n = Number(entry.id);
  return Number.isFinite(n) ? n : null;
}

async function findStrapiProducts(brand, model) {
  const u = new URL(`${STRAPI_URL}/api/products`);
  u.searchParams.set("filters[brand][$eq]", brand);
  u.searchParams.set("filters[model][$eq]", model);
  u.searchParams.set("populate", "image");
  u.searchParams.set("pagination[pageSize]", "25");

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`find products HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return Array.isArray(body.data) ? body.data : [];
}

async function uploadEntryFiles({ documentId, numericId, blobs, names }) {
  const form = new FormData();
  for (let i = 0; i < blobs.length; i++) {
    form.append("files", blobs[i], names[i]);
  }
  form.append("ref", REF);
  form.append("refId", String(documentId));
  form.append("field", FIELD);

  let res = await fetch(`${STRAPI_URL}/api/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    body: form,
  });
  let body = await res.json().catch(() => ({}));

  if (!res.ok && numericId != null && String(documentId) !== String(numericId)) {
    const form2 = new FormData();
    for (let i = 0; i < blobs.length; i++) {
      form2.append("files", blobs[i], names[i]);
    }
    form2.append("ref", REF);
    form2.append("refId", String(numericId));
    form2.append("field", FIELD);
    res = await fetch(`${STRAPI_URL}/api/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      body: form2,
    });
    body = await res.json().catch(() => ({}));
  }

  if (!res.ok) {
    throw new Error(`upload HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  if (!API_TOKEN) {
    console.error("Set STRAPI_API_TOKEN (Strapi Admin → Settings → API Tokens).");
    process.exit(1);
  }

  const publicDir = resolvePublicDir();
  const { rows, jsonPath } = loadExport();

  console.log(`Strapi: ${STRAPI_URL}`);
  console.log(`JSON:   ${jsonPath}`);
  console.log(`Files:  ${publicDir}`);
  console.log(`Replace existing: ${REPLACE}\n`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    const brand = String(item.brand ?? "").trim();
    const model = String(item.model ?? "").trim();
    const images = Array.isArray(item.image) ? item.image : [];

    if (!brand || !model) {
      console.warn(`[${i + 1}] skip: missing brand/model`);
      skipped++;
      continue;
    }
    if (!images.length) {
      console.warn(`[${i + 1}] skip: no images in export — ${brand} ${model}`);
      skipped++;
      continue;
    }

    try {
      const candidates = await findStrapiProducts(brand, model);
      const wantRef = getExportRefurbished(item);
      const entry = pickStrapiProduct(candidates, wantRef);

      if (!entry) {
        console.warn(`[${i + 1}] skip: no Strapi product — ${brand} ${model}`);
        skipped++;
        continue;
      }

      if (!REPLACE && existingImageCount(entry) > 0) {
        console.log(
          `[${i + 1}] skip (already has images): ${brand} ${model}`,
        );
        skipped++;
        continue;
      }

      const blobs = [];
      const names = [];

      for (const media of images) {
        const url = media && media.url;
        const abs = diskPathFromUrl(publicDir, url);
        if (!abs || !fs.existsSync(abs)) {
          console.warn(
            `  missing file for ${brand} ${model}: ${url} (looked under ${publicDir})`,
          );
          continue;
        }
        const buf = fs.readFileSync(abs);
        const base = path.basename(abs);
        const ext = path.extname(base);
        const mime = mimeFromExt(ext);
        blobs.push(new Blob([buf], { type: mime }));
        names.push(base);
      }

      if (!blobs.length) {
        console.warn(`[${i + 1}] skip: no files on disk — ${brand} ${model}`);
        skipped++;
        continue;
      }

      const documentId = entryDocumentId(entry);
      const numericId = entryNumericId(entry);
      if (!documentId && numericId == null) {
        console.warn(`[${i + 1}] skip: no documentId on Strapi entry`);
        skipped++;
        continue;
      }

      const refId = documentId || numericId;
      await uploadEntryFiles({
        documentId: refId,
        numericId,
        blobs,
        names,
      });

      console.log(`✓ [${i + 1}] ${brand} ${model} (${blobs.length} file(s))`);
      ok++;
    } catch (e) {
      failed++;
      console.error(`✗ [${i + 1}] ${brand} ${model}: ${e.message}`);
    }
  }

  console.log(`\nDone. Linked: ${ok}, skipped: ${skipped}, failed: ${failed}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
