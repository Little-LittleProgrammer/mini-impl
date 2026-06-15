# mini-vite 文档

mini-vite 是 Vite 开发服务器核心链路的最小实现。它只做一件事:**把浏览器对源码的请求,实时转换成浏览器能直接运行的 ESM,并在文件变化时推送热更新。**

没有配置系统、没有生产构建、没有 SSR——只保留理解 Vite "为什么快" 所需的那条主链路。

## 一句话原理

浏览器原生支持 ESM,所以开发时不需要打包。每个 `import` 都是一个 HTTP 请求,mini-vite 用一个中间件拦下这些请求,经过 `resolveId → load → transform` 三步插件链处理后返回结果。第三方依赖因为模块太碎、且可能是 CommonJS,启动时用 esbuild 预先打包一次。文件改动时,通过 WebSocket 通知浏览器局部替换模块。

## 阅读顺序

按下面顺序读,每篇都建立在前一篇之上:

1. [架构与请求链路](./01-架构与请求链路.md) —— 启动流程,以及一次 HTML/JS/CSS/依赖请求分别经过哪些模块。**先读这篇建立全局心智模型。**
2. [插件系统](./02-插件系统.md) —— 插件接口、插件容器、六个内置插件各自做什么。这是整套系统的核心抽象。
3. [模块转换与预构建](./03-模块转换与预构建.md) —— transformRequest 主流程、转换缓存,以及为什么需要预构建、扫描和打包是怎么做的。
4. [热更新 HMR](./04-热更新HMR.md) —— 从"保存文件"到"页面局部替换"的完整闭环。
5. [与 Vite 的差异](./05-与Vite的差异.md) —— mini-vite 砍掉了什么、Vite 还有哪些关键能力。作为扩展阅读和边界说明。

## 源码地图

| 路径 | 职责 |
| --- | --- |
| `bin/mini-vite.js` | 命令行入口 |
| `src/node/cli.ts` | CLI 参数解析(基于 cac) |
| `src/node/server/index.ts` | 服务启动、插件注册、中间件装配 |
| `src/node/server/middlewares/indexHtml.ts` | 处理 `/`,注入 HMR 客户端脚本 |
| `src/node/server/middlewares/transform.ts` | 拦截 JS/CSS 请求,调用 transformRequest |
| `src/node/transformRequest.ts` | `resolveId → load → transform` 主流程 + transform 缓存 |
| `src/node/server/pluginContainer.ts` | 插件容器,串联三个核心钩子 |
| `src/node/plugin.ts` | 插件接口定义 |
| `src/node/plugins/*.ts` | 六个内置插件 |
| `src/node/server/hmr.ts` | WebSocket、文件监听、模块图、更新边界计算 |
| `src/client/client.ts` | 浏览器端 HMR 运行时 |
| `src/node/optimizer/index.ts` | 依赖预构建 |
| `src/node/optimizer/scanPlugin.ts` | 依赖扫描(esbuild 插件) |
| `src/node/utils.ts` | `cleanUrl`、`normalizePath`、`isJsRequest` 等工具 |

## 关于本文档

所有内容以 `src/` 下的**真实源码**为准。涉及 Vite 有、但 mini-vite 没有实现的能力,统一在 [与 Vite 的差异](./05-与Vite的差异.md) 中说明,正文不混入未实现的特性。
