# mini-vue 与完整 Vue 的区别

## 1. 先定义“完整 Vue”指什么

这里的“完整 Vue”指的是现代 Vue 3 在常规 Virtual DOM 模式下的完整能力集合，大体包含：

- 更完整的 `@vue/reactivity`
- 更完整的 `@vue/runtime-core`
- `@vue/runtime-dom`
- `@vue/compiler-core`
- `@vue/compiler-dom`
- `@vue/compiler-sfc`
- SSR / hydration 相关能力
- 更完整的应用、组件、指令、开发调试与错误处理体系

## 2. 最大差异：mini-vue 更像教学内核，不是生产框架

完整 Vue 的目标是：

- 正确性
- 性能
- 边界兼容
- API 完整性
- 跨构建链与生态协作

当前 mini-vue 的目标则更像：

- 把 Vue 3 核心思想串起来
- 能跑通最小案例
- 便于理解源码结构

## 3. 运行时层面的差距

### 3.1 应用实例能力

完整 Vue 的 `app` 实例通常还包括：

- `use`
- `mixin`
- `component`
- `directive`
- `provide`
- `config`
- `runWithContext`

当前 mini-vue 的 `app` 只有：

- `mount`
- `unmount`

### 3.2 组件实例模型

完整 Vue 组件实例非常复杂，至少涉及：

- `props`
- `attrs`
- `slots`
- `emit`
- `setupState`
- `ctx / proxy`
- `exposed`
- `provides`
- `scope`
- `access cache`
- `render cache`

当前 mini-vue 中，这些绝大多数都不存在。

### 3.3 组件通信能力

完整 Vue 支持：

- `props`
- `emits`
- 自定义事件
- `slots`
- `provide / inject`
- `attrs` fallthrough
- `expose`

当前 mini-vue：

- 只在 `createApp(rootComponent, rootProps)` 层面保留了 rootProps 入口
- 没有成体系的 props 初始化与更新
- 没有 emits
- 没有真正的 slots 系统
- 没有 provide/inject

### 3.4 内建组件与高级能力

完整 Vue 有：

- `Teleport`
- `KeepAlive`
- `Suspense`
- `Transition`
- `TransitionGroup`

当前 mini-vue 全部没有。

### 3.5 生命周期覆盖

完整 Vue 生命周期远比当前版本完整，包括：

- 挂载前后
- 更新前后
- 卸载前后
- 错误捕获
- 渲染调试
- keep-alive 激活/失活

当前 mini-vue 只实现了：

- `beforeCreate`
- `created`
- `beforeMount`
- `mounted`

## 4. 渲染器层面的差距

### 4.1 diff 与卸载完整度

完整 Vue 的 renderer 不只是有 keyed diff 算法，还要覆盖：

- 各种 children 形态切换
- 组件子树卸载
- Fragment 边界处理
- ref 清理
- 指令生命周期
- 过渡系统
- keep-alive / suspense / teleport 特判

当前 mini-vue 虽然已经做了 keyed diff 的主干，但：

- `patchChildren` 有多个 `TODO`
- `unmount` 只是简单 `hostRemove(vnode.el)`
- 复杂节点没有完整递归销毁

### 4.2 编译器辅助优化缺失

完整 Vue 的 runtime 会充分利用编译器产物：

- `patchFlag`
- `dynamicProps`
- `block tree`
- `dynamicChildren`

当前 mini-vue 虽然在一些类型定义和参数位上保留了这些概念，但实际上并没有形成完整的“编译器告知运行时优化”闭环。

### 4.3 调度系统深度不同

完整 Vue 的 scheduler 不只是一个微任务队列，它还要处理：

- job queue
- pre / post flush callbacks
- 去重
- 组件更新顺序
- 递归保护
- `nextTick`

当前 mini-vue 只有单一的 pre-flush 队列。

## 5. 响应式层面的差距

### 5.1 API 覆盖面

完整 Vue 的响应式体系通常包括：

- `reactive`
- `readonly`
- `shallowReactive`
- `shallowReadonly`
- `ref`
- `shallowRef`
- `computed`
- `watch`
- `watchEffect`
- `effectScope`
- `customRef`
- `toRef / toRefs`
- `markRaw`
- `triggerRef`

当前 mini-vue 实现的稳定核心只有：

- `reactive`
- `ref`
- `computed`
- `watch`
- `effect`

### 5.2 依赖清理与停止机制

完整 Vue 非常强调 effect 生命周期管理：

- 收集依赖时知道自己被哪些 dep 引用
- 重新执行前能清理陈旧依赖
- `stop()` 能真正断开订阅关系

当前 mini-vue：

- `stop()` 是空实现
- 没有 cleanup 体系

### 5.3 集合类型支持

完整 Vue 对以下类型有专门处理：

- `Array`
- `Map`
- `Set`
- `WeakMap`
- `WeakSet`

当前 mini-vue 虽然 `traverse` 里考虑了 `Map/Set`，但 `reactive` 层并没有为集合类型提供完整的专用代理逻辑。

## 6. 编译器层面的差距

### 6.1 模板能力差距

完整 Vue 编译器支持大量模板语法与指令语义，包括：

- `v-bind`
- `v-on`
- `v-model`
- `v-for`
- `v-slot`
- `v-memo`
- `v-once`
- 动态组件
- 指令参数与修饰符

当前 mini-vue 只覆盖了很小的子集。

### 6.2 SFC 编译链缺失

完整 Vue 实际开发大量依赖 `.vue` 单文件组件，这意味着编译器还要处理：

- `<template>`
- `<script>`
- `<script setup>`
- `<style scoped>`
- CSS 变量注入
- HMR 辅助信息
- source map

当前 mini-vue 完全没有这一层。

### 6.3 优化体系缺失

完整 Vue 编译器的重要价值，不只是把模板翻译成 render，而是顺手做优化：

- 静态提升
- patch flags
- tree flattening
- cache handlers
- SSR 分支生成

当前 mini-vue 主要还是“能生成 render code”，没有形成完整优化体系。

## 7. 工程层面的差距

完整 Vue 还包含很多 mini-vue 不涉及的工程要素：

- 更完整的类型系统
- 错误与警告体系
- 开发模式调试钩子
- SSR / hydration
- devtools 协作
- 生态接口稳定性
- 更严格的边界兼容和性能回归控制

## 8. 反过来看，mini-vue 保留了什么最核心的“Vue 味道”

虽然差距很大，但它还是保留了几件最有代表性的 Vue 3 思想：

1. 运行时、响应式、编译器三层拆分
2. `reactive/ref/effect` 的响应式主链
3. `VNode + renderer + host ops` 的渲染主链
4. `parse -> transform -> generate` 的编译主链
5. 组件 render 由响应式副作用驱动

## 9. 一句话总结

如果把完整 Vue 看成一套成熟工业框架，那么这份 mini-vue 更像它的教学解剖模型：

- 骨骼位置基本对
- 关键器官能看清
- 血液循环能跑起来
- 但离真实可长期工作的完整生命体还差很多层工程细节
