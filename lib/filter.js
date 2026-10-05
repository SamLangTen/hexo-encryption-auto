'use strict';

const path = require('path');
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

      if (data.excerpt) {
        const excerptResult = await parseAndEncrypt(data.excerpt, data, config, imageProcessor);
        data.excerpt = excerptResult.content;
      }
      if (data.more) {
        const moreResult = await parseAndEncrypt(data.more, data, config, imageProcessor);
        data.more = moreResult.content;
      }
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

  hexo.extend.filter.register('before_exit', function () {
    try {
      imageProcessor.sanitizePublicDirectory();
    } catch (err) {
      if (!config.silent) {
        console.error('[hexo-encryption-auto] Error in public directory sanitization (before_exit):', err);
      }
    }
  }, 20);

  // 4. Server middleware: intercept image requests in hexo-server to serve blurred image
  if (config.replace_public_images) {
    hexo.extend.filter.register('server_middleware', function (app) {
      if (!app || typeof app.use !== 'function') return;

      let hasScannedPosts = false;
      const scanPostsOnce = () => {
        if (hasScannedPosts) return;
        hasScannedPosts = true;
        try {
          const Post = hexo.model('Post');
          const Page = hexo.model('Page');
          const all = [...(Post ? Post.toArray() : []), ...(Page ? Page.toArray() : [])];
          for (const p of all) {
            const text = p._content || p.content || '';
            if (text.includes('<enc') || text.includes('h-enc') || text.includes('{% encrypt')) {
              const matches = text.match(/<img\b[^>]*?\bsrc=["']([^"']+)["']/gi);
              if (matches) {
                for (const m of matches) {
                  const srcMatch = m.match(/src=["']([^"']+)["']/i);
                  if (srcMatch && !srcMatch[1].startsWith('data:')) {
                    const src = srcMatch[1].replace(/[?#].*$/, '').replace(/^\/+/, '');
                    const target = path.join(hexo.public_dir, src);
                    imageProcessor.recordEncryptedImage(target);
                  }
                }
              }
            }
          }
        } catch (e) {}
      };

      app.use(async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const cleanPath = (req.url || '').replace(/[?#].*$/, '').replace(/^\/+/, '');
        if (!cleanPath) return next();

        if (/\.(jpe?g|png|webp|gif|svg|avif)$/i.test(cleanPath)) {
          scanPostsOnce();

          const publicTarget = path.join(hexo.public_dir, cleanPath);
          if (imageProcessor.encryptedFilesMap.has(publicTarget)) {
            let blurredBuffer = imageProcessor.encryptedFilesMap.get(publicTarget);
            if (!blurredBuffer) {
              const resolved = await imageProcessor.resolveImage(cleanPath);
              if (resolved) {
                const blurred = await imageProcessor.blurImage(resolved.buffer, resolved.mimeType);
                blurredBuffer = blurred.blurredBuffer;
                imageProcessor.encryptedFilesMap.set(publicTarget, blurredBuffer);
                if (hexo.route) {
                  hexo.route.set(cleanPath, blurredBuffer);
                }
              }
            }

            if (blurredBuffer) {
              const ext = path.extname(cleanPath).toLowerCase();
              const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml'
              };
              res.setHeader('Content-Type', mimeTypes[ext] || 'image/jpeg');
              res.end(blurredBuffer);
              return;
            }
          }
        }

        next();
      });
    }, 1);
  }

  // 5. Injector: inject CSS and JS into pages containing encrypted elements
  registerInjector(hexo, config);
}

module.exports = {
  registerFilters
};
