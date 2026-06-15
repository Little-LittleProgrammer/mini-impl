# DOM 适配层

`runtime-dom` 把平台无关的 `runtime-core` 落到浏览器 DOM。它的核心价值是：让 renderer 只依赖 host 操作，而不是直接依赖 `document`。

## 源码入口

- `packages/mini-vue/packages/runtime-dom/src/index.ts`
- `packages/mini-vue/packages/runtime-dom/src/nodeOps.ts`
- `packages/mini-vue/packages/runtime-dom/src/patchProp.ts`
- `packages/mini-vue/packages/runtime-dom/src/modules/class.ts`
- `packages/mini-vue/packages/runtime-dom/src/modules/style.ts`
- `packages/mini-vue/packages/runtime-dom/src/modules/events.ts`
- `packages/mini-vue/packages/runtime-dom/src/modules/props.ts`
- `packages/mini-vue/packages/runtime-dom/src/modules/attrs.ts`

## rendererOptions

`runtime-dom/src/index.ts` 中：

```text
rendererOptions = extend({ patchProp }, nodeOps)
ensureRenderer() -> createRenderer(rendererOptions)
```

这意味着 DOM renderer 由两类能力组成：

- 节点操作：`nodeOps`
- 属性操作：`patchProp`

## nodeOps

`nodeOps` 提供：

- `insert(child, parent, anchor)`
- `createElement(tag)`
- `setElementText(el, text)`
- `remove(child)`
- `createText(text)`
- `setText(node, text)`
- `createComment(text)`

这些函数是 `runtime-core` 渲染器实际调用的 host API。

## patchProp

属性更新按顺序分发：

```text
key === 'class'
  -> patchClass
key === 'style'
  -> patchStyle
isOn(key)
  -> patchEvent
shouldSetAsProp(el, key)
  -> patchDOMProp
else
  -> patchAttr
```

`isOn` 来自 shared，匹配 `onXxx` 事件名。

## class

class 处理由 `patchClass` 完成。VNode 创建阶段还会通过 `normalizeClass` 把非字符串 class 规范化。

## style

`patchStyle` 当前主要处理对象样式：

```text
遍历 next，写入新样式
遍历 prev，如果 next 中没有旧 key，清空旧样式
```

它没有完整覆盖字符串样式、CSS 变量、自动前缀、`!important` 等完整 Vue 逻辑。

## event

事件模块使用 invoker 缓存：

```text
el._vei[rawName] = invoker
```

新增事件：

```text
createInvoker(nextValue)
addEventListener(name, invoker)
```

更新事件：

```text
existingInvoker.value = nextValue
```

删除事件：

```text
removeEventListener(name, existingInvoker)
invokers[rawName] = undefined
```

这样事件回调变更时不用反复移除和绑定 listener。

## DOM prop 和 attribute

`shouldSetAsProp` 会排除一些必须走 attribute 的情况，例如：

- `spellcheck`
- `draggable`
- `translate`
- `form`
- `input[list]`
- `textarea[type]`

其余如果 `key in el`，走 DOM property，否则走 attribute。

## createApp 的 DOM 包装

`runtime-dom` 重写了 app 的 `mount/unmount`：

```text
app.mount(containerOrSelector)
  -> normalizeContainer
  -> runtime-core mount(container)
```

这让用户可以传 `'#app'` 字符串，也可以直接传 DOM Element。

## 当前边界

- 没有 SVG/MathML namespace 处理。
- 没有完整 form value/checked/selected 细节。
- 没有事件 option、时间戳、防冒泡等完整处理。
- style 处理较窄。
- 没有 hydration 相关 DOM 操作。

DOM 适配层的重点是展示 host API 注入模型，而不是覆盖浏览器所有边缘行为。
