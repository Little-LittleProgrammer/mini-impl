# Codegen 代码生成器原理

## 什么是 Codegen？

Codegen（代码生成器）负责将 JavaScript AST 转换为可执行的渲染函数代码字符串。

```typescript
// 输入：JavaScript AST
const ast = transform(parse(template))

// 输出：渲染函数代码
const { code } = generate(ast)
```

## 生成的代码结构

```typescript
// 生成的代码示例
const _Vue = Vue

const { createElementVNode: _createElementVNode, toDisplayString: _toDisplayString } = _Vue

return function render(_ctx, _cache) {
  with (_ctx) {
    return _createElementVNode("div", { class: "app" }, [
      _createElementVNode("h1", null, _toDisplayString(title))
    ])
  }
}
```

## 代码生成上下文

```typescript
// packages/compiler-core/src/codegen.ts

interface CodegenContext {
  // 生成的代码
  code: string

  // AST
  ast: RootNode

  // 缩进级别
  indentLevel: number

  // 行号
  line: number

  // 列号
  column: number

  // 前置代码（帮助函数导入）
  preamble: string

  // 帮助函数映射
  helper: (name: symbol) => string

  // 静态提升的节点
  hoists: HoistExpression[]

  // 作用域栈
  scopes: Scope[]

  // 当前作用域变量
  identifiers: { [name: string]: number }
}
```

### 创建上下文

```typescript
function createCodegenContext(
  ast: RootNode,
  options: CodegenOptions = {}
): CodegenContext {
  return {
    code: '',
    ast,
    indentLevel: 0,
    line: 1,
    column: 1,
    preamble: '',
    helper: (key: symbol) => `_${helperNameMap[key]}`,
    hoists: [],
    scopes: [{}],
    identifiers: {}
  }
}
```

## generate 函数

```typescript
export function generate(
  ast: RootNode,
  options: CodegenOptions = {}
): CodegenResult {
  // 创建上下文
  const context = createCodegenContext(ast, options)

  // 1. 生成前置代码
  genFunctionPreamble(context)

  // 2. 生成渲染函数
  push(`function render(_ctx, _cache) {`)
  indent()
  push(`with (_ctx) {`)
  indent()

  // 3. 生成帮助函数解构
  if (ast.helpers.length > 0) {
    push(`const { ${ast.helpers.map(aliasHelper).join(', ')} } = _Vue`)
  }

  // 4. 生成 return 语句
  push(`return `)
  if (ast.codegenNode) {
    genNode(ast.codegenNode, context)
  } else {
    push(`null`)
  }

  deindent()
  push(`}`)
  deindent()
  push(`}`)

  return {
    ast,
    code: context.code
  }
}
```

## 辅助函数

### push

```typescript
function push(code: string, context: CodegenContext): void {
  context.code += code

  // 更新行号和列号
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10) { // \n
      context.line++
      context.column = 0
    } else {
      context.column++
    }
  }
}
```

### indent / deindent

```typescript
function indent(context: CodegenContext): void {
  context.indentLevel++
  push('\n' + `  `.repeat(context.indentLevel), context)
}

function deindent(context: CodegenContext, withoutNewLine = false): void {
  context.indentLevel--
  if (!withoutNewLine) {
    push('\n' + `  `.repeat(context.indentLevel), context)
  }
}
```

### newline

```typescript
function newline(context: CodegenContext): void {
  push('\n' + `  `.repeat(context.indentLevel), context)
}
```

## 生成前置代码

```typescript
function genFunctionPreamble(context: CodegenContext): void {
  const { helpers } = context.ast

  if (helpers.length > 0) {
    // 生成帮助函数导入
    push(`const _Vue = Vue\n\n`, context)

    // 生成帮助函数解构
    const helperNames = helpers.map(h => `${helperNameMap[h]}: _${helperNameMap[h]}`)
    push(`const { ${helperNames.join(', ')} } = _Vue\n\n`, context)
  }

  // return 关键字
  push(`return `, context)
}
```

## genNode 核心逻辑

```typescript
function genNode(node: TemplateChildNode | JSChildNode, context: CodegenContext): void {
  switch (node.type) {
    case NodeTypes.ELEMENT:
    case NodeTypes.VNODE_CALL:
      genVNodeCall(node, context)
      break

    case NodeTypes.TEXT:
      genText(node, context)
      break

    case NodeTypes.SIMPLE_EXPRESSION:
      genExpression(node, context)
      break

    case NodeTypes.INTERPOLATION:
      genInterpolation(node, context)
      break

    case NodeTypes.COMPOUND_EXPRESSION:
      genCompoundExpression(node, context)
      break

    case NodeTypes.JS_CALL_EXPRESSION:
      genCallExpression(node, context)
      break

    case NodeTypes.JS_OBJECT_EXPRESSION:
      genObjectExpression(node, context)
      break

    case NodeTypes.JS_ARRAY_EXPRESSION:
      genArrayExpression(node, context)
      break

    case NodeTypes.JS_FUNCTION_EXPRESSION:
      genFunctionExpression(node, context)
      break

    case NodeTypes.JS_CONDITIONAL_EXPRESSION:
      genConditionalExpression(node, context)
      break

    // ...
  }
}
```

## 生成 VNodeCall

```typescript
function genVNodeCall(node: VNodeCall, context: CodegenContext): void {
  const { tag, props, children, patchFlag, dynamicProps, directives, isBlock } = node

  // 如果有指令，包装 withDirectives
  if (directives) {
    push(`withDirectives(`, context)
  }

  // createElementVNode 或 createBlock
  push(isBlock ? `createBlock(` : `createElementVNode(`, context)

  // 生成参数列表
  const args: string[] = []

  // 1. tag
  args.push(JSON.stringify(tag))

  // 2. props
  if (props) {
    args.push(genProps(props, context))
  } else if (children || patchFlag) {
    args.push('null')
  }

  // 3. children
  if (children) {
    args.push(genChildren(children, context))
  } else if (patchFlag) {
    args.push('null')
  }

  // 4. patchFlag
  if (patchFlag) {
    args.push(String(patchFlag))
  }

  // 5. dynamicProps
  if (dynamicProps) {
    args.push(JSON.stringify(dynamicProps))
  }

  push(args.join(', '), context)
  push(`)`, context)

  // 指令参数
  if (directives) {
    push(`, [`, context)
    for (let i = 0; i < directives.length; i++) {
      genDirective(directives[i], context)
      if (i < directives.length - 1) {
        push(`, `, context)
      }
    }
    push(`])`, context)
  }
}
```

## 生成文本节点

```typescript
function genText(node: TextNode, context: CodegenContext): void {
  push(JSON.stringify(node.content), context)
}
```

## 生成插值表达式

```typescript
function genInterpolation(node: InterpolationNode, context: CodegenContext): void {
  const { content } = node

  if (content.isStatic) {
    push(JSON.stringify(content.content), context)
  } else {
    push(`${context.helper(TO_DISPLAY_STRING)}(`, context)
    genNode(content, context)
    push(`)`, context)
  }
}
```

## 生成复合表达式

```typescript
function genCompoundExpression(
  node: CompoundExpressionNode,
  context: CodegenContext
): void {
  for (const child of node.children) {
    if (typeof child === 'string') {
      push(child, context)
    } else if (typeof child === 'symbol') {
      // 处理符号
    } else {
      genNode(child, context)
    }
  }
}
```

## 生成对象表达式

```typescript
function genObjectExpression(node: ObjectExpression, context: CodegenContext): void {
  const { properties } = node

  if (properties.length === 0) {
    push('{}', context)
    return
  }

  push('{ ', context)

  for (let i = 0; i < properties.length; i++) {
    const { key, value } = properties[i]

    // 生成 key
    genNode(key, context)

    push(': ', context)

    // 生成 value
    genNode(value, context)

    if (i < properties.length - 1) {
      push(', ', context)
    }
  }

  push(' }', context)
}
```

## 生成数组表达式

```typescript
function genArrayExpression(node: ArrayExpression, context: CodegenContext): void {
  const { elements } = node

  push('[', context)

  for (let i = 0; i < elements.length; i++) {
    genNode(elements[i], context)

    if (i < elements.length - 1) {
      push(', ', context)
    }
  }

  push(']', context)
}
```

## 生成函数表达式

```typescript
function genFunctionExpression(
  node: FunctionExpression,
  context: CodegenContext
): void {
  const { params, returns, body } = node

  push('(', context)

  // 生成参数
  if (params) {
    const paramNames = params.map(p => {
      if (p.type === NodeTypes.SIMPLE_EXPRESSION) {
        return p.content
      }
      return ''
    }).filter(Boolean)

    push(paramNames.join(', '), context)
  }

  push(') => ', context)

  // 生成函数体
  if (returns) {
    push('(', context)
    genNode(returns, context)
    push(')', context)
  } else if (body) {
    push('{', context)
    indent(context)
    for (const stmt of body) {
      genNode(stmt, context)
    }
    deindent(context)
    push('}', context)
  }
}
```

## 生成条件表达式

```typescript
function genConditionalExpression(
  node: ConditionalExpression,
  context: CodegenContext
): void {
  const { test, consequent, alternate } = node

  // 生成条件
  genNode(test, context)

  push(' ? ', context)

  // 生成真值分支
  genNode(consequent, context)

  push(' : ', context)

  // 生成假值分支
  if (alternate) {
    genNode(alternate, context)
  } else {
    push('null', context)
  }
}
```

## 静态提升

静态提升是一种优化策略，将静态节点提升到渲染函数外部。

### 实现

```typescript
function hoistStatic(ast: RootNode, context: TransformContext): void {
  walk(ast, context, new Set<TemplateChildNode>())

  // 生成提升的节点
  if (context.hoists.length > 0) {
    ast.hoists = context.hoists
  }
}

function walk(
  node: RootNode | TemplateChildNode,
  context: TransformContext,
  hoisted: Set<TemplateChildNode>
): void {
  const { children } = node

  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    if (isStatic(child)) {
      // 提升静态节点
      const hoistedNode = hoist(child, context)
      hoisted.add(child)
      children[i] = hoistedNode
    }
  }
}

function hoist(
  node: TemplateChildNode,
  context: TransformContext
): HoistExpression {
  const hoistedNode = {
    type: NodeTypes.JS_CACHE_EXPRESSION,
    index: context.hoists.length,
    node
  } as HoistExpression

  context.hoists.push(node)
  return hoistedNode
}
```

### 生成提升节点

```typescript
function genHoists(hoists: HoistExpression[], context: CodegenContext): void {
  for (let i = 0; i < hoists.length; i++) {
    const exp = hoists[i]

    push(`const _hoisted_${i + 1} = `, context)
    genNode(exp.node, context)
    newline(context)
  }
}
```

### 示例

```typescript
// 输入模板
<div>
  <span class="static">静态内容</span>
  <span>{{ dynamic }}</span>
</div>

// 生成的代码
const _hoisted_1 = createElementVNode("span", { class: "static" }, "静态内容")

function render(_ctx, _cache) {
  return createElementVNode("div", null, [
    _hoisted_1,
    createElementVNode("span", null, toDisplayString(_ctx.dynamic))
  ])
}
```

## 缓存事件处理器

缓存事件处理器避免每次渲染都创建新函数。

```typescript
// 输入模板
<button @click="count++">{{ count }}</button>

// 不优化：每次渲染都创建新函数
function render(_ctx) {
  return createElementVNode("button", {
    onClick: () => _ctx.count++
  }, toDisplayString(_ctx.count))
}

// 优化后：缓存事件处理器
function render(_ctx, _cache) {
  return createElementVNode("button", {
    onClick: _cache[0] || (setFn(_cache, 0, () => _ctx.count++))
  }, toDisplayString(_ctx.count))
}
```

## with 语句

Vue 2 使用 `with` 语句简化模板变量访问：

```typescript
function render(_ctx) {
  with (_ctx) {
    return createElementVNode("div", null, title)
  }
}
```

Vue 3 默认不使用 `with`，而是直接解构 `_ctx`：

```typescript
function render(_ctx, _cache) {
  const { title, count } = _ctx
  return createElementVNode("div", null, title)
}
```

## Source Map 生成

Codegen 支持生成 Source Map：

```typescript
interface CodegenResult {
  ast: RootNode
  code: string
  map?: RawSourceMap
}

function generate(
  ast: RootNode,
  options: CodegenOptions
): CodegenResult {
  const context = createCodegenContext(ast, options)

  // ... 生成代码

  const result: CodegenResult = {
    ast,
    code: context.code
  }

  if (options.sourceMap) {
    result.map = context.map.toJSON()
  }

  return result
}
```

## 总结

Codegen 的核心功能：

| 功能 | 说明 |
|------|------|
| 代码生成 | 将 JavaScript AST 转换为代码字符串 |
| 静态提升 | 提升静态节点到渲染函数外部 |
| PatchFlags | 标记动态部分，优化 diff |
| Source Map | 支持调试 |

## 下一步

- [虚拟 DOM 详解](../runtime/虚拟DOM详解.md)：了解运行时如何使用生成的代码