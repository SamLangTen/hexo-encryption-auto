'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { encrypt, decrypt } = require('../lib/crypto');

test('Crypto: should encrypt and decrypt text accurately', () => {
  const password = 'my-super-secret-password-123';
  const secretText = 'Hello 世界！这是一段包含 emoji 🔒 和特殊字符 <>"/ 的机密信息。';

  const payload = encrypt(secretText, password);
  assert.ok(payload.salt);
  assert.ok(payload.iv);
  assert.ok(payload.tag);
  assert.ok(payload.cipher);

  const decrypted = decrypt(payload, password);
  assert.strictEqual(decrypted, secretText);
});

test('Crypto: should fail to decrypt with wrong password', () => {
  const payload = encrypt('Secret', 'correct-password');
  assert.throws(() => {
    decrypt(payload, 'wrong-password');
  });
});

test('Crypto: should decrypt with Web Crypto API (browser-compatible)', async () => {
  const password = 'browser-compatibility-test';
  const secretText = '<p>机密段落与图片</p><img src="data:image/png;base64,abc" />';

  const payload = encrypt(secretText, password);

  // Web Crypto API in Node 18+ (same as browser window.crypto.subtle)
  const subtle = globalThis.crypto.subtle;
  const passBuf = new TextEncoder().encode(password);
  const keyMaterial = await subtle.importKey('raw', passBuf, 'PBKDF2', false, ['deriveKey']);

  const saltBuf = Uint8Array.from(Buffer.from(payload.salt, 'base64'));
  const ivBuf = Uint8Array.from(Buffer.from(payload.iv, 'base64'));
  const tagBuf = Uint8Array.from(Buffer.from(payload.tag, 'base64'));
  const cipherBuf = Uint8Array.from(Buffer.from(payload.cipher, 'base64'));

  const combinedCipher = new Uint8Array(cipherBuf.length + tagBuf.length);
  combinedCipher.set(cipherBuf);
  combinedCipher.set(tagBuf, cipherBuf.length);

  const derivedKey = await subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decryptedBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf },
    derivedKey,
    combinedCipher
  );

  const decryptedText = new TextDecoder().decode(decryptedBuf);
  assert.strictEqual(decryptedText, secretText);
});
