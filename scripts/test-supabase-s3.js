#!/usr/bin/env node
/** Quick test: can we PutObject to Supabase Storage with S3 keys? */
const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

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

async function main() {
  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY?.trim();
  const region = process.env.SUPABASE_S3_REGION?.trim() || 'eu-central-1';
  const endpoint = (
    process.env.SUPABASE_S3_ENDPOINT?.trim() ||
    `https://${projectRef}.storage.supabase.co/storage/v1/s3`
  ).replace(/\/+$/, '');

  if (!projectRef || !bucket || !accessKeyId || !secretAccessKey) {
    console.error('Missing Supabase S3 env vars in .env');
    process.exit(1);
  }

  console.log('Endpoint:', endpoint);
  console.log('Bucket:', bucket);

  const s3 = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  const key = `_strapi_test_${Date.now()}.txt`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: 'strapi supabase test',
      ContentType: 'text/plain',
    }),
  );
  console.log('PutObject OK:', key);

  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }),
  );
  console.log(
    'Sample objects in bucket:',
    (list.Contents || []).map((o) => o.Key),
  );

  const publicUrl = `https://${projectRef}.supabase.co/storage/v1/object/public/${bucket}/${key}`;
  console.log('Public URL (open in browser):', publicUrl);
}

main().catch((err) => {
  console.error('S3 test failed:', err.message || err);
  process.exit(1);
});
