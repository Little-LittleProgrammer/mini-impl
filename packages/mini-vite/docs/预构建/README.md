# 预构建总览

这一组文档聚焦 `mini-vite` 的依赖预构建流程，包括裸导入扫描、esbuild 打包、缓存目录组织，以及运行时如何把导入路径重写到预构建产物。

## 推荐阅读

1. [预构建原理解析](./预构建原理解析.md)

## 核心源码入口

- `src/node/optimizer/index.ts`
- `src/node/optimizer/scanPlugin.ts`
- `src/node/optimizer/types.ts`
- `src/node/plugins/importAnalysis.ts`
- `src/node/plugins/resolve.ts`

## 这一组重点回答的问题

- 为什么要在开发服务器启动时做依赖预构建
- 裸导入是如何被扫描出来的
- 预构建产物为什么会落到 `node_modules/.mini-vite/deps`
- 运行时导入路径重写和预构建缓存是如何配合的
