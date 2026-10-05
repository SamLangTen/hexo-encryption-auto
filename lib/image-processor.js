'use strict';

const fs = require('fs');
const path = require('path');

let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  // sharp may fail in some restricted environments; fallback will be used
  sharp = null;
}

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'image/jpeg';
}

/**
 * Image Processor for Hexo Encryption
 */
class ImageProcessor {
  constructor(hexo, config) {
    this.hexo = hexo;
    this.config = config || {};
    this.blurRadius = this.config.blur_radius || 20;
    this.blurQuality = this.config.blur_quality || 60;
    // Map of public absolute file path -> blurred buffer to overwrite in after_generate
    this.encryptedFilesMap = new Map();
  }

  /**
   * Resolve an image src to a local Buffer or fetch remote Buffer
   * @param {string} src - The image src attribute
   * @param {object} [postData] - Post data object from Hexo
   * @returns {Promise<{ buffer: Buffer, mimeType: string, localFilePath?: string } | null>}
   */
  async resolveImage(src, postData) {
    if (!src) return null;

    // 1. Data URI
    if (src.startsWith('data:')) {
      const match = src.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return {
          buffer: Buffer.from(match[2], 'base64'),
          mimeType: match[1]
        };
      }
      return null;
    }

    // 2. Remote URL
    if (src.startsWith('http://') || src.startsWith('https://')) {
      try {
        const response = await fetch(src, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          const arrayBuf = await response.arrayBuffer();
          const contentType = response.headers.get('content-type') || 'image/jpeg';
          return {
            buffer: Buffer.from(arrayBuf),
            mimeType: contentType.split(';')[0]
          };
        }
      } catch (err) {
        if (!this.config.silent) {
          console.warn(`[hexo-encryption-auto] Failed to fetch remote image ${src}: ${err.message}`);
        }
      }
      return null;
    }

    // 3. Local filesystem paths
    const candidates = [];
    const cleanSrc = src.replace(/[?#].*$/, ''); // Strip query/hash
    const normalizedSrc = cleanSrc.replace(/^\//, '');

    // Hexo source_dir
    if (this.hexo && this.hexo.source_dir) {
      candidates.push(path.join(this.hexo.source_dir, normalizedSrc));
    }
    // Hexo base_dir / source
    if (this.hexo && this.hexo.base_dir) {
      candidates.push(path.join(this.hexo.base_dir, 'source', normalizedSrc));
      candidates.push(path.join(this.hexo.base_dir, 'public', normalizedSrc));
    }
    // Post asset folder
    if (postData && postData.full_source) {
      const postDir = path.dirname(postData.full_source);
      candidates.push(path.join(postDir, normalizedSrc));
      if (postData.slug) {
        candidates.push(path.join(postDir, postData.slug, normalizedSrc));
      }
    }
    // Process cwd fallback
    candidates.push(path.resolve(process.cwd(), normalizedSrc));
    candidates.push(path.resolve(process.cwd(), 'source', normalizedSrc));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        const buffer = fs.readFileSync(candidate);
        const mimeType = getMimeType(candidate);

        // Track for public sanitization
        if (this.hexo && this.hexo.public_dir) {
          const publicTarget = path.join(this.hexo.public_dir, normalizedSrc);
          this.recordEncryptedImage(publicTarget);
        }

        return {
          buffer,
          mimeType,
          localFilePath: candidate
        };
      }
    }

    return null;
  }

  recordEncryptedImage(publicTarget) {
    if (publicTarget) {
      this.encryptedFilesMap.set(publicTarget, null);
    }
  }

  /**
   * Generate Gaussian blurred version of image buffer
   * @param {Buffer} buffer - Original image buffer
   * @param {string} mimeType - MIME type
   * @returns {Promise<{ blurredBuffer: Buffer, dataUrl: string }>}
   */
  async blurImage(buffer, mimeType) {
    if (sharp && buffer) {
      try {
        let pipeline = sharp(buffer);
        const metadata = await pipeline.metadata().catch(() => null);

        // Resize down if excessively large to keep placeholder lightweight
        if (metadata && metadata.width && metadata.width > 800) {
          pipeline = pipeline.resize({ width: 800, withoutEnlargement: true });
        }

        // Apply Gaussian blur (sharp.blur supports sigma 0.3 to 1000)
        pipeline = pipeline.blur(this.blurRadius);

        // Convert to JPEG for placeholder for maximum compression and compatibility
        let blurredBuffer;
        if (mimeType === 'image/png' && metadata && metadata.hasAlpha) {
          blurredBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
          mimeType = 'image/png';
        } else {
          blurredBuffer = await pipeline.jpeg({ quality: this.blurQuality }).toBuffer();
          mimeType = 'image/jpeg';
        }

        const dataUrl = `data:${mimeType};base64,${blurredBuffer.toString('base64')}`;
        return { blurredBuffer, dataUrl };
      } catch (err) {
        if (!this.config.silent) {
          console.warn(`[hexo-encryption-auto] Sharp blur failed: ${err.message}. Using SVG fallback.`);
        }
      }
    }

    // Fallback: Generate SVG with Gaussian blur filter
    return this.generateSvgBlurFallback();
  }

  /**
   * Fallback SVG Gaussian blur placeholder
   */
  generateSvgBlurFallback() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <defs>
        <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="${this.blurRadius}" />
        </filter>
      </defs>
      <rect width="600" height="400" fill="#334155" filter="url(#blur)" />
      <g fill="#94a3b8" font-family="-apple-system,BlinkMacSystemFont,sans-serif" text-anchor="middle">
        <text x="300" y="190" font-size="36">🔒</text>
        <text x="300" y="240" font-size="16" letter-spacing="1">机密图片已加密保存</text>
      </g>
    </svg>`;

    const buffer = Buffer.from(svg, 'utf8');
    const dataUrl = `data:image/svg+xml;base64,${buffer.toString('base64')}`;
    return { blurredBuffer: buffer, dataUrl };
  }

  /**
   * Format blurred img tag with classes, loading=lazy, and clean attributes
   */
  formatBlurredImgTag(prefix, suffix, dataUrl) {
    let cleanSuffix = (suffix || '').replace(/\/+\s*$/, '').trimEnd();
    let attrs = `${prefix || ''} ${cleanSuffix}`.trim();

    const classRegex = /\bclass=(["'])(.*?)\1/i;
    if (classRegex.test(attrs)) {
      attrs = attrs.replace(classRegex, (m, quote, classes) => {
        const classList = classes.split(/\s+/).filter(Boolean);
        if (!classList.includes('hexo-encrypt-blurred-img')) classList.push('hexo-encrypt-blurred-img');
        return `class=${quote}${classList.join(' ')}${quote}`;
      });
    } else {
      attrs = `${attrs} class="hexo-encrypt-blurred-img"`.trim();
    }

    if (!/\bloading=/i.test(attrs)) {
      attrs = `${attrs} loading="lazy"`.trim();
    }

    return `<img src="${dataUrl}" ${attrs} />`;
  }

  /**
   * Format encrypted img tag with clean attributes and original data URL
   */
  formatEncryptedImgTag(prefix, suffix, dataUrl) {
    let cleanSuffix = (suffix || '').replace(/\/+\s*$/, '').trimEnd();
    let attrs = `${prefix || ''} ${cleanSuffix}`.trim();
    if (attrs.length > 0) {
      return `<img src="${dataUrl}" ${attrs} />`;
    }
    return `<img src="${dataUrl}" />`;
  }

  /**
   * Process all images in an HTML fragment
   * Replaces unencrypted original image references with data URLs for encryption,
   * and creates corresponding blurred images for placeholders.
   *
   * @param {string} html - HTML fragment containing images
   * @param {object} [postData] - Post data object
   * @returns {Promise<{ encryptedHtml: string, blurredHtml: string }>}
   */
  async processImages(html, postData) {
    if (!html) {
      return { encryptedHtml: html, blurredHtml: html };
    }

    const imgRegex = /<img\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*?)>/gi;
    let encryptedHtml = html;
    let blurredHtml = html;

    // Collect all image matches
    const matches = [];
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      matches.push({
        fullTag: match[0],
        prefix: match[1],
        src: match[2],
        suffix: match[3],
        index: match.index
      });
    }

    for (const item of matches) {
      try {
        const resolved = await this.resolveImage(item.src, postData);
        if (resolved) {
          // 1. Generate Gaussian blurred version
          const { blurredBuffer, dataUrl: blurredDataUrl } = await this.blurImage(resolved.buffer, resolved.mimeType);

          const cleanSrc = item.src.replace(/[?#].*$/, '');
          const normalizedSrc = cleanSrc.replace(/^\/+/, '');

          // If we have a local path that will be in public/, cache blurredBuffer to overwrite it
          if (this.hexo && this.hexo.public_dir) {
            const publicTarget = path.join(this.hexo.public_dir, normalizedSrc);
            this.encryptedFilesMap.set(publicTarget, blurredBuffer);
          }

          // Overwrite Hexo route so that hexo-server and hexo generate write/serve the blurred image
          if (this.hexo && this.hexo.route && this.config.replace_public_images) {
            this.hexo.route.set(normalizedSrc, blurredBuffer);
          }

          // 2. In encrypted content: convert original image to inline base64 data URL
          // so the original image binary is encrypted inside the ciphertext payload
          const originalDataUrl = `data:${resolved.mimeType};base64,${resolved.buffer.toString('base64')}`;
          const encryptedImgTag = this.formatEncryptedImgTag(item.prefix, item.suffix, originalDataUrl);
          encryptedHtml = encryptedHtml.replace(item.fullTag, encryptedImgTag);

          // 3. In blurred placeholder content: use blurred data URL
          const blurredImgTag = this.formatBlurredImgTag(item.prefix, item.suffix, blurredDataUrl);
          blurredHtml = blurredHtml.replace(item.fullTag, blurredImgTag);
        } else {
          // If image cannot be resolved (e.g. broken path), mark placeholder with fallback
          const fallback = this.generateSvgBlurFallback();
          const fallbackImgTag = this.formatBlurredImgTag(item.prefix, item.suffix, fallback.dataUrl);
          blurredHtml = blurredHtml.replace(item.fullTag, fallbackImgTag);
        }
      } catch (err) {
        if (!this.config.silent) {
          console.warn(`[hexo-encryption-auto] Error processing image ${item.src}: ${err.message}`);
        }
      }
    }

    return { encryptedHtml, blurredHtml };
  }

  /**
   * Sanitize public directory after Hexo generation
   * Replaces any plain original image in public/ with its blurred version
   */
  sanitizePublicDirectory() {
    if (!this.config.replace_public_images) return;

    for (const [targetPath, blurredBuffer] of this.encryptedFilesMap.entries()) {
      try {
        if (fs.existsSync(targetPath)) {
          if (blurredBuffer) {
            fs.writeFileSync(targetPath, blurredBuffer);
          } else {
            // If no specific buffer, write fallback SVG or remove
            const fallback = this.generateSvgBlurFallback();
            fs.writeFileSync(targetPath, fallback.blurredBuffer);
          }
          if (!this.config.silent) {
            console.log(`[hexo-encryption-auto] Sanitized public image: ${targetPath}`);
          }
        }
      } catch (err) {
        if (!this.config.silent) {
          console.warn(`[hexo-encryption-auto] Failed to sanitize public image ${targetPath}: ${err.message}`);
        }
      }
    }
  }
}

module.exports = ImageProcessor;
