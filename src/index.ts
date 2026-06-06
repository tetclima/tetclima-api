import type { Core } from '@strapi/strapi';

const FILE_UID = 'plugin::upload.file';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const uploadCfg = strapi.config.get('plugin::upload') as {
      provider?: string;
    };
    strapi.log.info(
      `[tetclima] Active upload provider: ${uploadCfg?.provider ?? 'local (default)'}`,
    );

    const flag = process.env.MOVE_MEDIA_FROM_API_UPLOADS_TO_ROOT;
    if (flag !== 'true' && flag !== '1') return;

    const apiUploadFolder = await strapi
      .plugin('upload')
      .service('api-upload-folder')
      .getAPIUploadFolder();

    const uploadService = strapi.plugin('upload').service('upload');

    const files = await strapi.db.query(FILE_UID).findMany({
      where: { folder: apiUploadFolder.id },
    });

    if (!files.length) {
      strapi.log.info(
        '[tetclima] MOVE_MEDIA_FROM_API_UPLOADS_TO_ROOT: no files in "API Uploads".',
      );
      return;
    }

    let moved = 0;
    for (const f of files) {
      try {
        await uploadService.updateFileInfo(f.id, { folder: null });
        moved++;
      } catch (e) {
        strapi.log.error(
          `[tetclima] Failed to move media id=${f.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    strapi.log.info(
      `[tetclima] Moved ${moved}/${files.length} file(s) from "API Uploads" to Media Library root. Remove MOVE_MEDIA_FROM_API_UPLOADS_TO_ROOT when done.`,
    );
  },
};
