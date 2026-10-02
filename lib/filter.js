'use strict';

const { parseAndEncrypt } = require('./parser');
const ImageProcessor = require('./image-processor');
const { registerInjector } = require('./injector');
const { registerTagPlugin } = require('./tag-plugin');

/**
 * Register all filters and plugins with Hexo
 * @param {object} hexo - Hexo instance
 * @param {object} config - Plugin configuration
 */
function registerFilters(hexo, config) {
  if (!config.enable) return;

  const imageProcessor = new ImageProcessor(hexo, config);

  // 1. Tag plugins: {% encrypt %} and {% placeholder %}
  registerTagPlugin(hexo, config);

  // 2. Post filter: runs after markdown is rendered to HTML
  hexo.extend.filter.register('after_post_render', async function (data) {
    if (!data || !data.content) return data;

    try {
      const result = await parseAndEncrypt(data.content, data, config, imageProcessor);
      data.content = result.content;
    } catch (err) {
      if (!config.silent) {
        console.error(`[hexo-encryption-auto] Error processing post "${data.title || data.slug}":`, err);
      }
    }

    return data;
  }, 15);

  // 3. Post-generation hook: sanitize public images
  hexo.extend.filter.register('after_generate', function () {
    try {
      imageProcessor.sanitizePublicDirectory();
    } catch (err) {
      if (!config.silent) {
        console.error('[hexo-encryption-auto] Error in public directory sanitization:', err);
      }
    }
  }, 20);

  // 4. Injector: inject CSS and JS into pages containing encrypted elements
  registerInjector(hexo, config);
}

module.exports = {
  registerFilters
};
