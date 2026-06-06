import type { Core } from '@strapi/strapi';

/**
 * TetClima (Next.js) calls Strapi from the browser (e.g. Header) and from the server.
 * Browser calls need CORS: allow local Next dev and any production origins via CORS_ORIGIN
 * (comma-separated), e.g. CORS_ORIGIN=https://www.example.com,https://example.com
 */
export default ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Middlewares => {
  const extra = env('CORS_ORIGIN', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const origin = Array.from(
    new Set([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:1337',
      'http://127.0.0.1:1337',
      ...extra,
    ]),
  );

  const projectRef = env('SUPABASE_PROJECT_REF', '').trim();
  const supabaseOrigins = projectRef
    ? [`https://${projectRef}.supabase.co`, `https://${projectRef}.storage.supabase.co`]
    : ['https://*.supabase.co'];

  return [
    'strapi::logger',
    'strapi::errors',
    {
      name: 'strapi::security',
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'img-src': ["'self'", 'data:', 'blob:', 'https:', ...supabaseOrigins],
            'media-src': ["'self'", 'data:', 'blob:', 'https:', ...supabaseOrigins],
          },
        },
      },
    },
    {
      name: 'strapi::cors',
      config: {
        origin,
      },
    },
    'strapi::poweredBy',
    'strapi::query',
    'strapi::body',
    'strapi::session',
    'strapi::favicon',
    'strapi::public',
  ];
};
