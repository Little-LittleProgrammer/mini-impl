# 插件系统总览

这一组文档聚焦 `mini-vite` 的插件能力，包括插件接口、插件容器实现、核心内置插件的职责，以及请求在插件链中的执行顺序。

## 推荐阅读

1. [插件系统原理解析](./插件系统原理解析.md)

## 核心源码入口

- `src/node/plugin.ts`
- `src/node/server/pluginContainer.ts`
- `src/node/plugins/resolve.ts`
- `src/node/plugins/esbuild.ts`
- `src/node/plugins/cjs.ts`
- `src/node/plugins/importAnalysis.ts`
- `src/node/plugins/css.ts`
- `src/node/plugins/hmr.ts`

## 这一组重点回答的问题

- `resolveId`、`load`、`transform` 等钩子分别在哪个阶段运行
- 插件容器如何按顺序组织一次模块请求
- 为什么 `importAnalysis` 同时承担路径重写和模块图更新
- 内置插件之间的先后顺序会带来什么影响
