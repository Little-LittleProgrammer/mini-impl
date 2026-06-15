# mini-vite 与完整 Vite 的差异

mini-vite 只保留了 Vite 开发态最核心的一条主链路:**启动服务 → 预构建 → 按请求转换模块 → HMR**。本文把 mini-vite 已实现的部分和 Vite 还有但 mini-vite 没做的部分对照列清楚,方便你知道"学到哪了、还差什么"。

> 凡是标注 **(未实现)** 的,都是 Vite 的完整能力,mini-vite 出于简化没有做,可作为扩展阅读和进一步实现的方向。

## 1. 总体能力对照

| 维度 | 完整 Vite | mini-vite |
| --- | --- | --- |
| CLI 命令 | `dev` / `build` / `preview` | 仅 `dev`(`cli.ts`) |
| 配置系统 | `vite.config.ts`、`.env` | 无,全部硬编码(端口 3001、入口 `src/main.ts`) |
| HTTP 框架 | connect | connect(相同) |
| 中间件 | 10+(proxy、cors、base…) | 3 个:indexHtml、sirv(public)、transform |
| 插件 API | 完整 Rollup + Vite 钩子 | 5 个:configureServer、resolveId、load、transform、transformIndexHtml |
| 预构建 | 按需、增量、lockfile hash 缓存 | 启动时全量,无缓存 |
| 转换缓存 | 文件系统 + 内存,带 hash | 仅内存,基于 mtime |
| 模块图 | `ModuleNode`(字段丰富) | 两张 Map(`moduleGraph` + `importerGraph`) |
| 路径解析 | node_modules、exports、条件导出… | 绝对/相对路径 + 后缀推断 |
| CSS | Modules、预处理器、PostCSS、@import | 仅转义为 JS 注入 style |
| 静态资源 | 图片/字体/JSON/Worker/WASM | 仅 `public` 目录直传 |
| HMR | 完整 accept 链 + prune + 源码遮罩 | 多候选尝试,基础遮罩 |
| 生产构建 | 基于 Rollup | 无 |

## 2. 架构与启动流程差异

mini-vite 的启动流程(`server/index.ts`):

```
CLI → connect 应用 → 注册 6 个插件 → 注册 3 个中间件
   → 执行 configureServer → 创建 HTTP + WebSocket
   → listen 后执行 optimizeDeps 全量预构建
```

完整 Vite 在这之前还多了两步关键工作:**解析 `vite.config.*`** 和 **加载 `.env.*` 环境变量**,之后才创建服务器,且会注册内置插件 + 用户插件。

### 配置系统 (未实现)

Vite 通过 `vite.config.ts` 提供 server、build、css、optimizeDeps、plugins、ssr 等完整配置入口,并通过 `config` / `configResolved` 钩子让插件参与配置。mini-vite 没有配置文件,根目录、端口、入口都写死在代码里。

### 环境变量 (未实现)

Vite 按 `.env.[mode].local > .env.[mode] > .env.local > .env` 的优先级加载,只有 `VITE_` 前缀的变量暴露给客户端,通过 `import.meta.env` 访问。mini-vite 无此机制。

### 生产构建 (未实现)

`vite build` 基于 Rollup 打包,提供 CSS 代码分割、资源 hash、代码分割、Tree Shaking、压缩等能力。mini-vite 只有开发服务器,没有 `build` 命令。

## 3. CSS 处理差异

mini-vite 的 CSS 处理见 [模块转换与预构建](./03-模块转换与预构建.md):`css` 插件读文件 → 转义字符串 → 包成一段注入 `<style>` 的 JS 模块,支持 HMR。仅此而已。

Vite 还支持以下能力,mini-vite **全部未实现**:

- **CSS Modules** — `*.module.css` 生成局部类名,`import styles from` 得到类名映射对象
- **预处理器** — Sass / Less / Stylus(需装对应依赖)
- **PostCSS** — autoprefixer、cssnano 等后处理
- **`@import` 解析** — 解析并内联 CSS 内部的 `@import`
- **CSS 代码分割** — 生产构建时每个 chunk 独立 CSS 文件

> 注意:`optimizer/constants.ts` 的 `externalTypes` 把 css/less/scss 等列为外部类型,只是为了让预构建扫描时**跳过**这些文件,不代表 mini-vite 能编译它们。

## 4. 静态资源差异

mini-vite 对静态资源的处理只有一项:`public` 目录通过 `sirv(publicDir)` 中间件直接以 `/xxx` 访问(`server/index.ts`)。

以下 Vite 能力 mini-vite **均未实现**:

| 资源 | Vite 能力 |
| --- | --- |
| 图片 png/jpg/svg/webp | `import url from './x.png'` 得到 URL,小文件可 base64 内联 |
| 字体 woff/ttf | 同图片,作为资源 URL |
| JSON | `import data from './x.json'`,支持具名导出 |
| Web Worker | `import W from './w?worker'` |
| WASM | `import init from './x.wasm?init'` |
| 资源查询后缀 | `?url` / `?raw` / `?inline` 不同导入语义 |

## 5. 插件系统差异

mini-vite 的插件系统(见 [插件系统](./02-插件系统.md))实现了 Rollup/Vite 最常用的 5 个钩子,插件容器是个工厂函数,resolveId/load 取首个非空结果、transform 串行累积。

Vite 还有大量钩子未在 mini-vite 出现:`config`、`configResolved`、`options`、`buildStart`、`buildEnd`、`handleHotUpdate`(自定义 HMR)、以及完整的输出阶段钩子(`renderChunk`、`generateBundle` 等)。`plugin.ts` 的注释里列了完整钩子清单可供参考。

## 6. HMR 差异

mini-vite 的 HMR(见 [热更新 HMR](./04-热更新HMR.md))已能跑通"改文件 → 局部替换 / 回退刷新"。相比 Vite 缺少:

- **`handleHotUpdate` 钩子** — 让插件自定义 HMR 行为(未实现)
- **完整 prune 生命周期** — 服务端主动通知客户端清理失效模块(客户端有处理逻辑,服务端不发)
- **动态 import 依赖追踪** — mini-vite 只解析静态 import
- **源码级错误遮罩** — Vite 遮罩能定位源码、点击跳编辑器,mini-vite 只显示纯文本
- **手动边界控制的完整语义** — `import.meta.hot.accept([deps], cb)` 多依赖在 mini-vite 中按单依赖触发

### import.meta.hot API 对照

mini-vite 客户端已实现:`accept` / `dispose` / `decline` / `invalidate` / `on` / `off` / `send`。典型用法(清理副作用、保留状态):

```js
let timer = setInterval(tick, 1000)
if (import.meta.hot) {
  import.meta.hot.dispose(() => clearInterval(timer)) // 清理旧定时器
  import.meta.hot.accept()                            // 接受自更新
}
```

差异在于 Vite 的 `import.meta.hot.data`(跨更新保存数据)等能力在 mini-vite 中仅有基础占位,不保证完整语义。

## 7. 其他 Vite 关键概念(均未实现)

下面这些是 Vite 作为完整构建工具的能力,mini-vite 完全没有涉及,列在这里作为全景参考:

- **代理配置** `server.proxy` — 开发态跨域转发,支持 WebSocket 代理
- **HTTPS / HTTP2** — `server.https`
- **多入口 (MPA)** — `rollupOptions.input` 配多个 HTML 入口
- **模块预加载** — 生产构建注入 `<link rel="modulepreload">`
- **Source Map** — 生产构建可调试源码(mini-vite 开发态 esbuild 生成了 map,但未完整串联)
- **SSR** — `vite build --ssr`、SSR 模块图、`ssr.noExternal` 等

## 8. 学习路径建议

读完整套文档后,如果想继续动手扩展 mini-vite,推荐按"投入小、收益直观"的顺序:

1. **JSON 导入** — 在转换链里加个插件,把 `.json` 包成 `export default {...}`,最简单
2. **资源 URL** — 让图片等返回 URL 字符串,理解资源处理思路
3. **配置文件** — 加载 `vite.config.ts`,把写死的 root/port/入口变成可配置
4. **CSS 预处理器** — 接入 sass,体会预处理器编译流程
5. **预构建缓存** — 给预构建加 hash 校验,避免每次启动全量重建

---

回到 [文档导航](./README.md)。
