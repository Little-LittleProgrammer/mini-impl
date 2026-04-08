# Transformer 转换器原理

## 什么是 Transformer？

Transformer（转换器）负责将 AST 转换为 JavaScript AST。在这个过程中，会应用各种转换插件来优化代码。

```typescript
// 输入：原始 AST
const ast = parse('<div>{{ msg }}</div>')

// 转换后的 JavaScript AST
transform(ast, options)
```

## 转换流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        转换流程                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  原始 AST                                                        │
│      │                                                           │
│      ▼                                                           │
│  创建转换上下文                                                   │
│      │                                                           │
│      ▼                                                           │
│  深度优先遍历（进入阶段）                                          │
│      │                                                           │
│      ├── 应用转换插件，收集退出函数                                │
│      │                                                           │
│      ▼                                                           │
│  递归处理子节点                                                   │
│      │                                                           │
│      ▼                                                           │
│  深度优先遍历（退出阶段）                                          │
│      │                                                           │
│      └── 倒序执行退出函数                                         │
│                                                                  │
│      │                                                           │
│      ▼                                                           │
│  JavaScript AST                                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 转换上下文

```typescript
// packages/compiler-core/src/transform.ts

interface TransformContext {
  // 根节点
  root: RootNode

  // 转换选项
  options: TransformOptions

  // 父节点栈
  parent: TemplateChildNode | null
  ancestors: TemplateChildNode[]

  // 当前节点索引
  childIndex: number

  // 帮助函数集合
  helpers: Set<Symbol>

  // 作用域
  scopes: Scope[]

  // 当前作用域变量
  identifiers: { [name: string]: number }

  // 是否为 SSR
  ssr: boolean
}
```

### 创建上下文

```typescript
export function createTransformContext(
  root: RootNode,
  options: TransformOptions
): TransformContext {
  return {
    root,
    options,
    parent: null,
    ancestors: [],
    childIndex: 0,
    helpers: new Set(),
    scopes: [{}],
    identifiers: {},
    ssr: false
  }
}
```

## transform 函数

```typescript
export function transform(root: RootNode, options: TransformOptions) {
  // 创建转换上下文
  const context = createTransformContext(root, options)

  // 遍历 AST
  traverseNode(root, context)

  // 创建根节点的 codegenNode
  createRootCodegen(root)

  // 收集帮助函数
  root.helpers = [...context.helpers.keys()]
}
```

## 深度优先遍历

### traverseNode

```typescript
export function traverseNode(
  node: RootNode | TemplateChildNode,
  context: TransformContext
) {
  // 进入阶段
  const { nodeTransforms } = context.options

  // 保存退出函数
  const exitFns: (() => void)[] = []

  // 执行所有转换插件
  for (let i = 0; i < nodeTransforms.length; i++) {
    const onExit = nodeTransforms[i](node, context)
    if (onExit) {
      exitFns.push(onExit)
    }
  }

  // 根据节点类型处理子节点
  switch (node.type) {
    case NodeTypes.ROOT:
    case NodeTypes.ELEMENT:
      traverseChildren(node, context)
      break

    case NodeTypes.INTERPOLATION:
      // 插值表达式需要 toDisplayString 帮助函数
      context.helper(TO_DISPLAY_STRING)
      break

    // 其他节点类型...
  }

  // 退出阶段：倒序执行退出函数
  let i = exitFns.length
  while (i--) {
    exitFns[i]()
  }
}
```

### traverseChildren

```typescript
export function traverseChildren(
  parent: RootNode | ElementNode,
  context: TransformContext
) {
  const children = parent.children

  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    // 更新上下文
    context.parent = parent
    context.childIndex = i
    context.ancestors.push(parent)

    // 递归遍历
    traverseNode(child, context)

    // 恢复上下文
    context.ancestors.pop()
  }
}
```

### 进入/退出模式

这种设计允许转换插件在两个时机处理节点：

```typescript
// 转换插件
const myTransform = (node, context) => {
  // 进入阶段：子节点还未处理
  console.log('enter:', node.type)

  // 返回退出函数
  return () => {
    // 退出阶段：子节点已处理完毕
    console.log('exit:', node.type)
  }
}

// 执行顺序
// enter: ROOT
//   enter: ELEMENT (div)
//     enter: TEXT
//     exit: TEXT
//   exit: ELEMENT (div)
// exit: ROOT
```

## 转换插件

### transformElement

将元素节点转换为 `createElementVNode` 调用。

```typescript
// packages/compiler-core/src/transforms/transformElement.ts

export const transformElement: NodeTransform = (node, context) => {
  // 只处理元素节点
  if (node.type !== NodeTypes.ELEMENT) return

  // 返回退出函数，在子节点处理完后执行
  return function postTransformElement() {
    const { tag, props, children } = node

    // 1. 处理标签
    const vnodeTag = tag

    // 2. 处理属性
    let vnodeProps: PropsExpression | undefined
    if (props.length > 0) {
      vnodeProps = buildProps(node, context)
    }

    // 3. 处理子节点
    let vnodeChildren: VNodeCall['children']
    if (children.length === 1) {
      const child = children[0]
      if (child.type === NodeTypes.TEXT) {
        // 单个文本子节点
        vnodeChildren = child
      } else if (child.type === NodeTypes.INTERPOLATION) {
        // 单个插值子节点
        vnodeChildren = child
      } else {
        // 其他情况作为数组处理
        vnodeChildren = children
      }
    } else if (children.length > 1) {
      // 多个子节点
      vnodeChildren = children
    }

    // 4. 创建 VNodeCall
    node.codegenNode = createVNodeCall(
      context,
      vnodeTag,
      vnodeProps,
      vnodeChildren
    )
  }
}
```

### createVNodeCall

```typescript
export function createVNodeCall(
  context: TransformContext | null,
  tag: VNodeCall['tag'],
  props?: VNodeCall['props'],
  children?: VNodeCall['children'],
  patchFlag?: VNodeCall['patchFlag'],
  dynamicProps?: VNodeCall['dynamicProps'],
  directives?: VNodeCall['directives'],
  isBlock: boolean = false
): VNodeCall {
  // 添加帮助函数
  if (context) {
    context.helper(CREATE_ELEMENT_VNODE)
  }

  return {
    type: NodeTypes.VNODE_CALL,
    tag,
    props,
    children,
    patchFlag,
    dynamicProps,
    directives,
    isBlock
  }
}
```

### transformText

合并相邻的文本节点和插值表达式。

```typescript
// packages/compiler-core/src/transforms/transformText.ts

export const transformText: NodeTransform = (node, context) => {
  // 只处理元素和根节点
  if (node.type !== NodeTypes.ELEMENT && node.type !== NodeTypes.ROOT) {
    return
  }

  // 检查子节点是否有需要合并的
  const children = node.children
  let currentContainer: InterpolationNode | undefined

  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    if (isText(child)) {
      // 查找连续的文本/插值节点
      for (let j = i + 1; j < children.length; j++) {
        const next = children[j]
        if (isText(next)) {
          // 合并到当前容器
          if (!currentContainer) {
            currentContainer = children[i] = {
              type: NodeTypes.COMPOUND_EXPRESSION,
              children: [child]
            }
          }

          // 添加加号连接
          currentContainer.children.push(' + ', next)

          // 删除已合并的节点
          children.splice(j, 1)
          j--
        } else {
          // 遇到非文本节点，停止合并
          currentContainer = undefined
          break
        }
      }
    }
  }
}
```

### 示例：文本合并

```typescript
// 输入模板
<div>hello {{ name }}!</div>

// 转换前 AST
{
  type: NodeTypes.ELEMENT,
  children: [
    { type: NodeTypes.TEXT, content: 'hello ' },
    { type: NodeTypes.INTERPOLATION, content: { content: 'name' } },
    { type: NodeTypes.TEXT, content: '!' }
  ]
}

// 转换后 AST
{
  type: NodeTypes.ELEMENT,
  children: [
    {
      type: NodeTypes.COMPOUND_EXPRESSION,
      children: [
        { type: NodeTypes.TEXT, content: 'hello ' },
        ' + ',
        { type: NodeTypes.INTERPOLATION, content: { content: 'name' } },
        ' + ',
        { type: NodeTypes.TEXT, content: '!' }
      ]
    }
  ]
}
```

### vIf 转换

将 `v-if` 指令转换为条件表达式。

```typescript
// packages/compiler-core/src/transforms/vIf.ts

export const transformIf = (node, context) => {
  if (node.type !== NodeTypes.ELEMENT) return

  // 查找 v-if 指令
  const dir = findDir(node, 'if')
  if (!dir) return

  // 移除 v-if 指令
  node.props.splice(node.props.indexOf(dir), 1)

  // 获取条件表达式
  const condition = dir.exp

  // 处理 v-else-if 和 v-else
  let alternate
  const siblings = context.parent!.children
  const siblingIndex = siblings.indexOf(node)

  for (let i = siblingIndex + 1; i < siblings.length; i++) {
    const sibling = siblings[i]
    if (sibling.type === NodeTypes.ELEMENT) {
      const elseIfDir = findDir(sibling, 'else-if')
      const elseDir = findDir(sibling, 'else')

      if (elseIfDir) {
        // 处理 v-else-if
        siblings.splice(i, 1)
        i--
        alternate = processIf(sibling, elseIfDir.exp, context)
      } else if (elseDir) {
        // 处理 v-else
        siblings.splice(i, 1)
        i--
        alternate = processIf(sibling, null, context)
        break
      } else {
        break
      }
    }
  }

  // 创建条件表达式
  node.codegenNode = createConditionalExpression(
    condition,
    processIf(node),
    alternate
  )
}
```

### vFor 转换

将 `v-for` 指令转换为 `renderList` 调用。

```typescript
export const transformFor = (node, context) => {
  if (node.type !== NodeTypes.ELEMENT) return

  const dir = findDir(node, 'for')
  if (!dir) return

  // 解析 v-for 表达式
  // "item in items" 或 "(item, index) in items"
  const parseResult = parseForExpression(dir.exp)

  if (!parseResult) return

  const { source, value, key, index } = parseResult

  // 创建 renderList 调用
  node.codegenNode = createVNodeCall(
    context,
    node.tag,
    node.props,
    createCallExpression(context.helper(RENDER_LIST), [
      source,
      createFunctionExpression([value, key, index], node.children)
    ])
  )
}
```

## 属性处理

### buildProps

```typescript
function buildProps(
  node: ElementNode,
  context: TransformContext
): PropsExpression {
  const { props } = node
  const properties: ObjectExpression['properties'] = []
  const runtimeDirectives: DirectiveNode[] = []

  for (const prop of props) {
    if (prop.type === NodeTypes.ATTRIBUTE) {
      // 普通属性
      const { name, value } = prop
      properties.push({
        type: NodeTypes.JS_PROPERTY,
        key: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: name,
          isStatic: true
        },
        value: value || createSimpleExpression('true', false)
      })
    } else if (prop.type === NodeTypes.DIRECTIVE) {
      // 指令
      const { name, arg, exp } = prop

      if (name === 'bind') {
        // v-bind 或 :
        properties.push({
          type: NodeTypes.JS_PROPERTY,
          key: arg,
          value: exp
        })
      } else if (name === 'on') {
        // v-on 或 @
        properties.push({
          type: NodeTypes.JS_PROPERTY,
          key: {
            type: NodeTypes.SIMPLE_EXPRESSION,
            content: 'on' + capitalize(arg.content),
            isStatic: true
          },
          value: exp
        })
      } else {
        // 其他指令
        runtimeDirectives.push(prop)
      }
    }
  }

  // 创建对象表达式
  let propsExpression: PropsExpression = {
    type: NodeTypes.JS_OBJECT_EXPRESSION,
    properties
  }

  // 如果有运行时指令，包装 withDirectives
  if (runtimeDirectives.length > 0) {
    context.helper(WITH_DIRECTIVES)
    propsExpression = createCallExpression(context.helper(WITH_DIRECTIVES), [
      propsExpression,
      createArrayExpression(runtimeDirectives.map(dir => {
        return createArrayExpression([
          context.helper(resolveDirectiveName(dir.name)),
          dir.exp,
          dir.arg
        ])
      }))
    ])
  }

  return propsExpression
}
```

## PatchFlags

PatchFlags 是一种优化策略，用于标记节点的动态部分。

```typescript
export const enum PatchFlags {
  TEXT = 1,           // 动态文本内容
  CLASS = 2,          // 动态 class
  STYLE = 4,          // 动态 style
  PROPS = 8,          // 动态属性（非 class/style）
  FULL_PROPS = 16,    // 有动态 key 的属性
  HYDRATE_EVENTS = 32, // 有事件监听器
  STABLE_FRAGMENT = 64, // 稳定的 fragment
  KEYED_FRAGMENT = 128, // 有 key 的 fragment
  UNKEYED_FRAGMENT = 256, // 无 key 的 fragment
  NEED_PATCH = 512,   // 需要非 props 比较
  DYNAMIC_SLOTS = 1024, // 动态插槽
  HOISTED = -1,       // 静态提升的节点
  BAIL = -2           // 退出优化模式
}
```

### 使用示例

```typescript
// 模板
<div class="static">{{ msg }}</div>

// 生成的 VNodeCall
{
  type: NodeTypes.VNODE_CALL,
  tag: 'div',
  props: { class: 'static' },
  children: { type: NodeTypes.INTERPOLATION, content: 'msg' },
  patchFlag: PatchFlags.TEXT  // 标记动态文本
}
```

## 总结

Transformer 的核心功能：

| 功能 | 说明 |
|------|------|
| AST 遍历 | 深度优先遍历，支持进入/退出两阶段处理 |
| 转换插件 | 模块化的转换逻辑 |
| JavaScript AST | 生成便于代码生成的中间表示 |
| 优化标记 | PatchFlags 标记动态部分 |
| 帮助函数 | 收集运行时需要的帮助函数 |

## 下一步

- [Codegen 代码生成器原理](./Codegen代码生成器原理.md)：了解如何生成渲染函数代码