# 热更新总览

这一组文档聚焦 `mini-vite` 的 HMR 机制，包括服务端文件监听、模块图维护、更新边界计算，以及浏览器端如何接收并应用更新。

## 推荐阅读

1. [HMR 原理解析](./HMR原理解析.md)

## 核心源码入口

- `src/node/server/hmr.ts`
- `src/node/plugins/hmr.ts`
- `src/node/plugins/importAnalysis.ts`
- `src/client/client.ts`
- `src/node/server/middlewares/indexHtml.ts`

## 这一组重点回答的问题

- HMR 客户端是如何被注入页面的
- 模块图在什么阶段建立，又如何用于更新边界计算
- 服务端如何区分 `js-update`、`css-update` 和 `full-reload`
- 客户端收到更新消息后如何执行热替换
