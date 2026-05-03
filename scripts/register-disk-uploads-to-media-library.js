#!/usr/bin/env node
/**
 * Strapi Media Library is backed by the database (upload_file / files), not a folder scan.
 * Files sitting in public/uploads/ without DB rows will NOT appear in Admin → Media Library.
 *
 * This script POSTs each qualifying file to POST /api/upload (no ref/refId) so Strapi
 * creates library entries. Strapi may also generate new thumbnail/large/medium/small files.
 *
 * Skips obvious Strapi derivative filenames (thumbnail_, large_, medium_, small_) so you
 * mainly register originals; derivatives from an old DB are often orphaned on disk.
 *
 * Prerequisites:
 *   Strapi running; STRAPI_API_TOKEN with upload create (Full access works).
 *
 *   cd tetclima-api
 *   STRAPI_API_TOKEN=your_token npm run import:media-from-disk
 *
 * Env:
 *   STRAPI_URL           default http://localhost:1337
 *   UPLOADS_DIR          default <project>/public/uploads
 *   DRY_RUN=1            list files only, no upload
 */

"use strict";

const fs = require("fs");
const path = require("path");

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(
  /\/$/,
  "",
);
const API_TOKEN = process.env.STRAPI_API_TOKEN;
const DRY_RUN =
  process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const DERIVATIVE_PREFIXES = ["thumbnail_", "large_", "medium_", "small_"];

function resolveUploadsDir() {
  if (process.env.UPLOADS_DIR) {
    return path.resolve(process.env.UPLOADS_DIR);
  }
  return path.join(__dirname, "..", "public", "uploads");
}

function mimeFromExt(ext) {
  const e = String(ext || "").toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
  };
  return map[e] || "application/octet-stream";
}

function shouldSkipBaseName(base) {
  const lower = base.toLowerCase();
  if (lower === ".ds_store" || lower === ".gitkeep") return true;
  for (const p of DERIVATIVE_PREFIXES) {
    if (lower.startsWith(p)) return true;
  }
  return false;
}

async function uploadOne(absPath, base) {
  const buf = fs.readFileSync(absPath);
  const mime = mimeFromExt(path.extname(base));
  const blob = new Blob([buf], { type: mime });
  const form = new FormData();
  form.append("files", blob, base);

  const res = await fetch(`${STRAPI_URL}/api/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  if (!DRY_RUN && !API_TOKEN) {
    console.error("Set STRAPI_API_TOKEN or DRY_RUN=1.");
    process.exit(1);
  }

  const uploadsDir = resolveUploadsDir();
  if (!fs.existsSync(uploadsDir)) {
    console.error("Missing folder:", uploadsDir);
    process.exit(1);
  }

  const names = fs.readdirSync(uploadsDir);
  const files = names.filter((n) => {
    const abs = path.join(uploadsDir, n);
    if (!fs.statSync(abs).isFile()) return false;
    if (shouldSkipBaseName(n)) return false;
    return true;
  });

  console.log(`Strapi: ${STRAPI_URL}`);
  console.log(`Folder: ${uploadsDir}`);
  console.log(
    `Files to register (derivatives skipped): ${files.length}${DRY_RUN ? " [DRY_RUN]" : ""}\n`,
  );

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const base = files[i];
    const abs = path.join(uploadsDir, base);
    try {
      if (DRY_RUN) {
        console.log(`[${i + 1}/${files.length}] would upload: ${base}`);
        ok++;
        continue;
      }
      await uploadOne(abs, base);
      console.log(`✓ [${i + 1}/${files.length}] ${base}`);
      ok++;
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      failed++;
      console.error(`✗ [${i + 1}/${files.length}] ${base}: ${e.message}`);
    }
  }

  console.log(`\nDone. OK: ${ok}, failed: ${failed}`);
  if (!DRY_RUN) {
    console.log(
      "\nOpen Strapi Admin → Media Library. Orphaned thumbnail_/large_/… files may remain on disk; you can delete them later if you want to tidy the folder.",
    );
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
