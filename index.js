'use strict';

/* global hexo */

const { getConfig } = require('./lib/config');
const { registerFilters } = require('./lib/filter');

// When loaded automatically by Hexo, 'hexo' is available globally
if (typeof hexo !== 'undefined') {
  const config = getConfig(hexo);
  registerFilters(hexo, config);
}

// Support explicit initialization: plugin(hexo)
module.exports = function (hexoInstance) {
  const h = hexoInstance || (typeof hexo !== 'undefined' ? hexo : null);
  if (h) {
    const config = getConfig(h);
    registerFilters(h, config);
  }
};
