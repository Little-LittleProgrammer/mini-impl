# mini-vue 与 Vue 3.6 的区别

## 1. 先说明对比基线

截至 `2026-04-05`，我查到 Vue 官方 `vuejs/core` Releases 页面里：

- 稳定版最新显示为 `v3.5.26`
- `3.6` 显示为预发布分支，页面展示了 `v3.6.0-beta.2`（`2026-01-04`）和 `v3.6.0-beta.1`（`2025-12-23`）

因此这里的“Vue 3.6”应理解为：

- 基于 Vue 官方已经公开的 `3.6 beta` 信息
- 以及 Vue 官方文档中仍然成立的核心架构能力

需要特别说明的是：

- 官方 release 页面明确提到更细的预发布变更应看 `minor` 分支 `CHANGELOG.md`
- 但公开检索结果里最明确、最稳定可引用的 3.6 新变化，主要集中在 `beta.1` 的发布说明

所以本文会把结论分成两类：

- “明确可确认”的 3.6 变化
- “基于官方架构延续关系的合理对比”

## 2. Vue 3.6 相比这份 mini-vue，首先不是“多一点 API”，而是换了一个量级

mini-vue 仍然属于：

- 教学化 Virtual DOM 运行时
- 教学化响应式
- 教学化模板编译器

而官方 Vue 3.6 至少已经在两个方向上明显继续前进：

1. `@vue/reactivity` 有基于 `alien-signals` 的重大重构
2. `Vapor Mode` 进入 beta，开始形成与传统 VDOM 并行的编译/渲染路线

这两个点，都不是当前 mini-vue 能覆盖的。

## 3. 最大差异一：Vue 3.6 已经不是只押注 VDOM

根据官方 `v3.6.0-beta.1` 发布说明，Vue 3.6 的一个核心变化是：

- `Vapor Mode` 已进入 beta
- 官方描述为其已达到与稳定 VDOM 模式的特性对齐
- 但 `Suspense` 在纯 Vapor 模式下仍有限制

这意味着 Vue 3.6 的官方路线已经从：

- “只有 Virtual DOM”

扩展为：

- “保留成熟的 Virtual DOM”
- “同时探索一条更依赖编译结果、尽量减少 VDOM 成本的新路线”

而当前 mini-vue：

- 完全建立在 VNode + patch + host ops 上
- 没有 Vapor 概念
- 没有细粒度 DOM 编译产物
- 没有双渲染模式共存的架构

所以两者最根本的差异之一是：

> mini-vue 还在解释 Vue 3 的经典 VDOM 内核；Vue 3.6 已经在官方层面推进 VDOM 之外的新编译执行模型。

## 4. 最大差异二：Vue 3.6 的响应式系统已经发生底层重构

官方 `v3.6.0-beta.1` 明确提到：

- `@vue/reactivity` 进行了基于 `alien-signals` 的重大重构
- 目标是显著改善性能和内存使用

这件事和当前 mini-vue 的差距非常大。

### 4.1 mini-vue 的响应式仍是最经典的教学模型

当前实现是：

- `WeakMap -> Map -> Set`
- 单个 `activeEffect`
- `track / trigger`
- 简单 `ReactiveEffect`
- `computed` 脏标记

这套模型非常适合教学，但它更接近“原理还原版 Vue 3 响应式”。

### 4.2 Vue 3.6 已经在做更深的信号化优化

从官方 release note 可以明确确认的是：

- 3.6 响应式层不是小修小补
- 而是一次底层级别的重构

这意味着它在真实实现上，已经更强调：

- 更低内存成本
- 更高传播效率
- 更接近信号系统的内部组织方式

这一点远远超出当前 mini-vue 的实现深度。

## 5. 编译器方向的差异比以前更大

### 5.1 mini-vue 的编译器仍然只是在解释基本流水线

当前 mini-vue 编译器做的是：

- parse 模板
- transform 基础节点
- generate render code

它的重点是“演示 Vue 编译器怎么工作”。

### 5.2 Vue 3.6 的编译器不只是生成 render

在 Vue 官方路线里，编译器已经承担更多职责：

- 为 VDOM 模式生成优化信息
- 为 Vapor 模式生成另一套更细粒度的执行结果
- 持续增强 SFC 编译链

而根据 3.6 beta 发布说明，Vapor 相关的 runtime/compiler 仍在继续修正和优化，例如：

- `runtime-vapor` 的动态 props/slots source caching
- `compiler-vapor` 的组件事件名处理修复

这说明 Vue 3.6 的编译器，已经不是单一路径输出器，而是在支撑多种渲染策略。

当前 mini-vue 完全没有这个层级。

## 6. 渲染器层面的差距在 3.6 时代更明显

即便先不谈 Vapor，只看传统 VDOM 模式，Vue 3.6 依然与 mini-vue 有巨大差距：

- 更完整的组件实例
- 更完整的 scheduler
- 更完整的 block tree / patch flags
- 更完整的内建组件
- 更完整的 hydration / SSR 协同
- 更完整的错误处理、调试钩子、边界兼容

当前 mini-vue 的 renderer 虽然已经实现了 keyed diff 主干，但：

- `patchChildren` 不是全量完成
- `processComponent` 没有完整更新派发
- `unmount` 过于简单
- 没有编译器优化信息联动

## 7. Vapor Mode 对比下，mini-vue 的定位会更清晰

Vue 官方文档在讲响应式和渲染机制时，已经公开说明：

- 传统 Vue 主要是运行时响应式 + Virtual DOM
- 但官方也在探索一个不依赖 Virtual DOM、更多利用 Vue 内建响应式系统的编译策略，即 Vapor Mode

把这句话放到当前仓库上，就能得到一个很清晰的定位：

- mini-vue 展示的是“Vue 3 经典路线”的教学骨架
- Vue 3.6 则在官方层面开始推进“经典路线 + 新路线并行”

## 8. 从 API 体验上看，两者差距也在扩大

Vue 3.6 继承并扩展了完整 Vue 3 生态能力，典型包括：

- 应用级 API
- 完整组合式 API
- 完整 Options API 兼容
- SFC、`<script setup>`
- 更完整模板语法
- 更成熟的类型推导

当前 mini-vue 只保留了非常小的一组表层 API：

- `reactive`
- `ref`
- `computed`
- `watch`
- `h`
- `createRenderer`
- `createApp`
- 运行时模板编译注册

## 9. 可以怎么理解这份对比

如果说“与完整 Vue 的区别”更偏工程能力差距，那么“与 Vue 3.6 的区别”更偏时代差距：

- mini-vue 还停留在“解释经典 Vue 3 核心结构”
- Vue 3.6 已经在官方层面推进响应式内核重构和 Vapor 新编译模式

因此，学习这份 mini-vue 的正确预期应该是：

- 用它理解 Vue 3 的经典基本盘
- 但不要拿它去类比 Vue 3.6 的真实内部复杂度

## 10. 一句话总结

当前 mini-vue 与 Vue 3.6 的差距，不只是“功能少”，而是：

- mini-vue 仍是经典 Vue 3 核心原理的教学缩写版
- Vue 3.6 则已经进入“成熟 VDOM 实现 + 新型 Vapor 路线 + 重构后的响应式内核”并行发展的阶段

## 参考资料

- Vue 官方发布页：`vuejs/core` Releases
  https://github.com/vuejs/core/releases
- Vue 3.6 beta.1 官方说明
  https://github.com/vuejs/core/releases/tag/v3.6.0-beta.1
- Vue 官方文档：Rendering Mechanism
  https://vuejs.org/guide/extras/rendering-mechanism.html
- Vue 官方文档：Reactivity in Depth
  https://vuejs.org/guide/extras/reactivity-in-depth.html
