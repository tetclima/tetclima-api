#!/usr/bin/env node
/**
 * One-time: upload files from public/uploads/ to Supabase Storage and update Strapi file URLs in Postgres.
 *
 * Prerequisites:
 * - Supabase bucket created (public), S3 keys in .env (see .env.example)
 * - DATABASE_URL set (same DB Strapi uses)
 *
 * Usage:
 *   cd tetclima-api
 *   node scripts/migrate-uploads-to-supabase.js
 *   DRY_RUN=1 node scripts/migrate-uploads-to-supabase.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const pg = require('pg');

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

async function main() {
  const projectRef = required('SUPABASE_PROJECT_REF');
  const bucket = required('SUPABASE_STORAGE_BUCKET');
  const accessKeyId = required('SUPABASE_S3_ACCESS_KEY_ID');
  const secretAccessKey = required('SUPABASE_S3_SECRET_ACCESS_KEY');
  const region = process.env.SUPABASE_S3_REGION?.trim() || 'eu-central-1';
  const endpoint = (
    process.env.SUPABASE_S3_ENDPOINT?.trim() ||
    `https://${projectRef}.supabase.co/storage/v1/s3`
  ).replace(/\/+$/, '');
  const databaseUrl = required('DATABASE_URL');
  const dir = uploadsDir();

  if (!fs.existsSync(dir)) {
    console.error('No uploads folder:', dir);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((n) => {
    const abs = path.join(dir, n);
    return fs.statSync(abs).isFile();
  });

  console.log(`Found ${files.length} file(s) in ${dir}`);
  if (!files.length) return;

  const s3 = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
  });

  let uploaded = 0;
  let updated = 0;

  for (const name of files) {
    const abs = path.join(dir, name);
    const key = name;
    const publicUrl = publicObjectUrl(projectRef, bucket, key);

    if (DRY_RUN) {
      console.log(`[dry-run] would upload ${name} → ${publicUrl}`);
      continue;
    }

    const body = fs.readFileSync(abs);
    const contentType = require('mime-types').lookup(name) || 'application/octet-stream';

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    uploaded += 1;

    const localUrl = `/uploads/${name}`;
    const res = await pool.query(
      `UPDATE files
       SET url = $1, provider = 'aws-s3', updated_at = NOW()
       WHERE url = $2 OR url LIKE $3 OR name = $4`,
      [publicUrl, localUrl, `%/${name}`, name],
    );
    if (res.rowCount > 0) {
      updated += res.rowCount;
      console.log(`✓ ${name} → ${publicUrl} (${res.rowCount} DB row(s))`);
    } else {
      console.log(`✓ uploaded ${name} (no matching files row — upload via Admin if needed)`);
    }
  }

  await pool.end();
  console.log(`Done. Uploaded: ${uploaded}, DB rows updated: ${updated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
