'use strict';

/**
 * Register Hexo tag plugins for encrypt and placeholder
 * Allows authors to write:
 * {% encrypt [password] [hint:xxx] %}
 *   {% placeholder %}
 *     替代内容
 *   {% endplaceholder %}
 *   机密内容
 * {% endencrypt %}
 */
function registerTagPlugin(hexo, config) {
  const tagNames = config.tag_names || ['encrypt'];
  const placeholderTagNames = config.placeholder_tag_names || ['placeholder'];

  // Register placeholder tag
  for (const pName of placeholderTagNames) {
    hexo.extend.tag.register(pName, (args, content) => {
      return `<${pName}>${content}</${pName}>`;
    }, { ends: true });
  }

  // Register encrypt tag
  for (const tName of tagNames) {
    hexo.extend.tag.register(tName, (args, content) => {
      const argStr = (args || []).join(' ');
      let password = '';
      let hint = '';

      // Check args: e.g. "my-password" or "password=123 hint=提示"
      for (const arg of args || []) {
        if (arg.startsWith('password=')) {
          password = arg.replace(/^password=/, '').replace(/^["']|["']$/g, '');
        } else if (arg.startsWith('hint=')) {
          hint = arg.replace(/^hint=/, '').replace(/^["']|["']$/g, '');
        } else if (!password && !arg.includes('=')) {
          password = arg.replace(/^["']|["']$/g, '');
        }
      }

      const attrs = [];
      if (password) attrs.push(`password="${escapeAttr(password)}"`);
      if (hint) attrs.push(`hint="${escapeAttr(hint)}"`);

      const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
      return `<${tName}${attrStr}>${content}</${tName}>`;
    }, { ends: true });
  }
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;');
}

module.exports = {
  registerTagPlugin
};
