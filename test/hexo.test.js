'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const Hexo = require('hexo');
const plugin = require('../index');
const { decrypt } = require('../lib/crypto');

test('Hexo Integration: full post render, encryption, and HTML injection', async () => {
  const baseDir = path.join(__dirname, 'mock-site');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  // Create mock source dir and image
  const sourceDir = path.join(baseDir, 'source');
  const imgDir = path.join(sourceDir, 'images');
  fs.mkdirSync(imgDir, { recursive: true });

  const sharp = require('sharp');
  const sampleBuf = await sharp({
    create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } }
  }).png().toBuffer();

  const imgPath = path.join(imgDir, 'secret-photo.png');
  fs.writeFileSync(imgPath, sampleBuf);

  const hexo = new Hexo(baseDir, { silent: true });
  await hexo.init();
  await hexo.loadPlugin(require.resolve('hexo-renderer-marked'));

  // Load our plugin
  plugin(hexo);

  try {
    // 1. Test Post with default placeholder (text -> ***, image -> blurred)
    const postData = {
      title: 'Secret Post',
      password: 'post-pass-123',
      content: [
        '公开导言',
        '',
        '<enc>',
        '机密文本内容：用户密码是 88888888',
        '<img src="/images/secret-photo.png" alt="私密照片" />',
        '</enc>',
        '',
        '公开结尾'
      ].join('\n')
    };

    // Run post_render filter
    const rendered = await hexo.post.render(null, postData);

    assert.ok(rendered.content.includes('公开导言'));
    assert.ok(rendered.content.includes('公开结尾'));
    assert.ok(rendered.content.includes('h-enc'));
    assert.ok(rendered.content.includes('***'));

    // Original text should NOT exist anywhere in rendered content
    assert.ok(!rendered.content.includes('88888888'));

    // Blurred image should be in placeholder
    assert.ok(rendered.content.includes('class="hexo-encrypt-blurred-img"'));
    assert.ok(rendered.content.includes('alt="私密照片"'));

    // Extract compact cipher attribute and decrypt
    const cipherMatch = rendered.content.match(/data-cipher="([^"]+)"/);
    assert.ok(cipherMatch);
    const [salt, iv, tag, cipher] = cipherMatch[1].split('.');
    assert.ok(salt && iv && tag && cipher);

    const decrypted = decrypt({ salt, iv, tag, cipher }, 'post-pass-123');
    assert.ok(decrypted.includes('88888888'));
    assert.ok(decrypted.includes('data:image/png;base64,')); // original image converted to data URI

    // 2. Test after_render:html injector
    const fullHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body>${rendered.content}</body></html>`;
    const finalHtml = await hexo.extend.filter.exec('_after_html_render', fullHtml, { context: hexo, path: 'post/index.html' });

    assert.ok(finalHtml.includes('id="hexo-encrypt-style"'));
    assert.ok(finalHtml.includes('id="hexo-encrypt-script"'));
    assert.ok(finalHtml.includes('window.__HEXO_ENCRYPT_CONFIG__'));
  } finally {
    // Cleanup mock site
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});

test('Hexo Integration: custom <mask / placeholder> tag', async () => {
  const hexo = new Hexo(__dirname, { silent: true });
  await hexo.init();
  await hexo.loadPlugin(require.resolve('hexo-renderer-marked'));
  plugin(hexo);

  const postData = {
    title: 'Custom Placeholder Post',
    content: [
      '<enc pass="block-pass" hint="提示：四位数字">',
      '<mask>',
      '<span>🔒 [此处内容已隐藏，请点击解锁]</span>',
      '</mask>',
      '<p>真实的私密文字：Alpha-Bravo-Charlie</p>',
      '</enc>'
    ].join('\n')
  };

  const rendered = await hexo.post.render(null, postData);

  assert.ok(rendered.content.includes('[此处内容已隐藏，请点击解锁]'));
  assert.ok(!rendered.content.includes('Alpha-Bravo-Charlie'));
  assert.ok(rendered.content.includes('data-hint="提示：四位数字"'));

  const cipherMatch = rendered.content.match(/data-cipher="([^"]+)"/);
  assert.ok(cipherMatch);
  const [salt, iv, tag, cipher] = cipherMatch[1].split('.');

  const decrypted = decrypt({ salt, iv, tag, cipher }, 'block-pass');
  assert.ok(decrypted.includes('Alpha-Bravo-Charlie'));
});

test('Hexo Integration: tag plugin syntax {% encrypt %} and {% placeholder %}', async () => {
  const hexo = new Hexo(__dirname, { silent: true });
  await hexo.init();
  await hexo.loadPlugin(require.resolve('hexo-renderer-marked'));
  plugin(hexo);

  const postData = {
    title: 'Tag Plugin Post',
    content: [
      '{% encrypt password="tag-secret-pass" %}',
      '{% placeholder %}',
      '<span>这是标签插件替代内容</span>',
      '{% endplaceholder %}',
      '<p>这是标签插件加密的真实机密内容</p>',
      '{% endencrypt %}'
    ].join('\n')
  };

  const rendered = await hexo.post.render(null, postData);

  assert.ok(rendered.content.includes('这是标签插件替代内容'));
  assert.ok(!rendered.content.includes('这是标签插件加密的真实机密内容'));

  const cipherMatch = rendered.content.match(/data-cipher="([^"]+)"/);
  assert.ok(cipherMatch);
  const [salt, iv, tag, cipher] = cipherMatch[1].split('.');

  const decrypted = decrypt({ salt, iv, tag, cipher }, 'tag-secret-pass');
  assert.ok(decrypted.includes('这是标签插件加密的真实机密内容'));
});
