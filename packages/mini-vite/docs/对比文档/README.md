# mini-vite 与 Vite 对比总览

本文档对比 `mini-vite`（学习型简化实现）与完整 `Vite` 的功能差异，帮助你理解 Vite 的核心机制，同时明确 mini-vite 的学习边界。

## 对比维度概览

| 维度 | mini-vite | Vite | 文档链接 |
|------|-----------|------|----------|
| 插件系统 | 5 个核心钩子 | 完整 Rollup 扩展 + Vite 特有钩子 | [插件对比](./插件对比.md) |
| 预构建 | esbuild 扫描 + 打包 | esbuild + 缓存优化 + 多入口处理 | [预构建对比](./预构建对比.md) |
| 热更新 | WebSocket + 模块图 | WebSocket + 模块图 + 手动边界控制 | [热更新对比](./热更新对比.md) |
| 静态资源 | CSS + 基础资源处理 | CSS + 图片 + 字体 + SVG + JSON + Worker | [静态资源对比](./静态资源对比.md) |
| 架构设计 | connect + 中间件链 | connect + 多种中间件 + 生产构建 | [架构对比](./架构对比.md) |

## mini-vite 实现范围

### 已实现的核心功能

1. **开发服务器**
   - connect 作为 HTTP 服务器
   - 基础中间件链（静态资源、转换、错误处理）

2. **插件系统**
   - `resolveId` - 模块路径解析
   - `load` - 模块加载
   - `transform` - 模块转换
   - `configureServer` - 服务器配置
   - `transformIndexHtml` - HTML 转换

3. **核心插件**
   - `resolve` - 路径解析（相对路径、裸模块）
   - `esbuild` - TypeScript/JavaScript 编译
   - `importAnalysis` - 导入语句分析与重写
   - `cjs` - CommonJS 模块支持
   - `css` - CSS 模块处理
   - `hmr` - 热更新插件

4. **依赖预构建**
   - esbuild 扫描依赖
   - 单 bundle 打包
   - 缓存机制

5. **热更新 (HMR)**
   - WebSocket 通信
   - 模块依赖图
   - 自动边界计算

### 未实现的功能

1. **构建命令** - `vite build` 的生产构建功能
2. **预览命令** - `vite preview` 预览生产产物
3. **环境变量** - `.env` 文件支持
4. **配置文件** - `vite.config.ts` 完整配置解析
5. **更多资源类型** - 图片、字体、SVG、Worker、WASM 等
6. **CSS 增强** - PostCSS、CSS 预处理器（Sass/Less）、CSS Modules
7. **SSR 支持** - 服务端渲染能力
8. **更多插件钩子** - `buildStart`、`buildEnd`、`closeBundle` 等 Rollup 钩子

## 学习价值

mini-vite 通过精简实现，帮助你：

1. **理解核心请求链路** - 从浏览器请求到返回转换后的代码
2. **掌握插件机制** - Vite 如何通过插件管道处理各类文件
3. **理解预构建原理** - 为何需要预构建，esbuild 如何参与
4. **理解 HMR 机制** - WebSocket 如何驱动模块更新

## 推荐阅读顺序

1. [架构对比](./架构对比.md) - 理解整体设计差异
2. [插件对比](./插件对比.md) - 插件系统是 Vite 的核心
3. [预构建对比](./预构建对比.md) - 依赖处理的关键机制
4. [热更新对比](./热更新对比.md) - 开发体验的核心
5. [静态资源对比](./静态资源对比.md) - 各类文件的处理方式
6. [Vite 关键概念](./Vite关键概念.md) - mini-vite 未实现的关键能力详解