import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => {
  const projectRef = env('SUPABASE_PROJECT_REF', '').trim();
  const bucket = env('SUPABASE_STORAGE_BUCKET', 'strapi-uploads').trim();
  const accessKeyId = env('SUPABASE_S3_ACCESS_KEY_ID', '').trim();
  const secretAccessKey = env('SUPABASE_S3_SECRET_ACCESS_KEY', '').trim();
  const region = env('SUPABASE_S3_REGION', 'eu-central-1').trim();

  const endpoint = (
    env('SUPABASE_S3_ENDPOINT', '').trim() ||
    (projectRef
      ? `https://${projectRef}.storage.supabase.co/storage/v1/s3`
      : '')
  ).replace(/\/+$/, '');

  const publicUrl = (
    env('SUPABASE_STORAGE_PUBLIC_URL', '').trim() ||
    (projectRef && bucket
      ? `https://${projectRef}.supabase.co/storage/v1/object/public/${bucket}`
      : '')
  ).replace(/\/+$/, '');

  const useSupabaseStorage = Boolean(
    projectRef && bucket && accessKeyId && secretAccessKey && endpoint,
  );

  if (!useSupabaseStorage) {
    console.warn(
      '[tetclima] Supabase Storage env incomplete — uploads stay LOCAL. Set SUPABASE_PROJECT_REF, SUPABASE_STORAGE_BUCKET, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY.',
    );
    return {};
  }

  console.info(
    `[tetclima] Upload provider: aws-s3 → bucket "${bucket}" (${endpoint})`,
  );

  return {
    upload: {
      config: {
        provider: 'aws-s3',
        providerOptions: {
          baseUrl: publicUrl,
          rootPath: env('SUPABASE_STORAGE_ROOT_PATH', '').trim(),
          s3Options: {
            credentials: {
              accessKeyId,
              secretAccessKey,
            },
            region,
            endpoint,
            forcePathStyle: true,
            params: {
              Bucket: bucket,
              // Supabase Storage rejects ACL headers; bucket must be public in dashboard.
              ACL: undefined,
            },
          },
        },
        actionOptions: {
          upload: {},
          uploadStream: {},
          delete: {},
        },
      },
    },
  };
};

export default config;
