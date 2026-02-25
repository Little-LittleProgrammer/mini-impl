# Codegen 代码生成器原理详解

Codegen（代码生成器）是 Vue3 编译器的最后一个阶段，负责将转换阶段生成的 JavaScript AST 转换为可执行的渲染函数代码。本文档基于 mini-vue 的实现，详细解析代码生成器的工作原理。

## 核心文件

- `packages/compiler-core/src/codegen.ts` - 代码生成核心逻辑
- `packages/compiler-core/src/runtimeHelpers.ts` - 运行时帮助函数

## 整体架构

```
JavaScript AST → Codegen → 渲染函数代码
```

代码生成器遍历 JavaScript AST，递归地生成对应的 JavaScript 代码字符串。

## 核心数据结构

### CodegenContext（代码生成上下文）

```typescript
const context = {
  code: ``,              // 生成的代码字符串
  runtimeGlobalName: 'Vue',  // 运行时全局变量名
  source: ast.loc.source,    // 原始模板
  indentLevel: 0,            // 缩进级别
  helper(key) {              // 获取帮助函数别名
    return `_${helperNameMap[key]}`
  },
  push(code) {              // 添加代码
    context.code += code
  },
  newline() {               // 换行
    newline(context.indentLevel)
  },
  indent() {                // 增加缩进
    newline(++context.indentLevel)
  },
  deindent() {              // 减少缩进
    newline(--context.indentLevel)
  }
}
```

### NodeTypes（代码生成阶段节点类型）

| 类型 | 说明 |
|------|------|
| `VNODE_CALL` | VNode 函数调用 |
| `TEXT` | 文本节点 |
| `SIMPLE_EXPRESSION` | 简单表达式 |
| `INTERPOLATION` | 插值表达式 |
| `COMPOUND_EXPRESSION` | 复合表达式 |
| `JS_CALL_EXPRESSION` | JS 函数调用 |
| `JS_CONDITIONAL_EXPRESSION` | JS 条件表达式 |

## 代码生成流程

### 1. 入口函数：generate

```typescript
export function generate(ast) {
  // 1. 创建代码生成上下文
  const context = createCodegenContext(ast)

  const { push, newline, indent, deindent } = context

  // 2. 生成函数前导
  genFunctionPreamble(context)

  // 3. 创建函数声明
  const functionName = `render`
  const args = ['_ctx', '_cache']
  const signature = args.join(', ')

  push(`function ${functionName}(${signature}) {`)
  indent()

  // 4. with 语句
  push(`with (_ctx) {`)
  indent()

  // 5. 解构帮助函数
  const hasHelpers = ast.helpers.length > 0
  if (hasHelpers) {
    push(`const { ${ast.helpers.map(aliasHelper).join(', ')} } = _Vue`)
    push(`\n`)
    newline()
  }

  // 6. 生成返回语句
  newline()
  push(`return `)
  if (ast.codegenNode) {
    genNode(ast.codegenNode, context)
  } else {
    push(`null`)
  }

  // 7. 闭合括号
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

### 2. 函数前导生成 genFunctionPreamble

```typescript
function genFunctionPreamble(context) {
  const { push, newline, runtimeGlobalName } = context

  const VueBinding = runtimeGlobalName
  push(`const _Vue = ${VueBinding}\n`)

  newline()
  push(`return `)
}
```

生成结果：
```javascript
const _Vue = Vue

return function render(_ctx, _cache) { ... }
```

## 节点代码生成

### genNode（节点分发）

根据节点类型分发到不同的生成函数：

```typescript
function genNode(node, context) {
  switch (node.type) {
    case NodeTypes.ELEMENT:
    case NodeTypes.IF:
      genNode(node.codegenNode!, context)
      break
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
    case NodeTypes.JS_CONDITIONAL_EXPRESSION:
      genConditionalExpression(node, context)
      break
  }
}
```

### 1. genVNodeCall（VNode 调用生成）

生成 `createElementVNode` 函数调用：

```typescript
function genVNodeCall(node, context) {
  const { push, helper } = context
  const { tag, props, children, patchFlag, dynamicProps, isComponent } = node

  // 获取 VNode 生成函数
  const callHelper = getVNodeHelper(context.inSSR, isComponent)
  push(helper(callHelper) + `(`, node)

  // 生成参数列表
  const args = genNullableArgs([tag, props, children, patchFlag, dynamicProps])
  genNodeList(args, context)

  push(`)`)
}
```

示例：
```
// 输入 AST
{
  type: VNODE_CALL,
  tag: '"div"',
  props: [],
  children: []
}

// 生成代码
createElementVNode("div", null, [])
```

### 2. genText（文本节点生成）

```typescript
function genText(node, context) {
  context.push(JSON.stringify(node.content), node)
}
```

示例：
```
// 输入
{ type: TEXT, content: "hello" }

// 输出
"hello"
```

### 3. genExpression（表达式生成）

```typescript
function genExpression(node, context) {
  const { content, isStatic } = node
  // 静态表达式需要 JSON.stringify
  // 动态表达式直接输出
  context.push(isStatic ? JSON.stringify(content) : content, node)
}
```

示例：
```
// 静态表达式
{ content: "div", isStatic: true } → "div"

// 动态表达式
{ content: "msg", isStatic: false } → msg
```

### 4. genInterpolation（插值表达式生成）

```typescript
function genInterpolation(node, context) {
  const { push, helper } = context
  push(`${helper(TO_DISPLAY_STRING)}(`)
  genNode(node.content, context)
  push(`)`)
}
```

示例：
```
// 输入
{
  type: INTERPOLATION,
  content: { type: SIMPLE_EXPRESSION, content: "msg", isStatic: false }
}

// 输出
toDisplayString(msg)
```

### 5. genCompoundExpression（复合表达式生成）

```typescript
function genCompoundExpression(node, context) {
  for (let i = 0; i < node.children!.length; i++) {
    const child = node.children![i]
    if (isString(child)) {
      context.push(child)
    } else {
      genNode(child, context)
    }
  }
}
```

示例：
```
// 输入
{
  type: COMPOUND_EXPRESSION,
  children: [
    "hello ",
    { type: INTERPOLATION, content: { content: "msg" } },
    " world"
  ]
}

// 输出
"hello " + toDisplayString(msg) + " world"
```

### 6. genConditionalExpression（条件表达式生成）

```typescript
function genConditionalExpression(node, context) {
  const { test, consequent, alternate, newline: needNewline } = node
  const { push, indent, deindent, newline } = context

  // 生成测试条件
  if (test.type === NodeTypes.SIMPLE_EXPRESSION) {
    genExpression(test, context)
  }

  // 生成 ? consequent
  needNewline && indent()
  context.indentLevel++
  needNewline || push(` `)
  push(`? `)
  genNode(consequent, context)
  context.indentLevel--

  // 生成 : alternate
  needNewline && newline()
  needNewline || push(` `)
  push(`: `)

  const isNested = alternate.type === NodeTypes.JS_CONDITIONAL_EXPRESSION
  if (!isNested) {
    context.indentLevel++
  }
  genNode(alternate, context)
  if (!isNested) {
    context.indentLevel--
  }

  needNewline && deindent(true)
}
```

示例：
```
// 输入
{
  type: JS_CONDITIONAL_EXPRESSION,
  test: { content: "show", isStatic: false },
  consequent: { type: VNODE_CALL, tag: '"h1"', ... },
  alternate: { type: JS_CALL_EXPRESSION, callee: CREATE_COMMENT, ... }
}

// 输出
show ? createElementVNode("h1", null, "Title") : createCommentVNode("v-if", true)
```

### 7. genCallExpression（函数调用生成）

```typescript
function genCallExpression(node, context) {
  const { push, helper } = context
  const callee = isString(node.callee) ? node.callee : helper(node.callee)

  push(callee + `(`, node)
  genNodeList(node.arguments, context)
  push(`)`)
}
```

## 参数列表处理

### genNodeList（节点列表生成）

```typescript
function genNodeList(nodes, context) {
  const { push, newline } = context
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (isString(node)) {
      push(node)
    } else if (isArray(node)) {
      genNodeListAsArray(node, context)
    } else {
      genNode(node, context)
    }
    if (i < nodes.length - 1) {
      push(', ')
    }
  }
}

```

### genNullableArgs（过滤空参数）

```typescript
function genNullableArgs(args: any[]) {
  let i = args.length
  while (i--) {
    if (args[i] != null) break
  }
  return args.slice(0, i + 1).map(arg => arg || `null`)
}
```

示例：

```
// 输入
["div", null, [], null, null]

// 输出（过滤尾部 null）
["div", null, []]

```

## 完整生成示例

### 输入模板

```html
<div id="app">
  <h1 v-if="show">{{ title }}</h1>
  <p>Hello {{ name }}</p>
</div>
```

### JavaScript AST（Transform 阶段输出）

```javascript
{
  type: ROOT,
  helpers: [CREATE_ELEMENT_VNODE, TO_DISPLAY_STRING, CREATE_COMMENT],
  codegenNode: {
    type: VNODE_CALL,
    tag: '"div"',
    props: [],
    children: [
      // h1 条件渲染
      {
        type: JS_CONDITIONAL_EXPRESSION,
        test: "show",
        consequent: {
          type: VNODE_CALL,
          tag: '"h1"',
          children: [TO_DISPLAY_STRING(title)]
        },
        alternate: {
          type: JS_CALL_EXPRESSION,
          callee: CREATE_COMMENT,
          arguments: ["v-if", true]
        }
      },
      // p 元素
      {
        type: VNODE_CALL,
        tag: '"p"',
        children: ["Hello " + TO_DISPLAY_STRING(name)]
      }
    ]
  }
}
```

### 生成的渲染函数

```javascript
const _Vue = Vue

return function render(_ctx, _cache) {
  with (_ctx) {
    const { createElementVNode: _createElementVNode, toDisplayString: _toDisplayString, createCommentVNode: _createCommentVNode } = _Vue

    return _createElementVNode("div", null, [
      show
        ? _createElementVNode("h1", null, _toDisplayString(title))
        : _createCommentVNode("v-if", true),
      _createElementVNode("p", null, "Hello " + _toDisplayString(name))
    ])
  }
}
```

## 缩进管理

代码生成器使用 `indentLevel` 控制缩进：

```typescript
function newline(n: number) {
  context.code += '\n' + `  `.repeat(n)
}
```

生成的代码会自动缩进：
```javascript
function render(_ctx, _cache) {
  with (_ctx) {
    const { ... } = _Vue

    return _createElementVNode("div", null, [
      show
        ? _createElementVNode("h1", null, ...)
        : _createCommentVNode("v-if", true),
      ...
    ])
  }
}
```

## 帮助函数映射

| Symbol | 导出名称 | 用途 |
|--------|----------|------|
| `CREATE_ELEMENT_VNODE` | `createElementVNode` | 创建 VNode |
| `CREATE_VNODE` | `createVNode` | 创建 VNode（组件用）|
| `TO_DISPLAY_STRING` | `toDisplayString` | 转换显示字符串 |
| `CREATE_COMMENT` | `createCommentVNode` | 创建注释 VNode |

## 总结

Codegen 阶段的核心工作机制：

1. **递归遍历**：根据 `node.type` 分发到不同的生成函数
2. **上下文管理**：通过 `context` 对象管理代码字符串、缩进、帮助函数
3. **参数处理**：自动过滤尾部的 null 参数
4. **缩进控制**：使用 `indent/deindent` 实现代码格式化

最终生成的渲染函数是一个接收 `_ctx`（组件实例）和 `_cache`（缓存）的普通 JavaScript 函数，可以直接在浏览器或 Node 环境中执行。
