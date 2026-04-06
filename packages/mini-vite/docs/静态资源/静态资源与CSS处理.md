# 静态资源与CSS处理原理解析

## 1. CSS 处理原理

在 `plugins/css.ts` 中实现了完整的 CSS 处理功能。

### 1.1 CSS 模块支持

CSS Modules 是一种 CSS 文件局部作用域的解决方案：

```typescript
// 实现 CSS 模块类名转换
function processCssModules(css: string, filename: string) {
  // 为类名添加哈希值确保唯一性
  // .button -> .button_abc123
  return transformedCss;
}
```

### 1.2 PostCSS 支持

集成 PostCSS 处理 CSS：

```typescript
// 使用 PostCSS 处理 CSS
async function processWithPostCSS(css: string, filename: string) {
  const result = await postcss([
    // 自动添加浏览器前缀
    autoprefixer(),
    // 其他 PostCSS 插件
  ]).process(css, {
    from: filename
  });
  
  return result.css;
}
```

### 1.3 CSS 导入分析

分析 CSS 文件中的 `@import` 语句：

```typescript
// 解析 @import 语句
function resolveCssImports(css: string, importer: string) {
  // 查找并解析 @import 语句
  // 将相对路径转换为绝对路径
  return resolvedCss;
}
```

### 1.4 热更新支持

实现 CSS 热更新，无需刷新页面：

```typescript
// CSS 热更新处理
function handleCssHotUpdate(update: Update) {
  // 查找现有的CSS链接和样式
  const links = document.querySelectorAll<HTMLLinkElement>(
    `link[rel="stylesheet"][href*="${update.path}"]`
  );
  
  // 更新现有的CSS链接/样式
  // ...
}
```

## 2. 静态资源处理原理

### 2.1 请求处理流程

静态资源处理主要在以下位置实现：

1. **transformMiddleware**：处理静态资源请求
2. **插件系统**：通过插件处理特定类型的资源

静态资源的处理流程：
1. 接收资源请求
2. 根据文件扩展名确定资源类型
3. 应用相应处理逻辑
4. 返回处理后的资源

### 2.2 资源类型处理

#### 2.2.1 图片资源

支持常见的图片格式：
- PNG
- JPG/JPEG
- GIF
- SVG
- WebP

```typescript
// 图片资源处理
function handleImageResource(filename: string) {
  // 返回适当的 Content-Type
  // 对于 SVG 可能需要特殊处理
  return {
    content: fileContent,
    mimeType: getMimeType(filename)
  };
}
```

#### 2.2.2 字体资源

支持字体文件：
- WOFF
- WOFF2
- TTF
- EOT
- OTF

```typescript
// 字体资源处理
function handleFontResource(filename: string) {
  // 设置适当的缓存头
  // 返回字体文件内容
  return {
    content: fileContent,
    headers: {
      'Cache-Control': 'max-age=31536000', // 1年缓存
      'Content-Type': getFontMimeType(filename)
    }
  };
}
```

#### 2.2.3 其他资源

对于未知类型的资源，直接返回原始内容：

```typescript
// 通用资源处理
function handleGenericResource(filename: string) {
  // 根据文件扩展名确定 MIME 类型
  // 返回原始文件内容
  return {
    content: fileContent,
    mimeType: getMimeType(filename) || 'application/octet-stream'
  };
}
```

## 3. 资源优化

### 3.1 压缩优化

```typescript
// 资源压缩
async function compressResource(content: Buffer, mimeType: string) {
  // 根据 MIME 类型选择压缩算法
  if (mimeType.startsWith('text/') || mimeType === 'application/javascript') {
    return gzipSync(content);
  }
  return content;
}
```

### 3.2 缓存策略

```typescript
// 缓存头设置
function setCacheHeaders(filename: string, mimeType: string) {
  const headers: Record<string, string> = {};
  
  // 不可变资源长期缓存
  if (isImmutableResource(filename)) {
    headers['Cache-Control'] = 'max-age=31536000, immutable';
  }
  // 可变资源短期缓存
  else {
    headers['Cache-Control'] = 'no-cache';
  }
  
  return headers;
}
```

## 4. 与 HMR 的集成

### 4.1 CSS 热更新

CSS 热更新实现在 `client/client.ts` 中：

```typescript
// 更新CSS
function updateCss(update: any) {
  const { path, timestamp } = update;
  
  // 查找现有的CSS链接和样式
  const links = document.querySelectorAll<HTMLLinkElement>(
    `link[rel="stylesheet"][href*="${path}"], style[data-vite-dev-id*="${path}"]`
  );
  
  if (links.length > 0) {
    // 更新现有的CSS链接/样式
    // ...
  }
}
```

### 4.2 静态资源热更新

对于其他静态资源的热更新：

```typescript
// 静态资源热更新处理
function handleStaticAssetHotUpdate(update: Update) {
  // 重新加载相关资源
  // 通知相关模块更新
}
```

## 5. 安全考虑

### 5.1 路径遍历防护

```typescript
// 防止路径遍历攻击
function sanitizeFilePath(filePath: string) {
  // 规范化路径
  const normalized = normalizePath(filePath);
  
  // 检查是否在项目根目录内
  if (!normalized.startsWith(rootPath)) {
    throw new Error('Access denied');
  }
  
  return normalized;
}
```

### 5.2 MIME 类型验证

```typescript
// MIME 类型验证
function validateMimeType(filename: string, content: Buffer) {
  const expectedMimeType = getMimeType(filename);
  const actualMimeType = detectMimeType(content);
  
  // 确保文件内容与扩展名匹配
  if (!isMimeTypeConsistent(expectedMimeType, actualMimeType)) {
    throw new Error('MIME type mismatch');
  }
  
  return expectedMimeType;
}
```

## 6. 性能优化

### 6.1 流式处理

对于大文件采用流式处理：

```typescript
// 流式处理大文件
async function* streamLargeFile(filename: string) {
  const stream = createReadStream(filename);
  for await (const chunk of stream) {
    yield chunk;
  }
}
```

### 6.2 内存缓存

```typescript
// 内存缓存机制
class ResourceCache {
  private cache = new Map<string, { content: Buffer; timestamp: number }>();
  
  get(key: string) {
    const item = this.cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) {
      return item.content;
    }
    return null;
  }
  
  set(key: string, content: Buffer) {
    this.cache.set(key, { content, timestamp: Date.now() });
  }
}
```

## 7. 错误处理

### 7.1 资源不存在

```typescript
// 处理资源不存在的情况
function handleResourceNotFound(filename: string) {
  return {
    status: 404,
    content: 'Resource not found',
    mimeType: 'text/plain'
  };
}
```

### 7.2 权限错误

```typescript
// 处理权限错误
function handlePermissionError(filename: string) {
  return {
    status: 403,
    content: 'Access denied',
    mimeType: 'text/plain'
  };
}
```

## 8. 与其他模块的交互

### 8.1 与插件系统的交互

静态资源处理通过插件系统实现：

```typescript
// 静态资源插件
const staticAssetPlugin: Plugin = {
  name: 'mini-vite:static-asset',
  async load(id) {
    if (isStaticAsset(id)) {
      return await processStaticAsset(id);
    }
  }
};
```

### 8.2 与开发服务器的交互

静态资源处理与开发服务器紧密集成：

```typescript
// 中间件处理静态资源
app.use((req, res, next) => {
  if (isStaticAssetRequest(req)) {
    handleStaticAssetRequest(req, res);
  } else {
    next();
  }
});
```