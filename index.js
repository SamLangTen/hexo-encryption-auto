'use strict';

/* global hexo */

const { getConfig } = require('./lib/config');
const { registerFilters } = require('./lib/filter');

function init(hexoInstance) {
  if (!hexoInstance || hexoInstance._encryption_auto_initialized) return;
  hexoInstance._encryption_auto_initialized = true;

  if (hexoInstance.log && hexoInstance.log.info) {
    hexoInstance.log.info('[hexo-encryption-auto] Plugin loaded successfully');
  }

  const config = getConfig(hexoInstance);
  registerFilters(hexoInstance, config);
}

// When loaded automatically by Hexo, 'hexo' is available globally
if (typeof hexo !== 'undefined') {
  init(hexo);
}

// Support explicit initialization: plugin(hexo)
module.exports = function (hexoInstance) {
  const h = hexoInstance || (typeof hexo !== 'undefined' ? hexo : null);
  if (h) {
    init(h);
  }
};

