'use strict';

const crypto = require('crypto');

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits
const DIGEST = 'sha256';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const SALT_LENGTH = 16;

/**
 * Encrypt plaintext using PBKDF2 + AES-256-GCM
 * @param {string} plaintext - The UTF-8 string to encrypt
 * @param {string} password - The encryption password
 * @returns {{ salt: string, iv: string, tag: string, cipher: string }} Base64-encoded fields
 */
function encrypt(plaintext, password) {
  if (!password || typeof password !== 'string') {
    throw new Error('[hexo-encryption-auto] Password must be a non-empty string.');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    cipher: encrypted.toString('base64')
  };
}

/**
 * Decrypt payload using PBKDF2 + AES-256-GCM (used for verification and testing)
 * @param {{ salt: string, iv: string, tag: string, cipher: string }} payload
 * @param {string} password
 * @returns {string} Decrypted UTF-8 plaintext
 */
function decrypt(payload, password) {
  if (!password || typeof password !== 'string') {
    throw new Error('[hexo-encryption-auto] Password must be a non-empty string.');
  }

  const salt = Buffer.from(payload.salt, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const cipherText = Buffer.from(payload.cipher, 'base64');

  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = {
  encrypt,
  decrypt,
  PBKDF2_ITERATIONS,
  KEY_LENGTH,
  DIGEST,
  ALGORITHM
};
