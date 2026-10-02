# hexo-encryption-auto

一款为 Hexo 静态博客打造的**页面局部内容与图片构建时加密插件**。

支持在 Hexo 构建（`hexo generate`）期间，对指定页面中的特定文本和图片进行高强度加密保存。支持通过精简 HTML 标签指定加密后显示的替代字符和替代图片；若未指定替代内容，插件将自动把文字替换为 `***`，并将图片替换为**构建时生成的像素级高斯模糊图片**。

访客访问博客时，通过纯前端原生 Web Crypto API 输入密码解锁，即可解密并无缝替换回原始文本和高清图片，无需任何后端服务器支持。

---

## ✨ 核心特性

- 🏷️ **极简便携的标签书写**：
  - 极短加密标签：`<enc>`（3 个字母，无需输入冗长单词，亦兼容 `<encrypt>`）。
  - 极短替代标签：`<mask`（4 个字母，亦兼容 `<placeholder>` / `<alt>`）。
  - 极短属性简写：支持 `<enc pass="123" mask="***">` 纯单行内联书写！
- ✂️ **超轻量输出 HTML**：
  - 构建生成的 DOM 极其精简，采用紧凑的 `data-cipher="salt.iv.tag.cipher"` 单字段密文包。
  - 彻底去除每个加密块重复内联的冗余 SVG 图标，改用纯 CSS 伪元素优雅渲染，DOM 节点减少 70% 以上。
- 🔒 **高强度构建时加密**：采用行业标准 **PBKDF2（100,000次迭代 SHA-256）+ AES-256-GCM** 算法，构建静态文件时直接加密，页面源码中无任何原始明文。
- 🖼️ **图片安全加密与真实高斯模糊**：
  - 原始图片数据被加密封装于密文中，不以明文形式暴露在生成的静态站点中。
  - 未指定替代图片时，构建期通过 `sharp` 自动生成真正的**像素级高斯模糊图片**（非单纯前端 CSS 滤镜，无法通过审查元素恢复）。
  - 自动拦截并净化 Hexo `public/` 目录中的同名原始图片，彻底防止通过直链 URL 绕过密码下载原图。
- 🔑 **灵活的多级密码控制**：
  - 标签级独立密码：`<enc pass="xxx" hint="提示">`（同一篇文章不同段落可设置不同密码）。
  - 文章级密码：在 Markdown Front-matter 中配置 `password: xxx`。
  - 全局默认密码：在 Hexo `_config.yml` 中配置全局默认密码。
- ⚡ **纯前端原生解密**：
  - 基于现代浏览器原生硬件加速的 `window.crypto.subtle`（Web Crypto API），无需引入庞大第三方 JS 库。
  - 支持 `sessionStorage` / `localStorage` 记住密码，同一页面或会话内一次输入，自动解锁所有同密码区域。
  - 解锁后支持“重新锁定”（Re-lock）功能，保护用户隐私。
  - 自动适配暗黑模式（Dark Mode）与移动端响应式布局。
  - 零侵入性：只在包含加密块的页面动态注入样式与脚本，普通公开文章不受任何体积影响。

---

## 📦 安装

在你的 Hexo 博客根目录下执行：

```bash
npm install hexo-encryption-auto
```

> **环境要求**：Node.js >= 18.0.0。插件依赖 `sharp` 库进行高性能图像模糊处理，通常会自动下载对应操作系统的预编译二进制文件。

---

## 🚀 快速上手

### 1. 基础用法：极简标签（文本变 `***`，图片变高斯模糊）

直接使用 3 字母的 `<enc>` 标签包裹敏感内容：

```markdown
---
title: 我的私密日记
password: mysecretpassword123
---

这是一段公开日记内容。

<enc>
这里是敏感内容：银行卡密码是 888888，手机号是 13800138000。
<img src="/images/idcard.png" alt="身份证正面" />
后续敏感备注信息。
</enc>

这是一段公开结语。
```

**效果：**
- 文字自动显示为 `***` 遮罩。
- `idcard.png` 自动生成并显示为高斯模糊图片。
- 访客点击遮罩区域或锁形图标，弹出密码输入框，输入密码即可瞬间恢复高清原图与真实文字！

---

### 2. 使用 `<mask` 指定自定义替代文字与替代图片

在 `<enc>` 内部加入 4 字母的 `<mask` 标签，即可自定义加密后展示给读者的占位提示、替代图片或引导文字：

```markdown
<enc pass="vip-password" hint="密码是博主微信号">
  <mask>
    <div style="text-align: center; padding: 20px;">
      <img src="/images/locked-cover.jpg" alt="封面预览" />
      <p>🔒 <strong>此处为独家会员内容</strong>，请输入密码解锁查看高清大图与技术方案</p>
    </div>
  </mask>

  <h3>核心架构方案详解</h3>
  <p>真实机密数据与核心算法说明...</p>
  <img src="/images/architecture-full.png" alt="高清架构设计图" />
</enc>
```

**效果：**
- 未解锁时，页面只展示 `<mask>` 内的内容（自定义封面图与会员提示）。
- 解锁后，自定义占位内容被无缝替换为真实的技术方案与高清架构图。

---

### 3. 属性简写：一行搞定（无需关闭 mask 标签）

如果你只想给一段文字指定简短的替代字，可以直接使用 `mask` 属性：

```markdown
我的内网服务器 IP 为：<enc pass="123" mask="[内网保密地址]">192.168.1.100</enc>。
```

或者仅使用默认 `***` 遮罩：

```markdown
我的手机号是：<enc>13800138000</enc>。
```

---

### 4. Hexo Tag 标签插件写法（可选）

除了标准的 HTML 标签外，插件也原生支持 Hexo 标签插件语法：

```markdown
{% encrypt password="tagpass" hint="生日月份" %}
  {% placeholder %}
    <span>【VIP专属内容已锁定】</span>
  {% endplaceholder %}
  这里是加密的内容，包含图片：
  ![私密相册](/images/private.jpg)
{% endencrypt %}
```

---

## 📐 生成 HTML 前后对比

#### 优化前（冗长且带有内联 SVG）
```html
<div class="hexo-encrypt-container hexo-encrypt-block" id="enc-123" data-encrypt-id="enc-123">
  <div class="hexo-encrypt-placeholder" title="点击输入密码解锁">
    ***
    <div class="hexo-encrypt-lock-overlay">
      <span class="hexo-encrypt-lock-icon">
        <svg viewBox="0 0 24 24" width="16" height="16">...</svg>
      </span>
      <span class="hexo-encrypt-lock-text">点击输入密码解锁</span>
    </div>
  </div>
  <template class="hexo-encrypt-cipher" data-salt="..." data-iv="..." data-tag="..." data-cipher="...">
  </template>
</div>
```

#### 优化后（极致精简，体积缩减 70%+）
```html
<div class="h-enc h-block" data-cipher="salt.iv.tag.cipher" data-hint="hint">
  <div class="h-mask">***</div>
</div>
```
行内文本更是仅有一行：
```html
<span class="h-enc h-inline" data-cipher="salt.iv.tag.cipher">***</span>
```
> 图标及交互提示已交由 CSS `::after` 纯样式高效渲染，无任何重复 DOM 开销。

---

## ⚙️ 配置说明

在 Hexo 站点的根目录配置文件 `_config.yml` 中添加配置项（可选，均有开箱即用的默认值）：

```yaml
encrypt_auto:
  enable: true                     # 是否启用插件
  password: ""                     # 全局默认解密密码（当标签与 Front-matter 均未指定时生效）
  default_text_placeholder: "***"  # 未指定 placeholder 时的默认文字替代符号
  blur_radius: 20                  # 图片高斯模糊半径（sigma，数值越大越模糊，建议 15-30）
  blur_quality: 60                 # 模糊图片的压缩质量（1-100，默认 60，体积轻量且模糊均匀）
  cache_password: true             # 是否在浏览器中记住密码（解锁后刷新无需重复输入）
  storage_type: "sessionStorage"   # 密码缓存方式："sessionStorage"（关闭标签页失效）或 "localStorage"
  floating_button: true            # 当页面存在加密区域时，是否在页面右下角显示浮动解锁小图标
  relock_button: true              # 解密后是否显示“重新锁定”小按钮
  replace_public_images: true      # 是否用模糊图替换 public/ 目录下的原图文件，杜绝直链泄露
```

---

## 🔐 密码优先级机制

插件支持颗粒度细致的密码控制体系，优先级从高到低依次为：

1. **标签级属性**：`<enc pass="特定密码" hint="密码提示">`（支持 `pass` 或 `password`）
2. **文章 Front-matter**：
   ```yaml
   ---
   title: 文章标题
   password: 本文统一密码
   hint: 提示信息
   ---
   ```
3. **全局配置**：`_config.yml` 中的 `encrypt_auto.password`

---

## 🛡️ 安全原理与深度防护设计

1. **真正的前端加密（不是单纯隐藏 CSS）**：
   大部分简单插件只是给 HTML 加上 `display: none` 或 CSS `filter: blur(...)`，任何访客只要按 F12 打开开发者工具就能直接看见源码中的机密文字与原图 URL。
   **本插件在 Hexo 构建阶段彻底移除原始 HTML**，将原始文本与原图数据通过 AES-256-GCM 加密为紧凑密文字符串。页面源码中只有密文和模糊图，无法通过开发者工具窥探。
2. **防静态资源直链嗅探**：
   Hexo 默认会将 `source/images/` 复制到 `public/images/`。如果仅加密了 HTML，访客依然可以通过猜解或浏览器网络嗅探直接访问原图文件。
   本插件在构建完成时（`after_generate`），会自动将 `public/` 目录中的加密对应文件替换为高斯模糊图，确保整个静态站点没有任何原始明文图片暴露。
3. **认证加密（Authenticated Encryption）**：
   AES-GCM 自带认证标签（Auth Tag）。若访客输入错误密码，解密在前端会立即产生鉴权失败（OperationError），绝不会产生乱码或伪解密现象。

---

## 🖥️ 浏览器兼容性

- Chrome / Chromium >= 60
- Edge >= 79
- Firefox >= 55
- Safari >= 11 (iOS & macOS)
- 各大国产浏览器（360、QQ、微信内置浏览器等近代版本）

> 💡 **提示**：Web Crypto API 规范要求页面运行在安全上下文（HTTPS 或 `http://localhost`）。发布到生产环境（如 GitHub Pages、Cloudflare Pages、Vercel、Netlify 或自有服务器）时，请确保开启 HTTPS。

---

## 📄 开源许可证

[MIT License](LICENSE)
