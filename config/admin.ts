import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    // Strapi v5 warning: admin.auth.options.expiresIn is deprecated; use sessions lifespan knobs instead.
    // Strapi types expect numbers here. We use milliseconds.
    sessions: {
      // Defaults: refresh token 30 days, session 7 days
      maxRefreshTokenLifespan: env.int(
        'ADMIN_AUTH_MAX_REFRESH_TOKEN_LIFESPAN_MS',
        30 * 24 * 60 * 60 * 1000,
      ),
      maxSessionLifespan: env.int(
        'ADMIN_AUTH_MAX_SESSION_LIFESPAN_MS',
        7 * 24 * 60 * 60 * 1000,
      ),
    },
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY'),
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
  },
});

export default config;
