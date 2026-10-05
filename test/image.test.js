'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ImageProcessor = require('../lib/image-processor');

test('ImageProcessor: should blur an image buffer and return data URL', async () => {
  const processor = new ImageProcessor(null, { blur_radius: 15, silent: true });
  // Create a minimal 10x10 PNG buffer
  const sharp = require('sharp');
  const buffer = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 100, b: 50 } }
  }).png().toBuffer();

  const { blurredBuffer, dataUrl } = await processor.blurImage(buffer, 'image/png');
  assert.ok(Buffer.isBuffer(blurredBuffer));
  assert.ok(dataUrl.startsWith('data:image/'));
});

test('ImageProcessor: should generate SVG fallback blur', () => {
  const processor = new ImageProcessor(null, { blur_radius: 20, silent: true });
  const fallback = processor.generateSvgBlurFallback();
  assert.ok(fallback.blurredBuffer.toString('utf8').includes('feGaussianBlur'));
  assert.ok(fallback.dataUrl.startsWith('data:image/svg+xml;base64,'));
});

test('ImageProcessor: processImages should embed data URL for original and blurred for placeholder', async () => {
  const sharp = require('sharp');
  const sampleBuf = await sharp({
    create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } }
  }).png().toBuffer();

  const tmpImgPath = path.join(__dirname, 'temp-test-img.png');
  fs.writeFileSync(tmpImgPath, sampleBuf);

  try {
    const hexoMock = {
      source_dir: __dirname,
      base_dir: path.dirname(__dirname),
      public_dir: path.join(__dirname, 'public')
    };

    const processor = new ImageProcessor(hexoMock, { blur_radius: 10, silent: true });
    const html = `<p>Test image: <img src="temp-test-img.png" alt="Test Pic"></p>`;
    const { encryptedHtml, blurredHtml } = await processor.processImages(html);

    // encryptedHtml should contain original image data URL
    assert.ok(encryptedHtml.includes('src="data:image/png;base64,'));
    assert.ok(encryptedHtml.includes('alt="Test Pic"'));

    // blurredHtml should contain blurred image data URL and class
    assert.ok(blurredHtml.includes('class="hexo-encrypt-blurred-img"'));
    assert.ok(blurredHtml.includes('src="data:image/'));
  } finally {
    if (fs.existsSync(tmpImgPath)) fs.unlinkSync(tmpImgPath);
  }
});

test('ImageProcessor: sanitizePublicDirectory should overwrite public unencrypted images with blurred buffer', async () => {
  const publicDir = path.join(__dirname, 'mock_public');
  const imgDir = path.join(publicDir, 'images');
  fs.mkdirSync(imgDir, { recursive: true });

  const targetImg = path.join(imgDir, 'test-secret.png');
  const originalSecretText = 'ORIGINAL UNENCRYPTED IMAGE CONTENT';
  fs.writeFileSync(targetImg, originalSecretText);

  try {
    const hexoMock = {
      source_dir: __dirname,
      base_dir: __dirname,
      public_dir: publicDir
    };

    const processor = new ImageProcessor(hexoMock, { replace_public_images: true, silent: true });

    // Mock recorded encrypted image
    const sharp = require('sharp');
    const blurredBuffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 255, b: 0 } }
    }).png().toBuffer();

    processor.encryptedFilesMap.set(targetImg, blurredBuffer);
    processor.sanitizePublicDirectory();

    const resultBuffer = fs.readFileSync(targetImg);
    assert.notStrictEqual(resultBuffer.toString(), originalSecretText);
    assert.deepStrictEqual(resultBuffer, blurredBuffer);
  } finally {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('ImageProcessor: should clean self-closing slashes and update hexo.route', async () => {
  const sharp = require('sharp');
  const sampleBuf = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 100, g: 100, b: 100 } }
  }).png().toBuffer();

  const tmpImgPath = path.join(__dirname, 'clean-tag-test.png');
  fs.writeFileSync(tmpImgPath, sampleBuf);

  const routes = new Map();
  const hexoMock = {
    source_dir: __dirname,
    base_dir: __dirname,
    public_dir: path.join(__dirname, 'mock_public'),
    route: {
      set(key, val) {
        routes.set(key, val);
      },
      get(key) {
        return routes.get(key);
      }
    }
  };

  try {
    const processor = new ImageProcessor(hexoMock, { replace_public_images: true, silent: true });
    const html = `<img src="clean-tag-test.png" alt="Self Closing Image" />`;
    const { blurredHtml } = await processor.processImages(html);

    // Must NOT contain malformed rogue slash before class: '/ class='
    assert.ok(!blurredHtml.includes('/ class='));
    assert.ok(blurredHtml.includes('class="hexo-encrypt-blurred-img"'));
    assert.ok(blurredHtml.includes('loading="lazy"'));

    // Route must be updated with blurred buffer
    assert.ok(routes.has('clean-tag-test.png'));
    assert.ok(Buffer.isBuffer(routes.get('clean-tag-test.png')));
  } finally {
    if (fs.existsSync(tmpImgPath)) fs.unlinkSync(tmpImgPath);
  }
});

