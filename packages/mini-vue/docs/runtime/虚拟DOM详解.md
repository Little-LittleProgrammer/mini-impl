# 虚拟 DOM 详解

## 什么是虚拟 DOM？

虚拟 DOM（Virtual DOM）是真实 DOM 的 JavaScript 对象表示。它是一种编程概念，通过在内存中维护一个虚拟的 DOM 树，然后与真实 DOM 进行比较，计算出最小的变更，最后批量更新真实 DOM。

```typescript
// 真实 DOM
<div class="app">
  <span>Hello</span>
</div>

// 虚拟 DOM
const vnode = {
  type: 'div',
  props: { class: 'app' },
  children: [
    { type: 'span', props: null, children: 'Hello' }
  ]
}
```

## 为什么需要虚拟 DOM？

### 1. 跨平台

虚拟 DOM 是平台无关的抽象层，可以渲染到不同平台：

- 浏览器 DOM
- 原生应用（Weex、React Native）
- 服务端渲染（SSR）
- Canvas / WebGL

### 2. 批量更新

多个状态变更可以合并为一次 DOM 更新：

```typescript
// 多次修改
state.count = 1
state.count = 2
state.count = 3

// 虚拟 DOM 只会触发一次更新
```

### 3. 声明式编程

```typescript
// 命令式（传统 DOM 操作）
const div = document.createElement('div')
div.className = 'app'
div.textContent = 'Hello'
document.body.appendChild(div)

// 声明式（虚拟 DOM）
render(h('div', { class: 'app' }, 'Hello'), document.body)
```

## VNode 结构

### 基础结构

```typescript
// packages/runtime-core/src/vnode.ts

export interface VNode {
  // 类型标识
  __v_isVNode: true

  // 节点类型（元素标签、组件、Fragment 等）
  type: string | Component | typeof Fragment | typeof Text | typeof Comment

  // 属性对象
  props: Record<string, any> | null

  // 子节点
  children: VNodeChildren

  // 唯一标识
  key: string | number | null

  // 引用
  ref: Ref | null

  // 类型标记（位运算）
  shapeFlag: number

  // 补丁标记
  patchFlag: number

  // 动态属性
  dynamicProps: string[] | null

  // 挂载状态
  el: Element | null

  // 锚点（用于 Fragment 和 Teleport）
  anchor: Element | null

  // 组件实例
  component: ComponentInternalInstance | null

  // 父级 Suspense 边界
  suspense: SuspenseBoundary | null

  // 其他属性...
}
```

### ShapeFlags

使用位运算标记节点类型，便于快速判断：

```typescript
// packages/shared/src/shapeFlags.ts

export const enum ShapeFlags {
  ELEMENT = 1,                    // 000001 - 元素节点
  FUNCTIONAL_COMPONENT = 1 << 1,  // 000010 - 函数式组件
  STATEFUL_COMPONENT = 1 << 2,    // 000100 - 有状态组件
  TEXT_CHILDREN = 1 << 3,         // 001000 - 文本子节点
  ARRAY_CHILDREN = 1 << 4,        // 010000 - 数组子节点
  SLOTS_CHILDREN = 1 << 5,        // 100000 - 插槽子节点

  // 组合类型
  COMPONENT = STATEFUL_COMPONENT | FUNCTIONAL_COMPONENT
}
```

### PatchFlags

标记动态部分，优化 diff 算法：

```typescript
export const enum PatchFlags {
  TEXT = 1,           // 动态文本
  CLASS = 2,          // 动态 class
  STYLE = 4,          // 动态 style
  PROPS = 8,          // 动态 props
  FULL_PROPS = 16,    // 动态 key 的 props
  HYDRATE_EVENTS = 32, // 事件监听器
  STABLE_FRAGMENT = 64, // 稳定的 fragment
  KEYED_FRAGMENT = 128, // 有 key 的 fragment
  UNKEYED_FRAGMENT = 256, // 无 key 的 fragment
  NEED_PATCH = 512,   // 需要 patch
  DYNAMIC_SLOTS = 1024, // 动态插槽
  HOISTED = -1,       // 静态提升的节点
  BAIL = -2           // 退出优化模式
}
```

## 创建 VNode

### createVNode

```typescript
// packages/runtime-core/src/vnode.ts

export function createVNode(
  type: VNodeTypes,
  props: VNodeProps | null = null,
  children: VNodeChildren = null
): VNode {
  // 规范化 type
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : isObject(type)
      ? ShapeFlags.STATEFUL_COMPONENT
      : 0

  return createBaseVNode(type, props, children, shapeFlag)
}

function createBaseVNode(
  type: VNodeTypes,
  props: VNodeProps | null,
  children: VNodeChildren,
  shapeFlag: number
): VNode {
  const vnode: VNode = {
    __v_isVNode: true,
    type,
    props,
    key: props?.key ?? null,
    ref: props?.ref ?? null,
    children,
    shapeFlag,
    patchFlag: 0,
    dynamicProps: null,
    el: null,
    anchor: null,
    component: null,
    suspense: null
  }

  // 规范化子节点
  normalizeChildren(vnode, children)

  return vnode
}
```

### h 函数

`h()` 是 `createVNode` 的简写形式：

```typescript
// packages/runtime-core/src/h.ts

export function h(type: any, props?: any, children?: any): VNode {
  return createVNode(type, props, children)
}
```

### 使用示例

```typescript
import { h } from 'vue'

// 元素节点
const elementVNode = h('div', { class: 'app' }, 'Hello')

// 组件节点
const componentVNode = h(MyComponent, { prop: 'value' })

// Fragment
const fragmentVNode = h(Fragment, null, [
  h('div', null, 'A'),
  h('div', null, 'B')
])

// Text
const textVNode = h(Text, null, 'text content')

// Comment
const commentVNode = h(Comment, null, 'comment')
```

## 特殊节点类型

### Fragment

Fragment 是一个容器节点，本身不渲染任何 DOM 元素：

```typescript
export const Fragment = Symbol('Fragment')

// 使用场景
// 1. 多根节点组件
const MultiRootComponent = {
  render() {
    return h(Fragment, null, [
      h('div', null, 'A'),
      h('div', null, 'B')
    ])
  }
}

// 2. v-for 循环
// <template v-for="item in list">
//   <div>{{ item }}</div>
// </template>
```

### Text

纯文本节点：

```typescript
export const Text = Symbol('Text')

// 使用示例
const textVNode = h(Text, null, 'hello')
```

### Comment

注释节点：

```typescript
export const Comment = Symbol('Comment')

// 使用示例
const commentVNode = h(Comment, null, 'this is a comment')
```

## 子节点规范化

### normalizeChildren

```typescript
export function normalizeChildren(vnode: VNode, children: VNodeChildren): void {
  let type = 0

  if (children == null) {
    children = null
  } else if (isArray(children)) {
    type = ShapeFlags.ARRAY_CHILDREN
  } else if (typeof children === 'object') {
    // 插槽
    type = ShapeFlags.SLOTS_CHILDREN
  } else if (typeof children === 'function') {
    // 渲染函数
    type = ShapeFlags.SLOTS_CHILDREN
  } else {
    // 文本
    children = String(children)
    type = ShapeFlags.TEXT_CHILDREN
  }

  vnode.children = children
  vnode.shapeFlag |= type
}
```

### normalizeVNode

规范化可能为空的值：

```typescript
export function normalizeVNode(child: VNodeChild): VNode {
  if (child == null || typeof child === 'boolean') {
    // 空白注释节点
    return createVNode(Comment)
  } else if (isArray(child)) {
    // Fragment
    return createVNode(Fragment, null, child)
  } else if (typeof child === 'object') {
    // 已经是 VNode
    return cloneIfMounted(child)
  } else {
    // 文本节点
    return createVNode(Text, null, String(child))
  }
}
```

## cloneVNode

克隆现有 VNode：

```typescript
export function cloneVNode<T extends VNode>(
  vnode: T,
  extraProps?: VNodeProps | null
): VNode {
  const cloned: VNode = {
    ...vnode,
    props: {
      ...vnode.props,
      ...extraProps
    }
  }

  return cloned as T
}
```

## VNode 类型判断

### isVNode

```typescript
export function isVNode(value: any): value is VNode {
  return value && value.__v_isVNode === true
}
```

### isSameVNodeType

```typescript
export function isSameVNodeType(n1: VNode, n2: VNode): boolean {
  return n1.type === n2.type && n1.key === n2.key
}
```

## 元素节点 VNode

```typescript
// 元素节点
const elementVNode = {
  __v_isVNode: true,
  type: 'div',
  props: { class: 'app', onClick: handleClick },
  children: [
    { type: Text, children: 'Hello' }
  ],
  shapeFlag: ShapeFlags.ELEMENT | ShapeFlags.ARRAY_CHILDREN,
  patchFlag: 0,
  el: null  // 渲染后指向真实 DOM
}
```

## 组件节点 VNode

```typescript
// 组件节点
const componentVNode = {
  __v_isVNode: true,
  type: MyComponent,  // 组件对象
  props: { prop: 'value' },
  children: null,
  shapeFlag: ShapeFlags.STATEFUL_COMPONENT,
  patchFlag: 0,
  el: null,
  component: null  // 渲染后指向组件实例
}
```

## 虚拟 DOM 的性能

### 常见误解

虚拟 DOM 并不一定比直接操作 DOM 快。它的优势在于：

1. **声明式编程**：简化开发
2. **跨平台**：一次编写，多处渲染
3. **批量更新**：减少 DOM 操作次数
4. **可预测性**：输出由输入决定

### 优化策略

1. **静态提升**：静态节点只创建一次
2. **PatchFlags**：只比较动态部分
3. **Block Tree**：收集动态后代
4. **缓存事件处理器**：避免重复创建函数

## 总结

虚拟 DOM 的核心特性：

| 特性 | 说明 |
|------|------|
| 轻量 | 纯 JavaScript 对象 |
| 跨平台 | 可渲染到不同平台 |
| 类型标记 | ShapeFlags 和 PatchFlags 优化 |
| 子节点规范化 | 统一处理不同类型的子节点 |

## 下一步

- [渲染器详解](./渲染器详解.md)：了解如何将虚拟 DOM 渲染为真实 DOM