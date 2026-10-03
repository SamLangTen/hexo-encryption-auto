'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseAndEncrypt, generateDefaultPlaceholder, sanitizeHeadings } = require('../lib/parser');
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

test('Parser: sanitizeHeadings should sanitize heading id, title, and headerlink href', () => {
  const inputHtml = '<h2 id="朱恒成先生顺利通过博士论文答辩"><a href="#朱恒成先生顺利通过博士论文答辩" class="headerlink" title="朱恒成先生顺利通过博士论文答辩"></a><span class="h-enc h-inline" data-cipher="abc.def.ghi.jkl"><span class="h-mask-txt">Z.T.E.</span></span>先生顺利通过博士论文答辩</h2><p>请参考<a href="#朱恒成先生顺利通过博士论文答辩">答辩章节</a>。</p>';

  const result = sanitizeHeadings(inputHtml);

  // Original text should NOT exist anywhere in heading id, title, or href
  assert.ok(!result.includes('id="朱恒成'));
  assert.ok(!result.includes('title="朱恒成'));
  assert.ok(!result.includes('href="#朱恒成'));

  // Sanitized attributes
  assert.ok(result.includes('id="Z-T-E-先生顺利通过博士论文答辩"'));
  assert.ok(result.includes('href="#Z-T-E-先生顺利通过博士论文答辩"'));
  assert.ok(result.includes('title="Z.T.E.先生顺利通过博士论文答辩"'));
  // Paragraph jump link should also be updated
  assert.ok(result.includes('<p>请参考<a href="#Z-T-E-先生顺利通过博士论文答辩">答辩章节</a>。</p>'));
});

test('Parser: sanitizeHeadings should handle default placeholder *** with fallback id', () => {
  const inputHtml = '<h3 id="机密大纲"><a href="#机密大纲" class="headerlink" title="机密大纲"></a><span class="h-enc h-inline" data-cipher="abc"><span class="h-mask-txt hexo-encrypt-mask">***</span></span></h3>';

  const result = sanitizeHeadings(inputHtml);

  assert.ok(!result.includes('id="机密大纲"'));
  assert.ok(!result.includes('title="机密大纲"'));
  assert.ok(!result.includes('href="#机密大纲"'));
  assert.ok(result.includes('id="enc-heading-1"'));
  assert.ok(result.includes('href="#enc-heading-1"'));
  assert.ok(result.includes('title="***"'));
});

test('Parser: sanitizeHeadings should not alter unencrypted headings', () => {
  const inputHtml = '<h2 id="公开介绍"><a href="#公开介绍" class="headerlink" title="公开介绍"></a>公开介绍</h2>';
  const result = sanitizeHeadings(inputHtml);
  assert.strictEqual(result, inputHtml);
});

