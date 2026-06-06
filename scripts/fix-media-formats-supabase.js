#!/usr/bin/env node
/**
 * Fix Strapi Media Library previews after migrating main file URLs to Supabase.
 *
 * The migrate-uploads-to-supabase script updates `files.url` but older rows still
 * have thumbnail/small/medium/large paths under `/uploads/...` in `formats`.
 * Admin shows filenames without previews when those local paths are missing (e.g. on Render).
 *
 * This script uploads derivative files from public/uploads/ to Supabase (when present)
 * and rewrites `formats` URLs to public Supabase URLs. Missing derivatives fall back to
 * the main image URL so previews still render.
 *
 * Usage:
 *   cd tetclima-api
 *   node scripts/fix-media-formats-supabase.js
 *   DRY_RUN=1 node scripts/fix-media-formats-supabase.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const pg = require('pg');
const mime = require('mime-types');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile();

const DRY_RUN = process.env.DRY_RUN === '1';

function required(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function uploadsDir() {
  return process.env.UPLOADS_DIR?.trim() || path.join(__dirname, '..', 'public', 'uploads');
}

function publicObjectUrl(projectRef, bucket, key) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `https://${projectRef}.supabase.co/storage/v1/object/public/${bucket}/${encoded}`;
}

function basenameFromUploadUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.split('?')[0];
  if (clean.startsWith('/uploads/')) return clean.slice('/uploads/'.length);
  try {
    const u = new URL(clean);
    return decodeURIComponent(u.pathname.split('/').pop() || '');
  } catch {
    return clean.split('/').pop() || null;
  }
}

function isLocalUploadUrl(url) {
  return typeof url === 'string' && (url.startsWith('/uploads/') || url.startsWith('uploads/'));
}

async function uploadIfNeeded(s3, bucket, absPath, key, cache) {
  if (cache.has(key)) return cache.get(key);
  const publicUrl = cache.get('publicBase')
    ? publicObjectUrl(cache.get('projectRef'), bucket, key)
    : null;

  if (DRY_RUN) {
    cache.set(key, publicUrl);
    return publicUrl;
  }

  const body = fs.readFileSync(absPath);
  const contentType = mime.lookup(key) || 'application/octet-stream';
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  const url = publicObjectUrl(cache.get('projectRef'), bucket, key);
  cache.set(key, url);
  return url;
}

async function main() {
  const projectRef = required('SUPABASE_PROJECT_REF');
  const bucket = required('SUPABASE_STORAGE_BUCKET');
  const accessKeyId = required('SUPABASE_S3_ACCESS_KEY_ID');
  const secretAccessKey = required('SUPABASE_S3_SECRET_ACCESS_KEY');
  const region = process.env.SUPABASE_S3_REGION?.trim() || 'eu-central-1';
  const endpoint = (
    process.env.SUPABASE_S3_ENDPOINT?.trim() ||
    `https://${projectRef}.storage.supabase.co/storage/v1/s3`
  ).replace(/\/+$/, '');
  const databaseUrl = required('DATABASE_URL');
  const dir = uploadsDir();

  const s3 = DRY_RUN
    ? null
    : new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });

  const uploadCache = new Map();
  uploadCache.set('projectRef', projectRef);

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
  });

  const { rows } = await pool.query(
    `SELECT id, name, url, formats
     FROM files
     WHERE formats IS NOT NULL
       AND formats::text LIKE '%/uploads/%'`,
  );

  console.log(`Files with local format URLs: ${rows.length}${DRY_RUN ? ' [DRY_RUN]' : ''}`);
  if (!rows.length) {
    await pool.end();
    return;
  }

  let updated = 0;
  let uploaded = 0;
  let fallback = 0;

  for (const row of rows) {
    const formats =
      typeof row.formats === 'string' ? JSON.parse(row.formats) : row.formats;
    if (!formats || typeof formats !== 'object') continue;

    let changed = false;

    for (const key of Object.keys(formats)) {
      const entry = formats[key];
      if (!entry || !isLocalUploadUrl(entry.url)) continue;

      const fileName = basenameFromUploadUrl(entry.url);
      if (!fileName) continue;

      const abs = path.join(dir, fileName);
      let nextUrl;

      if (fs.existsSync(abs)) {
        nextUrl = await uploadIfNeeded(s3, bucket, abs, fileName, uploadCache);
        uploaded += 1;
      } else {
        nextUrl = row.url;
        fallback += 1;
      }

      if (entry.url !== nextUrl) {
        entry.url = nextUrl;
        changed = true;
      }
    }

    if (!changed) continue;

    if (DRY_RUN) {
      console.log(`[dry-run] would update formats for: ${row.name}`);
      updated += 1;
      continue;
    }

    await pool.query(
      `UPDATE files SET formats = $1::jsonb, provider = 'aws-s3', updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(formats), row.id],
    );
    updated += 1;
    console.log(`✓ ${row.name}`);
  }

  await pool.end();
  console.log(
    `Done. DB rows updated: ${updated}, derivatives uploaded: ${uploaded}, fallbacks to main URL: ${fallback}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
