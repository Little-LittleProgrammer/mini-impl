# 响应式 API 覆盖面

## 1. 为什么完整 Vue 会有这么多响应式 API

完整 Vue 的响应式 API 不是为了堆数量，而是为了覆盖不同数据形态和性能取舍：

- 深响应式还是浅响应式
- 可写还是只读
- 值容器还是对象代理
- 自动依赖收集还是显式控制
- 单个副作用还是整组副作用作用域

## 2. 完整 Vue 的实现原理

完整 Vue 一般会围绕几层抽象组织 API：

- 代理类 API：`reactive`、`readonly`、`shallowReactive`、`shallowReadonly`
- 值容器 API：`ref`、`shallowRef`、`customRef`
- 派生状态 API：`computed`
- 副作用 API：`watchEffect`、`watch`
- 作用域 API：`effectScope`
- 辅助 API：`toRef`、`toRefs`、`markRaw`、`triggerRef`

这些 API 并不是互相独立实现，而是共享底层依赖追踪和触发逻辑，只在几个关键点上分叉：

- 读取时是否递归转换子对象
- 写入时是否允许修改
- 依赖是挂在对象属性上还是 `ref.value` 上
- 触发更新时是否需要调度器参与

例如 `readonly` 与 `reactive` 的核心差别，不在收集依赖能力，而在于 setter 分支会拒绝写入；`shallowReactive` 与 `reactive` 的差别，则在 getter 里是否继续把嵌套对象递归包装成代理。

`effectScope` 的加入又把“副作用生命周期”提升成一等概念。组件实例、组合式函数都可以把内部创建的 effect、watch、computed 收拢到一个 scope 里，后续统一停止。

## 3. 为什么教学实现通常只保留核心四件套

教学版最适合先讲清：

- `reactive`
- `ref`
- `computed`
- `watch`

因为这四类已经能覆盖依赖收集、惰性求值和副作用调度的主线。完整 Vue 再继续扩展，是为了解决实际工程里更多性能、封装和边界问题。

## 4. 理解重点

完整 Vue 的响应式 API 体系，本质上是在同一底层机制上提供多种“响应式包装策略”。
