# Transformer 转换器原理详解

Transformer（转换器）是 Vue3 编译器的第二阶段，负责将解析阶段生成的 AST 转换为 JavaScript AST（用于代码生成）。本文档基于 mini-vue 的实现，详细解析转换器的工作原理。

## 核心文件

- `packages/compiler-core/src/transform.ts` - 转换框架
- `packages/compiler-core/src/transforms/transformElement.ts` - 元素转换
- `packages/compiler-core/src/transforms/transformText.ts` - 文本转换
- `packages/compiler-core/src/transforms/vIf.ts` - v-if 指令转换

## 整体架构

```
Parser AST → Transformer → JavaScript AST (Codegen AST)
```

转换阶段对 AST 进行优化和结构重组，为最终生成渲染函数代码做准备。

## 核心数据结构

### TransformContext（转换上下文）

```typescript
export interface TransformContext {
  root                    // AST 根节点
  parent: ParentNode | null  // 父节点
  childIndex: number     // 当前节点在父节点中的索引
  currentNode             // 当前正在处理的节点
  helpers: Map<symbol, number>  // 帮助函数使用统计
  nodeTransforms: any[]  // 转换函数数组
  replaceNode(node)       // 替换当前节点的方法
}
```

关键方法：
- `helper(name)`: 注册需要使用的帮助函数
- `replaceNode(node)`: 将当前节点替换为新节点

## 转换流程

### 1. 入口函数：transform

```typescript
export function transform(root, options) {
  // 1. 创建转换上下文
  const context = createTransformContext(root, options)

  // 2. 深度优先遍历转换节点
  traverseNode(root, context)

  // 3. 生成根节点的 codegen
  createRootCodegen(root)

  // 4. 收集使用的帮助函数
  root.helpers = [...context.helpers.keys()]
}
```

### 2. 核心遍历算法：深度优先 + 双阶段处理

```typescript
export function traverseNode(node, context: TransformContext) {
  // === 阶段1：进入节点 ===
  context.currentNode = node
  const { nodeTransforms } = context
  const exitFns: any = []

  // 收集所有转换函数到 exitFns
  for (let i = 0; i < nodeTransforms.length; i++) {
    const onExit = nodeTransforms[i](node, context)
    if (onExit) {
      if (isArray(onExit)) {
        exitFns.push(...onExit)
      } else {
        exitFns.push(onExit)
      }
    }
    // 处理节点替换的情况
    if (!context.currentNode) {
      return
    } else {
      node = context.currentNode
    }
  }

  // === 阶段2：遍历子节点 ===
  switch (node.type) {
    case NodeTypes.IF_BRANCH:
    case NodeTypes.ELEMENT:
    case NodeTypes.ROOT:
      traverseChildren(node, context)
      break
    case NodeTypes.INTERPOLATION:
      context.helper(TO_DISPLAY_STRING)
      break
    case NodeTypes.IF:
      for (let i = 0; i < node.branches.length; i++) {
        traverseNode(node.branches[i], context)
      }
      break
  }

  // === 阶段3：退出节点（倒序执行）===
  context.currentNode = node
  let i = exitFns.length
  while (i--) {
    exitFns[i]()
  }
}
```

**为什么需要双阶段处理？**

因为子节点的状态可能影响父节点的转换结果：
- 例如 `v-if` 指令：需要先处理子节点，才能确定最终的 codegen 形式

**为什么退出阶段要倒序执行？**

确保深度优先顺序（孙→子→父）：
```
<div>
  <span>{{ msg }}</span>
</div>

执行顺序：
1. 进入 <div>
2. 进入 <span>
3. 处理 {{ msg }}
4. 退出 <span>
5. 退出 <div>
```

### 3. 注册的转换函数

在 `compile.ts` 中配置：

```typescript
transform(
  ast,
  extend(options, {
    nodeTransforms: [transformElement, transformText, transformIf]
  })
)
```

## 各转换器详解

### 1. transformElement（元素转换）

将元素节点转换为 VNode 调用：

```typescript
export const transformElement = (node, context) => {
  return function postTransformElement() {
    node = context.currentNode!

    if (node.type !== NodeTypes.ELEMENT) {
      return
    }

    const { tag } = node

    let vnodeTag = `"${tag}"`
    let vnodeProps = []
    let vnodeChildren = node.children

    // 创建 VNode 调用节点
    node.codegenNode = createVNodeCall(
      context,
      vnodeTag,
      vnodeProps,
      vnodeChildren
    )
  }
}
```

转换结果：
```
// 输入
<div></div>

// 输出 AST
{
  type: NodeTypes.VNODE_CALL,
  tag: '"div"',
  props: [],
  children: []
}

// 最终生成的代码
createElementVNode("div", null, [])
```

### 2. transformText（文本转换）

将相邻的文本节点和插值表达式合并为复合表达式：

```typescript
export const transformText = (node, context) => {
  if (
    node.type === NodeTypes.ROOT ||
    node.type === NodeTypes.ELEMENT ||
    node.type === NodeTypes.FOR ||
    node.type === NodeTypes.IF_BRANCH
  ) {
    return () => {
      const children = node.children
      let currentContainer

      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (isText(child)) {
          for (let j = i + 1; j < children.length; j++) {
            const next = children[j]
            if (isText(next)) {
              // 合并相邻文本节点
              if (!currentContainer) {
                currentContainer = children[i] = createCompoundExpression(
                  [child],
                  child.loc
                )
              }
              // 添加连接符
              currentContainer.children.push(` + `, next)
              children.splice(j, 1)
              j--
            } else {
              currentContainer = undefined
              break
            }
          }
        }
      }
    }
  }
}
```

转换示例：
```
// 输入
<div>hello {{ msg }} world</div>

// children 原始结构
[
  { type: TEXT, content: "hello " },
  { type: INTERPOLATION, content: { content: "msg" } },
  { type: TEXT, content: " world" }
]

// 转换后
{
  type: COMPOUND_EXPRESSION,
  children: [
    "hello ",
    TO_DISPLAY_STRING(msg),
    " world"
  ]
}

// 生成的代码
"hello " + toDisplayString(msg) + " world"
```

### 3. transformIf（v-if 指令转换）

将 v-if 指令转换为条件表达式：

```typescript
export const transformIf = createStructuralDirectiveTransform(
  /^(if|else|else-if)$/,
  (node, dir, context) => {
    return processIf(node, dir, context, (ifNode, branch, isRoot) => {
      return () => {
        if (isRoot) {
          ifNode.codegenNode = createCodegenNodeForBranch(branch, key, context)
        }
      }
    })
  }
)
```

**核心逻辑**：

1. 创建 IF 节点（条件容器）
2. 创建 IF_BRANCH 节点（条件分支）
3. 用条件表达式替换原节点

```typescript
function processIf(node, dir, context, processCodegen) {
  if (dir.name === 'if') {
    // 创建分支节点
    const branch = createIfBranch(node, dir)

    // 创建 if 容器节点
    const ifNode = {
      type: NodeTypes.IF,
      loc: node.loc,
      branches: [branch]
    }

    // 替换当前节点为 ifNode
    context.replaceNode(ifNode)

    if (processCodegen) {
      return processCodegen(ifNode, branch, true)
    }
  }
}
```

转换结果：
```
// 输入
<h1 v-if="show">Title</h1>

// 转换后
{
  type: NodeTypes.IF,
  branches: [
    {
      type: NodeTypes.IF_BRANCH,
      condition: { type: SIMPLE_EXPRESSION, content: "show" },
      children: [{ type: ELEMENT, tag: "h1" ... }]
    }
  ],
  codegenNode: {
    type: JS_CONDITIONAL_EXPRESSION,
    test: "show",
    consequent: createElementVNode("h1", null, "Title"),
    alternate: createCommentVNode("v-if")
  }
}

// 生成的代码
show ? createElementVNode("h1", null, "Title") : createCommentVNode("v-if", true)
```

## 帮助函数系统

转换阶段会注册渲染函数需要的帮助函数：

### runtimeHelpers.ts

```typescript
export const CREATE_ELEMENT_VNODE = Symbol('createElementVNode')
export const CREATE_VNODE = Symbol('createVNode')
export const TO_DISPLAY_STRING = Symbol('toDisplayString')
export const CREATE_COMMENT = Symbol('createCommentVNode')

export const helperNameMap = {
  [CREATE_ELEMENT_VNODE]: 'createElementVNode',
  [CREATE_VNODE]: 'createVNode',
  [TO_DISPLAY_STRING]: 'toDisplayString',
  [CREATE_COMMENT]: 'createCommentVNode'
}
```

### 注册帮助函数

```typescript
// 转换元素时
context.helper(CREATE_ELEMENT_VNODE)

// 转换插值表达式时
context.helper(TO_DISPLAY_STRING)

// 转换 v-if 的 else 分支时
context.helper(CREATE_COMMENT)
```

在代码生成阶段，会根据 `helpers` 集合生成帮助函数的导入语句。

## createRootCodegen

转换完成后，需要为根节点生成最终的 codegenNode：

```typescript
function createRootCodegen(root) {
  const { children } = root

  // 仅支持一个根节点的处理
  if (children.length === 1) {
    const child = children[0]
    if (isSingleElementRoot(root, child) && child.codegenNode) {
      const codegenNode = child.codegenNode
      root.codegenNode = codegenNode
    }
  }
}
```

## 节点类型转换对照

| Parser AST 节点类型 | Transform 后 Codegen AST 类型 |
|---------------------|------------------------------|
| ELEMENT | VNODE_CALL |
| TEXT | TEXT（保持） |
| INTERPOLATION | JS_CALL_EXPRESSION (toDisplayString) |
| IF_BRANCH | 保留，进入 IF 容器 |
| 多个相邻 TEXT/INTERPOLATION | COMPOUND_EXPRESSION |

## 总结

Transformer 阶段的核心工作机制：

1. **深度优先遍历**：确保子节点先于父节点处理
2. **双阶段处理**：
   - 进入阶段：收集转换函数
   - 退出阶段：执行转换（倒序）
3. **节点替换**：通过 `replaceNode` 可以完全替换节点
4. **帮助函数注册**：记录代码生成需要的辅助函数

转换后的 JavaScript AST 将传递给 Codegen 阶段生成最终的渲染函数代码。
