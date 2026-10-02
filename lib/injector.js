'use strict';

const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../assets/encrypt.css');
const jsPath = path.join(__dirname, '../assets/encrypt.js');

let cachedCss = '';
let cachedJs = '';

function getAssets() {
  if (!cachedCss && fs.existsSync(cssPath)) {
    cachedCss = fs.readFileSync(cssPath, 'utf8');
  }
  if (!cachedJs && fs.existsSync(jsPath)) {
    cachedJs = fs.readFileSync(jsPath, 'utf8');
  }
  return { css: cachedCss, js: cachedJs };
}

/**
 * Register HTML injection for pages containing encrypted content
 * @param {object} hexo
 * @param {object} config
 */
function registerInjector(hexo, config) {
  // Use after_render:html to conditionally inject only into pages that need it
  hexo.extend.filter.register('after_render:html', function (html, data) {
    if (!config.enable) return html;
    if (!html || typeof html !== 'string') return html;

    // Check if the page contains any encrypted elements
    if (!html.includes('h-enc') && !html.includes('hexo-encrypt-container')) {
      return html;
    }

    const { css, js } = getAssets();

    // Client config object
    const clientConfig = {
      cachePassword: config.cache_password !== false,
      storageType: config.storage_type || 'sessionStorage',
      floatingButton: config.floating_button !== false,
      relockButton: config.relock_button !== false
    };

    const styleTag = `<style id="hexo-encrypt-style">\n${css}\n</style>`;
    const scriptTag = [
      `<script id="hexo-encrypt-script">`,
      `window.__HEXO_ENCRYPT_CONFIG__ = ${JSON.stringify(clientConfig)};`,
      js,
      `</script>`
    ].join('\n');

    let modifiedHtml = html;

    // Inject CSS into head
    if (modifiedHtml.includes('</head>')) {
      modifiedHtml = modifiedHtml.replace('</head>', `${styleTag}\n</head>`);
    } else {
      modifiedHtml = styleTag + modifiedHtml;
    }

    // Inject JS into body
    if (modifiedHtml.includes('</body>')) {
      modifiedHtml = modifiedHtml.replace('</body>', `${scriptTag}\n</body>`);
    } else {
      modifiedHtml = modifiedHtml + scriptTag;
    }

    return modifiedHtml;
  }, 100);
}

module.exports = {
  registerInjector,
  getAssets
};
