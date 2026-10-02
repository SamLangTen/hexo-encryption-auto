'use strict';

const DEFAULT_CONFIG = {
  enable: true,
  password: '', // Site-wide default password
  tag_names: ['encrypt', 'hexo-encrypt', 'secret'],
  placeholder_tag_names: ['placeholder', 'encrypt-placeholder', 'hexo-placeholder'],
  content_tag_names: ['content', 'encrypt-content'],
  default_text_placeholder: '***',
  blur_radius: 20,
  blur_quality: 60,
  cache_password: true,
  storage_type: 'sessionStorage', // 'sessionStorage' | 'localStorage'
  theme: 'auto', // 'auto' | 'light' | 'dark'
  floating_button: true,
  relock_button: true,
  replace_public_images: true,
  silent: false
};

function getConfig(hexo) {
  const userConfig = (hexo.config.encrypt_auto || hexo.config.encryption_auto || {});
  const config = Object.assign({}, DEFAULT_CONFIG, userConfig);

  // Normalize tag names to arrays if strings provided
  if (typeof config.tag_names === 'string') {
    config.tag_names = [config.tag_names];
  }
  if (typeof config.placeholder_tag_names === 'string') {
    config.placeholder_tag_names = [config.placeholder_tag_names];
  }
  if (typeof config.content_tag_names === 'string') {
    config.content_tag_names = [config.content_tag_names];
  }

  return config;
}

module.exports = {
  DEFAULT_CONFIG,
  getConfig
};
