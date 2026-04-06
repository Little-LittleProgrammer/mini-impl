# 静态资源总览

这一组文档聚焦 `mini-vite` 对 CSS 和静态资源的处理方式，包括请求流程、模块转换、缓存策略、安全边界，以及与 HMR、插件系统之间的协作关系。

## 推荐阅读

1. [静态资源与 CSS 处理](./静态资源与CSS处理.md)

## 核心源码入口

- `src/node/plugins/css.ts`
- `src/node/server/middlewares/transform.ts`
- `src/node/transformRequest.ts`
- `src/node/plugins/importAnalysis.ts`
- `src/node/server/hmr.ts`

## 这一组重点回答的问题

- CSS 为什么会被转换成 JS 模块返回给浏览器
- 静态资源请求如何被识别、读取和返回
- CSS 热更新如何与 HMR 客户端配合
- 资源缓存、安全校验和错误处理放在哪一层
