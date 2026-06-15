# VNode 与渲染器

这一篇解释从 VNode 到 DOM 的主线：`createVNode`、`render`、`patch`、元素挂载、children diff。

## VNode 是什么

`VNode` 是真实 DOM 或组件的轻量描述：

```ts
export interface VNode {
  __v_isVNode: true
  key: any
  type: any
  props: any
  children: any
  shapeFlag: number
}
```

`createVNode` 根据 `type` 和 `children` 填充 `shapeFlag`：

- `type` 是字符串：元素。
- `type` 是对象：状态组件。
- `children` 是数组：数组子节点。
- `children` 是其他可显示值：文本子节点。

## `render(vnode, container)`

`render` 会把当前 vnode 缓存在容器上：

```text
render(vnode, container)
  -> vnode == null 时卸载 container._vnode
  -> vnode != null 时 patch(container._vnode || null, vnode, container)
  -> container._vnode = vnode
```

这让下一次 render 能拿到旧 VNode 参与 diff。

## `patch`

`patch` 是渲染器的总分发函数：

```text
patch(oldVNode, newVNode, container, anchor)
  -> 如果完全相同，返回
  -> 如果 type/key 不同，卸载旧节点
  -> 根据 newVNode.type 或 shapeFlag 分发
```

相同 VNode 的判断是：

```ts
n1.type === n2.type && n1.key === n2.key
```

## 元素挂载

`mountElement` 的顺序：

```text
hostCreateElement(type)
  -> 处理文本 children 或数组 children
  -> 遍历 props，hostPatchProp(el, key, null, value)
  -> hostInsert(el, container, anchor)
```

数组 children 会先通过 `normalizeVNode` 转成 VNode，再递归 patch。

## 元素更新

`patchElement` 的顺序：

```text
复用 oldVNode.el
  -> patchChildren(oldVNode, newVNode, el, null)
  -> patchProps(el, newVNode, oldProps, newProps)
```

props 更新分两步：

1. 遍历新 props，值不同则 patch。
2. 遍历旧 props，新 props 中不存在则删除。

## children diff

当新旧 children 都是数组时，会进入 `patchKeyedChildren`。

它的主干分为五步：

```text
1. 从前往后同步相同节点
2. 从后往前同步相同节点
3. 新节点多于旧节点：挂载新增节点
4. 旧节点多于新节点：卸载多余旧节点
5. 乱序区：key 映射 + patch + 最长递增子序列移动
```

乱序区的关键数据结构：

- `keyToNewIndexMap`：新节点 key 到新索引。
- `newIndexToOldIndexMap`：新索引对应的旧索引加一，0 表示新增。
- `increasingNewIndexSequence`：最长递增子序列，用来减少 DOM 移动。

## 为什么需要最长递增子序列

乱序更新时，不是所有节点都要移动。旧索引在新数组中仍保持递增的那部分节点，可以留在原地。

```text
旧顺序: a b c d
新顺序: b a c d
```

`c d` 在相对顺序上仍递增，通常不需要移动。最长递增子序列就是用来找出这部分稳定节点。

## 当前 diff 的不完整点

`patchKeyedChildren` 主干已经存在，但整个 children 更新还不完整：

- 旧数组 -> 新文本时，旧数组卸载还是 TODO。
- 旧数组 -> 空 children 时，旧数组卸载还是 TODO。
- 旧文本 -> 新数组时，挂载新数组还是 TODO。
- `unmount` 只删除 `vnode.el`，没有递归卸载子树。
- Fragment 和组件卸载都没有完整清理。

所以当前 diff 适合理解 Vue keyed diff 的主干，不适合作为完整 renderer 使用。
