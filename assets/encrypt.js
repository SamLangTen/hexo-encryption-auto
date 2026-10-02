/**
 * hexo-encryption-auto Frontend Client
 * Pure Vanilla JS using native Web Crypto API (SubtleCrypto)
 */
(function () {
  'use strict';

  // Config options embedded or defaulted
  const config = window.__HEXO_ENCRYPT_CONFIG__ || {
    cachePassword: true,
    storageType: 'sessionStorage',
    floatingButton: true,
    relockButton: true
  };

  const STORAGE_KEY = 'hexo_encrypt_cache';

  // Convert Base64 string to Uint8Array
  function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Decrypt AES-256-GCM with PBKDF2 using Web Crypto API
   * @param {{ salt: string, iv: string, tag: string, cipher: string }} payload
   * @param {string} password
   * @returns {Promise<string>} Decrypted HTML
   */
  async function decryptData(payload, password) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API 不可用（请确保在 HTTPS 或 localhost 环境下访问）');
    }

    const salt = base64ToUint8Array(payload.salt);
    const iv = base64ToUint8Array(payload.iv);
    const tag = base64ToUint8Array(payload.tag);
    const cipher = base64ToUint8Array(payload.cipher);

    // SubtleCrypto expects cipher + tag combined
    const combined = new Uint8Array(cipher.length + tag.length);
    combined.set(cipher);
    combined.set(tag, cipher.length);

    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const derivedKey = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decryptedBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      derivedKey,
      combined
    );

    return new TextDecoder().decode(decryptedBuf);
  }

  // Storage Helpers
  function getCachedPasswords() {
    if (!config.cachePassword) return [];
    try {
      const storage = config.storageType === 'localStorage' ? window.localStorage : window.sessionStorage;
      const data = storage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCachedPassword(password) {
    if (!config.cachePassword || !password) return;
    try {
      const storage = config.storageType === 'localStorage' ? window.localStorage : window.sessionStorage;
      const passwords = getCachedPasswords();
      if (!passwords.includes(password)) {
        passwords.push(password);
        storage.setItem(STORAGE_KEY, JSON.stringify(passwords));
      }
    } catch (e) {}
  }

  function clearCachedPasswords() {
    try {
      const storage = config.storageType === 'localStorage' ? window.localStorage : window.sessionStorage;
      storage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  // Modal Dialog Controller
  class EncryptModal {
    constructor() {
      this.overlay = null;
      this.input = null;
      this.errorEl = null;
      this.hintEl = null;
      this.titleEl = null;
      this.targetContainer = null;
      this.initDom();
    }

    initDom() {
      const overlay = document.createElement('div');
      overlay.className = 'hexo-encrypt-modal-overlay';
      overlay.innerHTML = `
        <div class="hexo-encrypt-modal-card" role="dialog" aria-modal="true">
          <div class="hexo-encrypt-modal-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h3 class="hexo-encrypt-modal-title">访问受保护内容</h3>
          <div class="hexo-encrypt-modal-hint" style="display:none;"></div>
          <div class="hexo-encrypt-input-group">
            <input type="password" class="hexo-encrypt-input" placeholder="请输入密码" autocomplete="current-password" />
            <button type="button" class="hexo-encrypt-toggle-vis" title="显示/隐藏密码">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
          <div class="hexo-encrypt-error"></div>
          <div class="hexo-encrypt-btn-row">
            <button type="button" class="hexo-encrypt-btn hexo-encrypt-btn-secondary hexo-encrypt-btn-cancel">取消</button>
            <button type="button" class="hexo-encrypt-btn hexo-encrypt-btn-primary hexo-encrypt-btn-submit">解锁</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      this.overlay = overlay;
      this.input = overlay.querySelector('.hexo-encrypt-input');
      this.errorEl = overlay.querySelector('.hexo-encrypt-error');
      this.hintEl = overlay.querySelector('.hexo-encrypt-modal-hint');
      this.titleEl = overlay.querySelector('.hexo-encrypt-modal-title');

      const submitBtn = overlay.querySelector('.hexo-encrypt-btn-submit');
      const cancelBtn = overlay.querySelector('.hexo-encrypt-btn-cancel');
      const toggleVisBtn = overlay.querySelector('.hexo-encrypt-toggle-vis');

      submitBtn.addEventListener('click', () => this.submit());
      cancelBtn.addEventListener('click', () => this.close());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });

      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submit();
        } else if (e.key === 'Escape') {
          this.close();
        }
      });

      toggleVisBtn.addEventListener('click', () => {
        const isPass = this.input.type === 'password';
        this.input.type = isPass ? 'text' : 'password';
      });
    }

    open(container) {
      this.targetContainer = container;
      this.errorEl.textContent = '';
      this.input.value = '';
      this.input.type = 'password';

      const cipherEl = container ? container.querySelector('.hexo-encrypt-cipher') : null;
      const hint = cipherEl ? cipherEl.dataset.hint : '';
      const title = cipherEl ? cipherEl.dataset.title : '';

      if (title) {
        this.titleEl.textContent = title;
      } else {
        this.titleEl.textContent = '访问受保护内容';
      }

      if (hint) {
        this.hintEl.textContent = `提示：${hint}`;
        this.hintEl.style.display = 'block';
      } else {
        this.hintEl.style.display = 'none';
      }

      this.overlay.classList.add('hexo-encrypt-modal-active');
      setTimeout(() => this.input.focus(), 100);
    }

    close() {
      this.overlay.classList.remove('hexo-encrypt-modal-active');
      this.targetContainer = null;
    }

    async submit() {
      const password = this.input.value.trim();
      if (!password) {
        this.showError('请输入访问密码');
        return;
      }

      this.errorEl.textContent = '正在解密...';
      const success = await unlockWithPassword(password, this.targetContainer);

      if (success) {
        saveCachedPassword(password);
        this.close();
      } else {
        this.showError('密码错误，请重新输入');
      }
    }

    showError(msg) {
      this.errorEl.textContent = msg;
      const card = this.overlay.querySelector('.hexo-encrypt-modal-card');
      card.classList.remove('hexo-encrypt-shake');
      void card.offsetWidth; // Trigger reflow
      card.classList.add('hexo-encrypt-shake');
      this.input.focus();
    }
  }

  let modal = null;

  /**
   * Unlock a specific container or all matching containers
   * @param {string} password
   * @param {HTMLElement} [preferredContainer]
   * @returns {Promise<boolean>}
   */
  async function unlockWithPassword(password, preferredContainer) {
    let anySuccess = false;
    const containers = Array.from(document.querySelectorAll('.hexo-encrypt-container:not(.hexo-encrypt-unlocked)'));

    // Try target first if provided
    const sortedContainers = preferredContainer && containers.includes(preferredContainer)
      ? [preferredContainer, ...containers.filter(c => c !== preferredContainer)]
      : containers;

    for (const container of sortedContainers) {
      const cipherEl = container.querySelector('.hexo-encrypt-cipher');
      if (!cipherEl) continue;

      const payload = {
        salt: cipherEl.dataset.salt,
        iv: cipherEl.dataset.iv,
        tag: cipherEl.dataset.tag,
        cipher: cipherEl.dataset.cipher
      };

      try {
        const decryptedHtml = await decryptData(payload, password);
        applyDecryption(container, decryptedHtml);
        anySuccess = true;
      } catch (err) {
        // Wrong password for this block or decryption failed
      }
    }

    return anySuccess;
  }

  /**
   * Replace placeholder with decrypted content
   * @param {HTMLElement} container
   * @param {string} decryptedHtml
   */
  function applyDecryption(container, decryptedHtml) {
    const placeholderEl = container.querySelector('.hexo-encrypt-placeholder');
    if (!placeholderEl) return;

    // Cache original placeholder for re-locking
    if (!container._originalPlaceholderHtml) {
      container._originalPlaceholderHtml = placeholderEl.innerHTML;
    }

    placeholderEl.innerHTML = decryptedHtml;
    container.classList.add('hexo-encrypt-unlocked');

    // Add re-lock button if block container
    if (config.relockButton && container.classList.contains('hexo-encrypt-block')) {
      let relockBtn = container.querySelector('.hexo-encrypt-relock-btn');
      if (!relockBtn) {
        relockBtn = document.createElement('button');
        relockBtn.className = 'hexo-encrypt-relock-btn';
        relockBtn.title = '重新锁定此内容';
        relockBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>锁定</span>
        `;
        relockBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          relockContainer(container);
        });
        container.appendChild(relockBtn);
      }
    }

    // Dispatch custom event for plugins/themes (e.g. image zoom, mathjax)
    window.dispatchEvent(new CustomEvent('hexo-encrypt:unlocked', {
      detail: { container, decryptedHtml }
    }));
  }

  /**
   * Re-lock an unlocked container
   * @param {HTMLElement} container
   */
  function relockContainer(container) {
    if (!container._originalPlaceholderHtml) return;
    const placeholderEl = container.querySelector('.hexo-encrypt-placeholder');
    if (placeholderEl) {
      placeholderEl.innerHTML = container._originalPlaceholderHtml;
    }
    container.classList.remove('hexo-encrypt-unlocked');

    const relockBtn = container.querySelector('.hexo-encrypt-relock-btn');
    if (relockBtn) {
      relockBtn.remove();
    }

    clearCachedPasswords();

    window.dispatchEvent(new CustomEvent('hexo-encrypt:locked', {
      detail: { container }
    }));
  }

  /**
   * Initialize all encrypted elements on the page
   */
  function init() {
    const containers = document.querySelectorAll('.hexo-encrypt-container');
    if (!containers || containers.length === 0) return;

    if (!modal) {
      modal = new EncryptModal();
    }

    containers.forEach((container) => {
      container.addEventListener('click', (e) => {
        if (container.classList.contains('hexo-encrypt-unlocked')) return;
        modal.open(container);
      });
    });

    // Floating unlock button
    if (config.floatingButton && !document.querySelector('.hexo-encrypt-floating-btn')) {
      const floatBtn = document.createElement('button');
      floatBtn.className = 'hexo-encrypt-floating-btn';
      floatBtn.title = '解锁受保护内容';
      floatBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      `;
      floatBtn.addEventListener('click', () => {
        const firstLocked = document.querySelector('.hexo-encrypt-container:not(.hexo-encrypt-unlocked)');
        modal.open(firstLocked);
      });
      document.body.appendChild(floatBtn);
    }

    // Try auto-unlock from cached passwords
    const cached = getCachedPasswords();
    if (cached && cached.length > 0) {
      for (const pass of cached) {
        unlockWithPassword(pass);
      }
    }
  }

  // Run on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also support PJAX navigation (popular in Hexo themes like NexT, Butterfly)
  document.addEventListener('pjax:success', init);
  document.addEventListener('pjax:complete', init);
  document.addEventListener('turbo:load', init);
})();
