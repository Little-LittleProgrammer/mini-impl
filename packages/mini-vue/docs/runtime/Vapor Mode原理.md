# Vapor Mode 原理

## 概述

Vapor Mode 是 Vue 3.6 引入的一个**实验性功能**，它通过**完全跳过虚拟 DOM**，将渲染工作从运行时前移到编译时，直接生成高效的原生 DOM 操作代码。这是 Vue 渲染架构的一次重大变革，标志着 Vue 从"虚拟 DOM 框架"向"编译时优化框架"的转变。

### 核心思想

Vapor Mode 采用"**编译时最大化优化，运行时最小化开销**"的策略：

- **跳过虚拟 DOM**：不生成 VNode 树，也不执行 diff 算法
- **编译时生成原生 DOM 代码**：模板直接编译为 `document.createElement`、`element.setAttribute` 等原生 DOM 操作
- **元素级定点更新**：响应式数据变化时，只精确更新对应的 DOM 元素，而非整个组件重新渲染

### 性能提升

| 指标 | 传统 VDOM | Vapor Mode | 提升幅度 |
|------|-----------|------------|----------|
| 内存峰值 | 基准 | 降低 42% | -42% |
| 复杂列表 diff | 基准 | 提升 40% | +40% |
| Hello World 包体大小 | 22.8 kB | 7.9 kB | -65% |
| createVaporApp 包体大小 | - | 20.8 kB | - |

## 为什么需要 Vapor Mode？

### 传统 VDOM 的瓶颈

传统 Vue 的渲染流程需要经过以下步骤：

```
Template → Parse → AST → Generate → Render Function → VNode → Diff → DOM Update
```

这个流程产生三个主要开销：

1. **VNode 创建开销**：每次渲染都需要创建完整的 VNode 树
2. **Diff 算法开销**：需要遍历和比较新旧 VNode 树
3. **中间层转换开销**：VNode → DOM 的转换过程

```typescript
// 传统 VDOM 渲染流程
function render() {
  // 1. 创建 VNode 树
  const vnode = h('div', { class: 'app' }, [
    h('h1', null, title.value),
    h('p', null, count.value)
  ])
  
  // 2. Diff 对比
  patch(oldVNode, vnode, container)
  
  // 3. 转换为 DOM 操作
  // ...
}
```

### Vapor Mode 的解决方案

Vapor Mode 将渲染逻辑前移到编译时：

```
Template → Parse → AST → Vapor Transform → Direct DOM Code → Runtime Execute
```

编译时直接生成 DOM 操作代码，运行时只需要执行这些代码：

```typescript
// Vapor Mode 编译后的代码
function render() {
  // 直接操作 DOM，无需 VNode
  const div = document.createElement('div')
  div.className = 'app'
  
  const h1 = document.createElement('h1')
  h1.textContent = title.value  // 响应式绑定
  
  const p = document.createElement('p')
  p.textContent = count.value   // 响应式绑定
  
  div.appendChild(h1)
  div.appendChild(p)
  container.appendChild(div)
}
```

## Vapor Mode 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vapor Mode 架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  编译时（Compiler）                                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Template → AST → Vapor Transform → Direct DOM Code     │   │
│  │                                                          │   │
│  │  <div>{{ count }}</div>                                 │   │
│  │         ↓                                                │   │
│  │  const div = createElement('div')                       │   │
│  │  setText(div, () => count.value)  // 响应式绑定          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  运行时（Runtime）                                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Block（渲染块）                                          │   │
│  │  ├── 静态部分：直接执行 DOM 操作                          │   │
│  │  └── 动态部分：响应式更新函数                              │   │
│  │                                                          │   │
│  │  Effect（响应式更新）                                     │   │
│  │  └── 数据变化 → 直接更新对应 DOM 元素                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 核心概念

### 1. Block（渲染块）

Block 是 Vapor Mode 的核心概念，代表一个可独立更新的 DOM 片段。每个组件对应一个 Block，Block 内部包含：

- **静态部分**：编译时生成的直接 DOM 操作代码
- **动态部分**：响应式数据的更新函数

```typescript
// Block 结构
interface Block {
  // 静态 DOM 节点
  nodes: Node[]
  
  // 动态更新函数映射
  // key: 响应式数据的 key
  // value: 更新该数据的 DOM 操作函数
  effects: Map<string, UpdateFn>
  
  // 父 Block（用于嵌套组件）
  parent: Block | null
}
```

### 2. 编译时优化

编译器在编译阶段进行以下优化：

#### 静态提升

```vue
<!-- 模板 -->
<template>
  <div>
    <h1>Static Title</h1>
    <p>{{ dynamic }}</p>
  </div>
</template>

<!-- Vapor Mode 编译后 -->
<script>
// 静态部分在组件外部创建，只创建一次
const h1 = document.createElement('h1')
h1.textContent = 'Static Title'

function render() {
  const div = document.createElement('div')
  
  // 复用静态节点
  div.appendChild(h1.cloneNode(true))
  
  // 动态部分
  const p = document.createElement('p')
  const updateP = () => {
    p.textContent = dynamic.value
  }
  updateP()  // 初始渲染
  
  // 响应式更新
  effect(updateP)
  
  div.appendChild(p)
  return div
}
</script>
```

#### 元素级更新

```vue
<!-- 模板 -->
<template>
  <div>
    <p>{{ count }}</p>
    <span>{{ name }}</span>
  </div>
</template>

<!-- Vapor Mode 编译后 -->
<script>
function render() {
  const div = document.createElement('div')
  
  const p = document.createElement('p')
  const updateCount = () => {
    p.textContent = count.value
  }
  
  const span = document.createElement('span')
  const updateName = () => {
    span.textContent = name.value
  }
  
  // 每个响应式数据都有独立的更新函数
  effect(updateCount)  // count 变化只更新 p
  effect(updateName)    // name 变化只更新 span
  
  updateCount()
  updateName()
  
  div.appendChild(p)
  div.appendChild(span)
  return div
}
</script>
```

### 3. 响应式更新机制

Vapor Mode 使用响应式系统（如 Vue 3.6 的 Alien Signals）来实现精确更新：

```typescript
// 响应式数据
const count = signal(0)
const name = signal('Vue')

// Vapor Mode 更新函数
const updateCount = () => {
  p.textContent = count()
}

const updateName = () => {
  span.textContent = name()
}

// 注册响应式更新
effect(updateCount)  // count 变化时只执行 updateCount
effect(updateName)   // name 变化时只执行 updateName

// 数据变化
count(1)  // 只更新 p 元素，不重新渲染整个组件
name('Vapor')  // 只更新 span 元素
```

## 编译流程

### 1. 模板解析

```vue
<template>
  <div class="app">
    <h1>{{ title }}</h1>
    <button @click="increment">Count: {{ count }}</button>
  </div>
</template>
```

### 2. AST 转换

编译器将模板转换为 AST，并标记动态部分：

```typescript
{
  type: 'ELEMENT',
  tag: 'div',
  props: [{ name: 'class', value: 'app' }],
  children: [
    {
      type: 'ELEMENT',
      tag: 'h1',
      children: [
        {
          type: 'INTERPOLATION',
          content: { type: 'SIMPLE_EXPRESSION', content: 'title' }
        }
      ]
    },
    {
      type: 'ELEMENT',
      tag: 'button',
      props: [
        {
          type: 'DIRECTIVE',
          name: 'on',
          arg: 'click',
          exp: { type: 'SIMPLE_EXPRESSION', content: 'increment' }
        }
      ],
      children: [
        { type: 'TEXT', content: 'Count: ' },
        {
          type: 'INTERPOLATION',
          content: { type: 'SIMPLE_EXPRESSION', content: 'count' }
        }
      ]
    }
  ]
}
```

### 3. Vapor 代码生成

编译器生成直接的 DOM 操作代码：

```typescript
import { effect } from '@vue/reactivity'
import { setText, setClass, setEventListener } from '@vue/runtime-dom'

export function render(_ctx) {
  // 创建根元素
  const div = document.createElement('div')
  setClass(div, 'app')
  
  // 创建 h1 元素
  const h1 = document.createElement('h1')
  const updateTitle = () => {
    setText(h1, _ctx.title)
  }
  effect(updateTitle)
  updateTitle()  // 初始渲染
  
  // 创建 button 元素
  const button = document.createElement('button')
  setEventListener(button, 'click', _ctx.increment)
  
  const updateCount = () => {
    setText(button, `Count: ${_ctx.count}`)
  }
  effect(updateCount)
  updateCount()  // 初始渲染
  
  // 组装 DOM
  div.appendChild(h1)
  div.appendChild(button)
  
  return div
}
```

## 运行时执行

### Block 创建

```typescript
// runtime-core/vapor/renderer.ts

export function createBlock(renderFn: () => Node[]): Block {
  const block: Block = {
    nodes: [],
    effects: new Map(),
    parent: null
  }
  
  // 执行渲染函数，收集 DOM 节点和更新函数
  block.nodes = renderFn()
  
  return block
}
```

### 响应式更新

```typescript
// 当响应式数据变化时
count.value = 1

// 响应式系统触发对应的更新函数
// 只更新 button 的文本内容，不重新渲染整个组件
updateCount()  // setText(button, 'Count: 1')
```

## 与传统 VDOM 对比

### 渲染流程对比

```
传统 VDOM：
Template → Render Function → VNode Tree → Diff → DOM Update
          ↑                                    ↑
          编译时生成                          运行时执行

Vapor Mode：
Template → Direct DOM Code → DOM Update
          ↑                  ↑
          编译时生成         运行时执行（无中间层）
```

### 更新机制对比

```typescript
// 传统 VDOM：需要重新创建 VNode 树并 diff
function update() {
  const newVNode = render()  // 创建新的 VNode 树
  patch(oldVNode, newVNode)  // Diff 对比
  // 转换为 DOM 操作
}

// Vapor Mode：直接更新对应 DOM 元素
function update() {
  // count 变化时，只执行对应的更新函数
  updateCount()  // 直接更新 DOM，无需 diff
}
```

### 内存占用对比

```typescript
// 传统 VDOM：需要维护 VNode 树
const vnode = {
  type: 'div',
  props: { class: 'app' },
  children: [
    { type: 'h1', props: null, children: '...' },
    { type: 'p', props: null, children: '...' }
  ],
  el: divElement,  // 引用真实 DOM
  // ... 其他元数据
}

// Vapor Mode：只维护 DOM 引用和更新函数
const block = {
  nodes: [divElement],  // 直接引用 DOM
  effects: new Map([    // 更新函数映射
    ['count', updateCount],
    ['title', updateTitle]
  ])
}
```

## 跨平台兼容性

Vapor Mode 在编译后生成一层**原子化的抽象层渲染代码**，而非直接的原生 DOM 调用：

```typescript
// 编译器生成的代码使用抽象 API
import { createElement, setText, insert } from '@vue/runtime-dom'

// 而非直接调用
// document.createElement()
// element.textContent = ...
```

这层抽象代码可被不同平台的渲染器实现：

- **浏览器**：使用 `document.createElement` 等 DOM API
- **移动端**：使用原生组件 API
- **Canvas**：使用 Canvas 绘制 API

## 性能收益分析

### 1. 内存占用降低

**传统 VDOM**：
- 每个 VNode 对象占用内存（类型、属性、子节点等）
- 需要维护新旧两棵 VNode 树用于 diff
- 内存峰值：基准值

**Vapor Mode**：
- 不创建 VNode 对象
- 只维护 DOM 引用和更新函数
- 内存峰值：降低约 42%

### 2. 渲染性能提升

**首次渲染**：
- 传统 VDOM：创建 VNode → 转换为 DOM
- Vapor Mode：直接创建 DOM
- 提升：约 20-30%

**更新性能**：
- 传统 VDOM：创建新 VNode → diff → 更新 DOM
- Vapor Mode：直接更新对应 DOM 元素
- 提升：约 40-60%（复杂列表场景）

### 3. 包体大小优化

**Hello World 示例**：
- 传统模式：22.8 kB
- Vapor Mode：7.9 kB
- 减少：65%

**createVaporApp**：
- 包体大小：20.8 kB（gzip: 8.28 kB）
- 相比 createApp：减少约 60%

## 使用方式

### 基本使用

```typescript
import { createVaporApp } from 'vue/vapor'

const app = createVaporApp({
  setup() {
    const count = ref(0)
    const increment = () => count.value++
    
    return {
      count,
      increment
    }
  },
  template: `
    <div>
      <p>{{ count }}</p>
      <button @click="increment">+</button>
    </div>
  `
})

app.mount('#app')
```

### 与 VDOM 模式共存

Vapor Mode 可以与传统的 VDOM 模式共存，通过配置选择使用哪种模式：

```typescript
// VDOM 模式（默认）
import { createApp } from 'vue'

// Vapor Mode
import { createVaporApp } from 'vue/vapor'

// 混合模式：部分组件使用 Vapor，部分使用 VDOM
```

## 当前限制

### 1. 编译压力增大

所有计算压力转向编译时，可能导致：

- **编译时间变长**：需要分析模板并生成更多代码
- **编译产物增大**：大量重复的 DOM 操作代码

### 2. 功能支持限制

Vapor Mode 目前是实验性功能，部分特性可能尚未完全支持：

- 某些高级指令可能不支持
- 某些组件特性可能需要回退到 VDOM 模式

### 3. API 稳定性

Vapor Mode 仍处于试验阶段：

- API 可能发生变化
- 预计 Vue 4 才会完全移除 VDOM
- 不建议在生产环境大规模使用

### 4. 调试复杂度

- 编译后的代码可读性较低
- 调试工具支持可能不完善

## 实现原理示例

### 简单组件编译

```vue
<!-- 模板 -->
<template>
  <div class="container">
    <h1>{{ title }}</h1>
    <p v-if="show">{{ content }}</p>
  </div>
</template>
```

```typescript
// Vapor Mode 编译后
import { effect } from '@vue/reactivity'
import { createElement, setClass, setText, insert, remove } from '@vue/runtime-dom'

export function render(_ctx) {
  const div = createElement('div')
  setClass(div, 'container')
  
  const h1 = createElement('h1')
  const updateTitle = () => setText(h1, _ctx.title)
  effect(updateTitle)
  updateTitle()
  insert(h1, div)
  
  let p = null
  const updateShow = () => {
    if (_ctx.show) {
      if (!p) {
        p = createElement('p')
        const updateContent = () => setText(p, _ctx.content)
        effect(updateContent)
        updateContent()
        insert(p, div)
      }
    } else {
      if (p) {
        remove(p)
        p = null
      }
    }
  }
  effect(updateShow)
  updateShow()
  
  return div
}
```

### 列表渲染编译

```vue
<!-- 模板 -->
<template>
  <ul>
    <li v-for="item in items" :key="item.id">
      {{ item.name }}
    </li>
  </ul>
</template>
```

```typescript
// Vapor Mode 编译后
import { effect } from '@vue/reactivity'
import { createElement, setText, insert, remove } from '@vue/runtime-dom'

export function render(_ctx) {
  const ul = createElement('ul')
  
  let liNodes = []
  let itemEffects = []
  
  const updateList = () => {
    const items = _ctx.items
    
    // 移除多余的节点
    while (liNodes.length > items.length) {
      const lastLi = liNodes.pop()
      remove(lastLi)
      const effect = itemEffects.pop()
      effect.stop()  // 停止响应式更新
    }
    
    // 更新或创建节点
    items.forEach((item, index) => {
      let li = liNodes[index]
      
      if (!li) {
        // 创建新节点
        li = createElement('li')
        insert(li, ul)
        liNodes[index] = li
        
        // 创建更新函数
        const updateItem = () => setText(li, item.name)
        effect(updateItem)
        itemEffects[index] = updateItem
        updateItem()
      } else {
        // 更新现有节点
        const updateItem = itemEffects[index]
        updateItem()
      }
    })
  }
  
  effect(updateList)
  updateList()
  
  return ul
}
```

## 总结

Vapor Mode 代表了 Vue 渲染架构的未来方向：

### 核心优势

1. **性能提升**：内存占用降低 42%，更新性能提升 40-60%
2. **包体优化**：Hello World 示例减少 65%
3. **精确更新**：元素级定点更新，无需 diff 算法

### 设计理念

- **编译时优化**：将计算从运行时前移到编译时
- **跳过中间层**：直接生成 DOM 操作代码，无需 VNode
- **响应式驱动**：利用响应式系统实现精确更新

### 适用场景

- **性能敏感应用**：需要极致性能的场景
- **简单组件**：结构简单的组件更适合 Vapor Mode
- **实验性项目**：可以尝试新特性的项目

### 未来展望

Vapor Mode 是 Vue 4 的重要方向，预计将：

- 完全移除 VDOM 作为默认模式
- 进一步完善编译时优化
- 提供更好的开发体验和调试支持

## 下一步

- [渲染器详解](./渲染器详解.md)：了解传统 VDOM 渲染器的实现
- [虚拟 DOM 详解](./虚拟DOM详解.md)：深入理解虚拟 DOM 的工作原理
- [响应式系统概述](../reactivity/响应式系统概述.md)：了解响应式系统如何驱动更新
