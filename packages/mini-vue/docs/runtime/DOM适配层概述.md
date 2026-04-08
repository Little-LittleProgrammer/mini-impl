# DOM 适配层概述

## 什么是 DOM 适配层？

DOM 适配层是 Vue 运行时与浏览器 DOM 之间的桥梁。它将平台特定的 DOM 操作抽象为通用接口，使 Vue 的核心逻辑可以跨平台运行。

```typescript
import { createRenderer } from 'vue'

// 自定义渲染器（如 Canvas）
const { render } = createRenderer({
  createElement(tag) { return createCanvasElement(tag) },
  insert(child, parent) { parent.add(child) },
  // ...
})
```

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        渲染器架构                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  runtime-core（平台无关）                                        │
│  ├── patch                                                       │
│  ├── diff 算法                                                   │
│  ├── 组件系统                                                    │
│  └── 调度器                                                      │
│                                                                  │
│            │                                                     │
│            ▼                                                     │
│                                                                  │
│  RendererOptions（平台操作接口）                                  │
│  ├── createElement                                               │
│  ├── insert                                                      │
│  ├── remove                                                      │
│  ├── patchProp                                                   │
│  └── ...                                                         │
│                                                                  │
│            │                                                     │
│            ▼                                                     │
│                                                                  │
│  runtime-dom（浏览器实现）                                        │
│  ├── nodeOps.ts                                                  │
│  ├── patchProp.ts                                                │
│  └── modules/                                                    │
│      ├── attrs.ts                                                │
│      ├── class.ts                                                │
│      ├── events.ts                                               │
│      ├── props.ts                                                │
│      └── style.ts                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## nodeOps

`nodeOps` 定义了 DOM 节点操作。

```typescript
// packages/runtime-dom/src/nodeOps.ts

import { RendererOptions } from '@vue/runtime-core'

export const nodeOps: RendererOptions<Node, Element> = {
  // 创建元素
  createElement: (tag: string): Element => {
    return document.createElement(tag)
  },

  // 创建文本节点
  createText: (text: string): Text => {
    return document.createTextNode(text)
  },

  // 创建注释节点
  createComment: (text: string): Comment => {
    return document.createComment(text)
  },

  // 设置文本内容
  setElementText: (el: Element, text: string): void => {
    el.textContent = text
  },

  // 设置文本节点内容
  setText: (node: Text, text: string): void => {
    node.nodeValue = text
  },

  // 插入节点
  insert: (child: Node, parent: Element, anchor?: Node | null): void => {
    parent.insertBefore(child, anchor || null)
  },

  // 移除节点
  remove: (child: Node): void => {
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },

  // 获取父节点
  parentNode: (node: Node): Element | null => {
    return node.parentNode as Element | null
  },

  // 获取下一个兄弟节点
  nextSibling: (node: Node): Node | null => {
    return node.nextSibling
  },

  // 查询选择器
  querySelector: (selector: string): Element | null => {
    return document.querySelector(selector)
  }
}
```

## patchProp

`patchProp` 处理元素属性的更新。

```typescript
// packages/runtime-dom/src/patchProp.ts

export const patchProp: DOMRendererOptions['patchProp'] = (
  el,
  key,
  prevValue,
  nextValue,
  isSVG = false,
  prevChildren,
  parentComponent,
  parentSuspense,
  unmountChildren
) => {
  // 根据 key 类型分发到不同的处理函数
  if (key === 'class') {
    patchClass(el, nextValue, isSVG)
  } else if (key === 'style') {
    patchStyle(el, prevValue, nextValue)
  } else if (isOn(key)) {
    // 事件处理
    patchEvent(el, key, prevValue, nextValue, parentComponent)
  } else if (shouldSetAsProp(el, key, nextValue, isSVG)) {
    // DOM property
    patchDOMProp(el, key, nextValue, prevChildren, parentComponent, parentSuspense, unmountChildren)
  } else {
    // HTML attribute
    patchAttr(el, key, nextValue, isSVG)
  }
}
```

## 属性处理模块

### class

```typescript
// packages/runtime-dom/src/modules/class.ts

export function patchClass(el: Element, value: string | null, isSVG: boolean): void {
  if (value == null) {
    el.removeAttribute('class')
  } else if (isSVG) {
    el.setAttribute('class', value)
  } else {
    el.className = value
  }
}
```

### style

```typescript
// packages/runtime-dom/src/modules/style.ts

export function patchStyle(
  el: Element,
  prev: StyleValue | null,
  next: StyleValue | null
): void {
  const style = (el as HTMLElement).style

  // 驼峰转换
  const cssText = next ? normalizeStyle(next) : ''

  if (!cssText) {
    el.removeAttribute('style')
  } else {
    style.cssText = cssText
  }

  // 移除旧值中不存在于新值的属性
  if (prev && !isObject(prev)) {
    for (const key in prev) {
      if (!next || !(key in next)) {
        setStyle(style, key, '')
      }
    }
  }

  // 设置新值
  if (next && isObject(next)) {
    for (const key in next) {
      if (!prev || prev[key] !== next[key]) {
        setStyle(style, key, next[key])
      }
    }
  }
}

function setStyle(style: CSSStyleDeclaration, name: string, val: string): void {
  // 处理浏览器前缀
  if (name[0] === '-') {
    style.setProperty(name, val)
  } else {
    style[name as any] = val
  }
}
```

### events

```typescript
// packages/runtime-dom/src/modules/events.ts

export function patchEvent(
  el: Element & { _vei?: Record<string, EventInvoker | undefined> },
  rawName: string,
  prevValue: EventValue | null,
  nextValue: EventValue | null,
  instance: ComponentInternalInstance | null = null
): void {
  // 缓存的事件处理器
  const invokers = el._vei || (el._vei = {})

  // 解析事件名（onClick -> click）
  const name = parseName(rawName)

  // 获取现有的 invoker
  const existingInvoker = invokers[rawName]

  if (nextValue && existingInvoker) {
    // 更新：只替换 value
    existingInvoker.value = nextValue
  } else {
    // 添加或移除
    const [name, options] = parseName(rawName)

    if (nextValue) {
      // 添加事件
      const invoker = (invokers[rawName] = createInvoker(nextValue, instance))
      el.addEventListener(name, invoker, options)
    } else if (existingInvoker) {
      // 移除事件
      el.removeEventListener(name, existingInvoker, options)
      invokers[rawName] = undefined
    }
  }
}

// 创建事件包装器
function createInvoker(
  initialValue: EventValue,
  instance: ComponentInternalInstance | null
): EventInvoker {
  const invoker: EventInvoker = (e: Event) => {
    // 调用实际的事件处理器
    const value = invoker.value
    if (isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        callWithAsyncErrorHandling(value[i], instance, e)
      }
    } else {
      callWithAsyncErrorHandling(value, instance, e)
    }
  }
  invoker.value = initialValue
  return invoker
}
```

### props

```typescript
// packages/runtime-dom/src/modules/props.ts

export function patchDOMProp(
  el: any,
  key: string,
  value: any,
  prevChildren: any,
  parentComponent: any,
  parentSuspense: any,
  unmountChildren: any
): void {
  if (key === 'innerHTML' || key === 'textContent') {
    // 特殊处理 innerHTML 和 textContent
    if (prevChildren) {
      unmountChildren(prevChildren, parentComponent, parentSuspense)
    }
    el[key] = value == null ? '' : value
    return
  }

  if (key === 'value') {
    // 特殊处理 value
    el.value = value == null ? '' : value
    return
  }

  if (key === 'checked' || key === 'selected') {
    // 布尔属性
    el[key] = value
    return
  }

  // 直接设置 DOM property
  if (key in el) {
    el[key] = value == null ? '' : value
  }
}
```

### attrs

```typescript
// packages/runtime-dom/src/modules/attrs.ts

export function patchAttr(
  el: Element,
  key: string,
  value: any,
  isSVG: boolean
): void {
  if (isSVG) {
    // SVG 属性
    if (value == null) {
      el.removeAttribute(key)
    } else {
      el.setAttribute(key, value)
    }
  } else {
    // HTML 属性
    if (value == null) {
      el.removeAttribute(key)
    } else {
      el.setAttribute(key, value)
    }
  }
}
```

## shouldSetAsProp

判断是否应该作为 DOM property 设置。

```typescript
function shouldSetAsProp(
  el: Element,
  key: string,
  value: any,
  isSVG: boolean
): boolean {
  if (isSVG) {
    // SVG 使用 setAttribute
    return key === 'innerHTML' || key === 'textContent'
  }

  // 这些属性应该用 setAttribute
  if (key === 'spellcheck' || key === 'draggable' || key === 'translate') {
    return false
  }

  // 表单元素的特殊属性
  if (key === 'form') {
    return false
  }

  // 判断是否存在对应的 DOM property
  return key in el
}
```

## 创建浏览器渲染器

```typescript
// packages/runtime-dom/src/index.ts

import { createRenderer } from '@vue/runtime-core'
import { nodeOps } from './nodeOps'
import { patchProp } from './patchProp'

const rendererOptions = {
  ...nodeOps,
  patchProp
}

let renderer: Renderer<Element> | undefined

function ensureRenderer() {
  return (
    renderer ||
    (renderer = createRenderer<Node, Element>(rendererOptions))
  )
}

export const createApp = (...args: any[]) => {
  const app = ensureRenderer().createApp(...args)

  const { mount } = app
  app.mount = (containerOrSelector) => {
    const container = normalizeContainer(containerOrSelector)
    if (!container) return

    const component = app._component
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML
    }

    container.innerHTML = ''
    return mount(container)
  }

  return app
}

export const render = (...args: any[]) => {
  ensureRenderer().render(...args)
}
```

## 自定义渲染器

Vue 允许创建自定义渲染器来适配不同平台。

```typescript
import { createRenderer } from 'vue'

// Canvas 渲染器
const { render, createApp } = createRenderer({
  createElement(tag) {
    // 创建 Canvas 元素
  },
  insert(child, parent) {
    // 插入到父元素
  },
  patchProp(el, key, prevValue, nextValue) {
    // 更新属性
  },
  // ...
})

// WebGL 渲染器
const webglRenderer = createRenderer({
  createElement(tag) {
    // 创建 WebGL 对象
  },
  // ...
})
```

## 总结

DOM 适配层的核心功能：

| 模块 | 功能 |
|------|------|
| nodeOps | DOM 节点操作 |
| patchProp | 属性更新分发 |
| class | class 属性处理 |
| style | style 属性处理 |
| events | 事件处理 |
| props | DOM property 处理 |
| attrs | HTML attribute 处理 |

通过抽象 DOM 操作，Vue 实现了：
1. **跨平台**：可以渲染到不同平台
2. **可测试**：可以在 Node.js 环境中测试
3. **可扩展**：可以创建自定义渲染器

## 总结

恭喜你完成了 mini-vue 的学习！现在你已经掌握了：

1. **响应式系统**：reactive、ref、computed、watch 的实现原理
2. **编译器**：模板解析、AST 转换、代码生成的完整流程
3. **运行时**：虚拟 DOM、渲染器、组件系统的核心机制

通过学习 mini-vue，你可以更深入地理解 Vue 3 的设计思想和实现细节，这将帮助你在实际开发中更好地使用 Vue。