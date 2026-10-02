'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseAndEncrypt, generateDefaultPlaceholder } = require('../lib/parser');
const { decrypt } = require('../lib/crypto');
const ImageProcessor = require('../lib/image-processor');

test('Parser: should replace text with *** when no placeholder specified', async () => {
  const config = {
    tag_names: ['enc', 'encrypt'],
    placeholder_tag_names: ['mask', 'placeholder'],
    content_tag_names: ['content'],
    default_text_placeholder: '***',
    password: 'test-password',
    silent: true
  };
  const imageProcessor = new ImageProcessor(null, config);

  const inputHtml = '<p>公开信息</p><enc>这是机密文字</enc><p>后续公开信息</p>';
  const result = await parseAndEncrypt(inputHtml, {}, config, imageProcessor);

  assert.ok(result.hasEncryptedContent);
  assert.ok(result.content.includes('h-enc'));
  assert.ok(result.content.includes('***'));
  // Original text should NOT be visible in plaintext
  assert.ok(!result.content.includes('这是机密文字'));

  // Extract compact cipher payload
  const cipherMatch = result.content.match(/data-cipher="([^"]+)"/);
  assert.ok(cipherMatch);
  const [salt, iv, tag, cipher] = cipherMatch[1].split('.');
  assert.ok(salt && iv && tag && cipher);

  const decrypted = decrypt({ salt, iv, tag, cipher }, 'test-password');
  assert.strictEqual(decrypted, '这是机密文字');
});

test('Parser: should use custom placeholder when specified via <mask / placeholder>', async () => {
  const config = {
    tag_names: ['enc', 'encrypt'],
    placeholder_tag_names: ['mask', 'placeholder'],
    content_tag_names: ['content'],
    default_text_placeholder: '***',
    silent: true
  };
  const imageProcessor = new ImageProcessor(null, config);

  const inputHtml = `<enc pass="my-pass" hint="提示数字">
    <mask>
      <span class="custom-cover">🔒 这是自定义替代内容</span>
    </mask>
    <p>这是真实机密内容</p>
  </enc>`;

  const result = await parseAndEncrypt(inputHtml, {}, config, imageProcessor);

  assert.ok(result.hasEncryptedContent);
  assert.ok(result.content.includes('这是自定义替代内容'));
  assert.ok(!result.content.includes('这是真实机密内容'));
  assert.ok(result.content.includes('data-hint="提示数字"'));

  const cipherMatch = result.content.match(/data-cipher="([^"]+)"/);
  assert.ok(cipherMatch);
  const [salt, iv, tag, cipher] = cipherMatch[1].split('.');

  const decrypted = decrypt({ salt, iv, tag, cipher }, 'my-pass');
  assert.strictEqual(decrypted, '<p>这是真实机密内容</p>');
});

test('Parser: should support mask attribute shorthand <enc mask="...">', async () => {
  const config = {
    tag_names: ['enc'],
    placeholder_tag_names: ['mask'],
    content_tag_names: ['content'],
    default_text_placeholder: '***',
    password: 'attr-pass',
    silent: true
  };
  const imageProcessor = new ImageProcessor(null, config);

  const inputHtml = '<enc mask="[已保密]">绝密内容</enc>';
  const result = await parseAndEncrypt(inputHtml, {}, config, imageProcessor);

  assert.ok(result.hasEncryptedContent);
  assert.ok(result.content.includes('[已保密]'));
  assert.ok(!result.content.includes('绝密内容'));

  const cipherMatch = result.content.match(/data-cipher="([^"]+)"/);
  const [salt, iv, tag, cipher] = cipherMatch[1].split('.');
  const decrypted = decrypt({ salt, iv, tag, cipher }, 'attr-pass');
  assert.strictEqual(decrypted, '绝密内容');
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
    tag_names: ['enc', 'encrypt'],
    placeholder_tag_names: ['mask', 'placeholder'],
    content_tag_names: ['content'],
    default_text_placeholder: '***',
    password: 'inline-pass',
    silent: true
  };
  const imageProcessor = new ImageProcessor(null, config);

  const inputHtml = '<span>我的电话是：<enc>13800138000</enc></span>';
  const result = await parseAndEncrypt(inputHtml, {}, config, imageProcessor);

  assert.ok(result.hasEncryptedContent);
  assert.ok(result.content.includes('h-inline'));
  assert.ok(!result.content.includes('<div')); // should not introduce div in inline context
  assert.ok(result.content.includes('***'));

  const cipherMatch = result.content.match(/data-cipher="([^"]+)"/);
  assert.ok(cipherMatch);
  const [salt, iv, tag, cipher] = cipherMatch[1].split('.');

  const decrypted = decrypt({ salt, iv, tag, cipher }, 'inline-pass');
  assert.strictEqual(decrypted, '13800138000');
});
