'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseAndEncrypt, generateDefaultPlaceholder } = require('../lib/parser');
const { decrypt } = require('../lib/crypto');
const ImageProcessor = require('../lib/image-processor');

test('Parser: should replace text with *** when no placeholder specified', async () => {
  const config = {
    tag_names: ['encrypt'],
    placeholder_tag_names: ['placeholder'],
    content_tag_names: ['content'],
    default_text_placeholder: '***',
    password: 'test-password',
    silent: true
  };
  const imageProcessor = new ImageProcessor(null, config);

  const inputHtml = '<p>公开信息</p><encrypt>这是机密文字</encrypt><p>后续公开信息</p>';
  const result = await parseAndEncrypt(inputHtml, {}, config, imageProcessor);

  assert.ok(result.hasEncryptedContent);
  assert.ok(result.content.includes('hexo-encrypt-container'));
  assert.ok(result.content.includes('***'));
  // Original text should NOT be visible in plaintext
  assert.ok(!result.content.includes('这是机密文字'));

  // Extract cipher payload from template
  const saltMatch = result.content.match(/data-salt="([^"]+)"/);
  const ivMatch = result.content.match(/data-iv="([^"]+)"/);
  const tagMatch = result.content.match(/data-tag="([^"]+)"/);
  const cipherMatch = result.content.match(/data-cipher="([^"]+)"/);

  assert.ok(saltMatch && ivMatch && tagMatch && cipherMatch);

  const decrypted = decrypt({
    salt: saltMatch[1],
    iv: ivMatch[1],
    tag: tagMatch[1],
    cipher: cipherMatch[1]
  }, 'test-password');

  assert.strictEqual(decrypted, '这是机密文字');
});

test('Parser: should use custom placeholder when specified via <placeholder>', async () => {
  const config = {
    tag_names: ['encrypt'],
    placeholder_tag_names: ['placeholder'],
    content_tag_names: ['content'],
    default_text_placeholder: '***',
    silent: true
  };
  const imageProcessor = new ImageProcessor(null, config);

  const inputHtml = `<encrypt password="my-pass">
    <placeholder>
      <span class="custom-cover">🔒 这是自定义替代内容</span>
    </placeholder>
    <content>
      <p>这是真实机密内容</p>
    </content>
  </encrypt>`;

  const result = await parseAndEncrypt(inputHtml, {}, config, imageProcessor);

  assert.ok(result.hasEncryptedContent);
  assert.ok(result.content.includes('这是自定义替代内容'));
  assert.ok(!result.content.includes('这是真实机密内容'));

  const saltMatch = result.content.match(/data-salt="([^"]+)"/);
  const ivMatch = result.content.match(/data-iv="([^"]+)"/);
  const tagMatch = result.content.match(/data-tag="([^"]+)"/);
  const cipherMatch = result.content.match(/data-cipher="([^"]+)"/);

  const decrypted = decrypt({
    salt: saltMatch[1],
    iv: ivMatch[1],
    tag: tagMatch[1],
    cipher: cipherMatch[1]
  }, 'my-pass');

  assert.strictEqual(decrypted, '<p>这是真实机密内容</p>');
});

test('Parser: generateDefaultPlaceholder should replace text with *** and keep image tags', () => {
  const html = '<p>机密段落 <b>粗体字</b></p><img src="data:image/jpeg;base64,blurred" class="hexo-encrypt-blurred-img">';
  const placeholder = generateDefaultPlaceholder(html, '***');

  assert.ok(placeholder.includes('***'));
  assert.ok(!placeholder.includes('机密段落'));
  assert.ok(!placeholder.includes('粗体字'));
  assert.ok(placeholder.includes('<img src="data:image/jpeg;base64,blurred" class="hexo-encrypt-blurred-img">'));
  assert.ok(placeholder.includes('<p>'));
  assert.ok(placeholder.includes('<b>'));
});

test('Parser: inline text should use inline span container', async () => {
  const config = {
    tag_names: ['encrypt'],
    placeholder_tag_names: ['placeholder'],
    content_tag_names: ['content'],
    default_text_placeholder: '***',
    password: 'inline-pass',
    silent: true
  };
  const imageProcessor = new ImageProcessor(null, config);

  const inputHtml = '<span>我的电话是：<encrypt>13800138000</encrypt></span>';
  const result = await parseAndEncrypt(inputHtml, {}, config, imageProcessor);

  assert.ok(result.hasEncryptedContent);
  assert.ok(result.content.includes('hexo-encrypt-inline'));
  assert.ok(!result.content.includes('<div')); // should not introduce div in inline context
  assert.ok(result.content.includes('***'));

  const saltMatch = result.content.match(/data-salt="([^"]+)"/);
  const ivMatch = result.content.match(/data-iv="([^"]+)"/);
  const tagMatch = result.content.match(/data-tag="([^"]+)"/);
  const cipherMatch = result.content.match(/data-cipher="([^"]+)"/);

  const decrypted = decrypt({
    salt: saltMatch[1],
    iv: ivMatch[1],
    tag: tagMatch[1],
    cipher: cipherMatch[1]
  }, 'inline-pass');

  assert.strictEqual(decrypted, '13800138000');
});

