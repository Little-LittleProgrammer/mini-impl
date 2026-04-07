# diff 与卸载完整度

## 1. 完整 Vue 的 renderer 为什么远不止 keyed diff

很多教学实现把 renderer 的难点集中在 keyed diff，但完整 Vue 的真正难点是“所有节点形态都要能安全切换和回收”。这包括：

- 文本、元素、组件、Fragment、注释等节点类型切换
- children 从文本变数组、数组变空、组件变元素等形态切换
- 组件子树和副作用的递归卸载
- `ref`、指令、过渡、keep-alive、teleport 等附加能力的清理

## 2. 完整 Vue 的实现原理

完整 Vue 的 `patch` 会先按 vnode 类型分流，再按节点内部状态分支处理。真正复杂的地方在 `patchChildren` 和 `unmount`。

`patchChildren` 一般会先判断新旧 children 的形态：

- 文本对文本
- 数组对数组
- 数组对文本
- 文本对空
- 空对数组

每一种切换路径都对应不同的移除、设置文本、挂载新子树策略。

`unmount` 也不是单一 `remove(el)`，而是一个递归清理过程。完整 Vue 通常会按节点类型做不同处理：

- 普通元素：递归卸载子节点，再清理自身
- 组件：停止组件 effect scope，执行卸载钩子，再卸载其 `subTree`
- Fragment：按边界递归清理整段子树
- Teleport / KeepAlive / Suspense：走各自专门的卸载分支

在这个过程中还要处理：

- 模板 `ref` 置空
- 指令 `beforeUnmount / unmounted`
- 过渡离场控制
- 异步依赖和缓存的收尾

## 3. 为什么“主干 diff 跑通”离完整实现还很远

keyed diff 解决的是“数组子节点最小移动”问题，但完整 renderer 还要对整个 vnode 生命周期负责，包括创建、更新、移动、隐藏、缓存、销毁。生产框架真正难的是把这些阶段全部接通，而且不能漏清理。

## 4. 理解重点

完整 Vue 的 renderer 不是一个单纯的比较算法，而是一套“节点状态迁移和资源回收系统”。
