# 梳理 mini-vite 请求链路
_Exported on 2026/2/13 at GMT+8 15:17:42 from Cursor (2.4.31)_

---

**Cursor**


根据对 mini-vite 源码的阅读，整理出以下请求链路与实现说明。

---

# Mini-Vite 开发服务器请求链路分析

## 一、入口与启动流程

**入口：** `bin/mini-vite.js` → `cli.ts` → `startDevServer()`（`server/index.ts`）

**启动顺序：**
1. 创建 `connect` 应用
2. 注册插件：`resolve` → `esbuild` → `commonjs` → `importAnalysis` → `css` → `hmr`
3. 创建 `pluginContainer`
4. 注册中间件：`indexHtmlMiddleware` → `sirv(public)` → `transformMiddleware`
5. 执行各插件的 `configureServer`
6. 创建 HTTP 服务器，并创建 HMR WebSocket 服务
7. 监听端口后执行 `optimizeDeps` 预构建

---

## 二、按时间顺序的请求链路

### 1. 首次访问 `http://localhost:3001/`

| 步骤 | 模块/函数 | 说明 |
|------|-----------|------|
| 1 | `server/index.ts` | HTTP 请求进入 `connect` 应用 |
| 2 | `middlewares/indexHtml.ts` → `indexHtmlMiddleware` | 匹配 `req.url === '/'` |
| 3 | `fse.readFile(indexHtmlPath)` | 读取 `root/index.html` |
| 4 | `injectHMRClient(html)` | 在 `</head>` 前注入 `<script type="module">import "/node_modules/.mini-vite/client.js";</script>` |
| 5 | `plugin.transformIndexHtml` | 遍历插件执行 `transformIndexHtml`（当前无实现） |
| 6 | `res.end(html)` | 返回 HTML，`Content-Type: text/html` |

### 2. 浏览器解析 HTML，请求 `/node_modules/.mini-vite/client.js`

| 步骤 | 模块/函数 | 说明 |
|------|-----------|------|
| 1 | `transformMiddleware` | `isJsRequest` 为 true，进入转换逻辑 |
| 2 | `transformRequest.ts` → `transformRequest(url, serverContext)` | 开始转换 |
| 3 | `pluginContainer.resolveId('/node_modules/.mini-vite/client.js')` | 解析虚拟模块 |
| 4 | `plugins/hmr.ts` → `resolveId` | 返回 `{ id: '/node_modules/.mini-vite/client.js' }` |
| 5 | `pluginContainer.load(id)` | 加载模块内容 |
| 6 | `plugins/hmr.ts` → `load` | 返回预编译的 `clientCode`（来自 `client/client.ts`） |
| 7 | `pluginContainer.transform(code, id)` | 各插件 transform（hmr 插件无 transform） |
| 8 | `transformCache.set` | 写入 transform 缓存（虚拟模块无 mtime，可能不缓存） |
| 9 | `res.end(result.code)` | 返回 JS，`Content-Type: application/javascript` |

### 3. 浏览器请求入口 JS（如 `/src/main.ts`）

| 步骤 | 模块/函数 | 说明 |
|------|-----------|------|
| 1 | `transformMiddleware` | `isJsRequest('/src/main.ts')` 为 true |
| 2 | `transformRequest` | 进入转换流程 |
| 3 | `pluginContainer.resolveId('/src/main.ts')` | 解析路径 |
| 4 | `plugins/resolve.ts` → `resolveId` | 绝对路径：`path.join(root, url)`，相对路径：`resolve.sync`，返回 `{ id: 绝对路径 }` |
| 5 | `getFileMtimeMs(id)` | 获取文件 mtime，用于缓存校验 |
| 6 | `transformCache.get(cacheKey)` | 命中且 mtime 未变则直接返回 |
| 7 | `pluginContainer.load(id)` | 加载源码 |
| 8 | `plugins/esbuild.ts` → `load` | `isJsRequest` 时 `fse.readFile` 读取 |
| 9 | `pluginContainer.transform(code, id)` | 依次执行各插件 transform |

**Transform 插件链：**

| 顺序 | 插件 | 作用 |
|------|------|------|
| 1 | `esbuild` | TS/JSX/TSX → ESM JS |
| 2 | `commonjs` | CJS → ESM（仅 `.js/.cjs`） |
| 3 | `importAnalysis` | 重写 import 路径、注入 HMR、更新模块图 |
| 4 | `css` | 仅对 CSS 文件生效 |

**importAnalysis 核心逻辑：**
- 用 `es-module-lexer` 解析 import
- 裸导入（如 `pinia`）→ `/node_modules/.mini-vite/deps/pinia.js`
- 相对/绝对路径 → `this.resolve()` 解析后 `fsPathToUrl` 转为 URL
- 调用 `hmr.updateModuleGraph(importer, importees)` 更新依赖图
- 注入 `import.meta.hot` 和 `createHotContext`

| 10 | `transformCache.set` | 写入 transform 缓存 |
| 11 | `res.end(result.code)` | 返回转换后的 JS |

### 4. 浏览器请求 CSS（如 `/src/App.css`）

| 步骤 | 模块/函数 | 说明 |
|------|-----------|------|
| 1 | `transformMiddleware` | `isCssRequest` 为 true |
| 2 | `transformRequest` → `resolveId` | resolve 插件解析路径 |
| 3 | `pluginContainer.load` | 加载 CSS |
| 4 | `plugins/css.ts` → `load` | `fse.readFile` 读取 CSS |
| 5 | `plugins/css.ts` → `transform` | 生成 JS 模块：转义 CSS、`updateStyle`、`import.meta.hot.accept/dispose` |
| 6 | `res.end(result.code)` | 返回 JS 形式的 CSS 模块 |

### 5. 浏览器请求第三方依赖（如 `/node_modules/.mini-vite/deps/pinia.js`）

| 步骤 | 模块/函数 | 说明 |
|------|-----------|------|
| 1 | `transformRequest` → `resolveId` | resolve：`path.join(root, url)` 得到磁盘路径 |
| 2 | `load` | 预构建产物在 `node_modules/.mini-vite/deps/`，由 esbuild 或 cjs 插件加载 |
| 3 | `transform` | commonjs、importAnalysis 等处理 |
| 4 | 返回 | 返回 ESM 格式的依赖代码 |

---

## 三、模块图与缓存

### 1. 模块图（`server/hmr.ts`）

```ts
// 模块 -> 其导入的模块
const moduleGraph = new Map<string, Set<string>>()
// 模块 -> 导入它的模块
const importerGraph = new Map<string, Set<string>>()
```

- 更新：`importAnalysis` 在 transform 时调用 `hmr.updateModuleGraph(importer, importees)`
- 用途：文件变更时通过 `getBoundaryModules(changedFile)` 沿 `importerGraph` 向上收集候选边界（包含变更模块本身）
- 特性：BFS + 去重，避免循环依赖导致重复遍历

### 2. Transform 缓存（`transformRequest.ts`）

```ts
const transformCache = new Map<string, TransformCacheEntry>()
// TransformCacheEntry: { result, mtimeMs }
```

- 键：`resolveId` 返回的 `id`
- 校验：`mtimeMs` 与当前文件 mtime 一致才命中
- 失效：`invalidateTransformCache(id)`，在 HMR 的 `change/add/unlink` 时调用

### 3. 预构建缓存（`optimizer/index.ts`）

- 扫描：`esbuildScanPlugin` 从 `src/main.ts` 递归收集裸导入
- 输出：`node_modules/.mini-vite/deps/*.js`
- 时机：`server.listen` 回调中执行 `optimizeDeps`

---

## 四、WebSocket / HMR 接入

### 1. 服务端（`server/hmr.ts`）

| 组件 | 实现 |
|------|------|
| WebSocket 服务 | `new WebSocketServer({ server })`，复用 HTTP 端口 |
| 连接 | 发送 `{ type: 'connected' }` |
| 文件监听 | `chokidar.watch(src/**/*, *.html, public/**/*)` |
| 模块图 | `updateModuleGraph` 由 importAnalysis 调用 |
| 消息发送 | `send(payload)` 向所有已连接客户端广播 |

**变更处理：**

- HTML：`full-reload`
- JS/TS/Vue：`getBoundaryModules` 找边界 → `{ type: 'update', updates: [{ type: 'js-update', ... }] }`
- CSS：`{ type: 'update', updates: [{ type: 'css-update', ... }] }`
- 其他：`full-reload`
- add/unlink：`full-reload`

### 2. 客户端（`client/client.ts`）

| 功能 | 实现 |
|------|------|
| 连接 | `new WebSocket(host, 'vite-hmr')` |
| `createHotContext` | 由 importAnalysis 注入到每个模块 |
| 消息处理 | `connected` / `update` / `full-reload` / `prune` / `error` |
| JS 更新 | 服务端发送多候选 `js-update`，客户端逐条尝试应用；任意成功则保留热更，全部失败才 reload |
| CSS 更新 | `import(newUrl)` 重新加载 CSS 模块 |
| 断线重连 | close 后轮询重连，成功后 `location.reload` |

### 3. 注入链路

1. `indexHtml`：注入 `<script type="module">import "/node_modules/.mini-vite/client.js"</script>`
2. `hmr` 插件：`resolveId` + `load` 提供虚拟模块 `/node_modules/.mini-vite/client.js`
3. `importAnalysis`：在每个 JS 模块前注入 `createHotContext` 和 `import.meta.hot`

---

## 五、与官方 Vite 的差异

| 机制 | 官方 Vite | Mini-Vite |
|------|-----------|-----------|
| 依赖预构建 | 按需、增量、锁文件 hash | 启动时全量，无 hash |
| 模块图 | `ModuleNode` 含 url/id/importers/imported | 仅 `moduleGraph` + `importerGraph` |
| 缓存 | 文件系统 + 内存，带 hash | 仅内存，基于 mtime |
| CSS | 支持 PostCSS、预处理器、`@import` 解析 | 仅转义为 JS 模块 |
| 静态资源 | 图片/SVG/JSON 等内联或代理 | 无专门处理 |
| 虚拟模块 | `vite:client`、`vite:hmr` 等 | 仅 `/node_modules/.mini-vite/client.js` |
| 插件 API | 完整 Rollup + Vite 钩子 | 仅 resolveId、load、transform、configureServer、transformIndexHtml |
| 中间件 | 多层（proxy、cors、base 等） | 仅 indexHtml、sirv、transform |
| 路径解析 | 支持 `node_modules` 解析、`exports` 等 | 简单绝对/相对 + 预构建路径 |
| HMR | 完整 accept 链、prune、错误恢复 | 有基础实现，prune 未完全对接 |
| 错误处理 | 错误覆盖层、源码映射 | 有简单 overlay，功能较少 |
| 配置 | `vite.config`、环境变量 | 无配置系统 |
| 构建 | `build` 命令、Rollup 构建 | 无 build 命令 |

---

## 六、关键文件索引

| 路径 | 职责 |
|------|------|
| `server/index.ts` | 服务器入口、中间件注册、HMR 创建 |
| `server/middlewares/indexHtml.ts` | 处理 `/`，注入 HMR 客户端 |
| `server/middlewares/transform.ts` | 处理 JS/CSS 请求，调用 `transformRequest` |
| `transformRequest.ts` | resolveId → load → transform，含 transform 缓存 |
| `server/pluginContainer.ts` | 插件容器，串联 resolveId/load/transform |
| `plugins/resolve.ts` | 路径解析（绝对/相对） |
| `plugins/importAnalysis.ts` | import 重写、HMR 注入、模块图更新 |
| `plugins/css.ts` | CSS → JS 模块 |
| `server/hmr.ts` | WebSocket、chokidar、模块图、HMR 消息 |
| `plugins/hmr.ts` | 虚拟 client 模块的 resolve/load |
| `utils.ts` | `cleanUrl`、`isJsRequest`、`isCssRequest` 等工具函数 |

