# Parser 解析器原理

## 什么是 Parser？

Parser（解析器）负责将模板字符串转换为 AST（抽象语法树）。AST 是模板的结构化表示，便于后续的转换和代码生成。

```typescript
// 输入：模板字符串
const template = `<div class="app">{{ msg }}</div>`

// 输出：AST
const ast = parse(template)
```

## AST 结构

### 根节点

```typescript
interface RootNode {
  type: NodeTypes.ROOT
  children: TemplateChildNode[]
  helpers: Set<Symbol>
  codegenNode?: TemplateChildNode
}
```

### 元素节点

```typescript
interface ElementNode {
  type: NodeTypes.ELEMENT
  tag: string
  props: Array<AttributeNode | DirectiveNode>
  children: TemplateChildNode[]
  isSelfClosing: boolean
}
```

### 文本节点

```typescript
interface TextNode {
  type: NodeTypes.TEXT
  content: string
}
```

### 插值节点

```typescript
interface InterpolationNode {
  type: NodeTypes.INTERPOLATION
  content: ExpressionNode
}
```

### 属性节点

```typescript
interface AttributeNode {
  type: NodeTypes.ATTRIBUTE
  name: string
  value: TextNode | undefined
}
```

### 指令节点

```typescript
interface DirectiveNode {
  type: NodeTypes.DIRECTIVE
  name: string
  arg: ExpressionNode | undefined
  exp: ExpressionNode | undefined
}
```

## 解析上下文

Parser 使用上下文对象来跟踪解析状态。

```typescript
// packages/compiler-core/src/parse.ts

interface ParserContext {
  // 原始模板
  source: string

  // 解析器选项
  options: ParserOptions

  // 原始模板（用于错误报告）
  originalSource: string

  // 当前偏移量
  offset: number

  // 当前行号
  line: number

  // 当前列号
  column: number
}
```

### 创建上下文

```typescript
function createParserContext(content: string, options: ParserOptions): ParserContext {
  return {
    source: content,
    options,
    originalSource: content,
    offset: 0,
    line: 1,
    column: 1
  }
}
```

## 主解析函数

```typescript
export function baseParse(content: string, options: ParserOptions = {}): RootNode {
  // 创建解析上下文
  const context = createParserContext(content, options)

  // 解析子节点
  const children = parseChildren(context, [])

  // 创建根节点
  return createRoot(children)
}
```

## parseChildren 核心逻辑

`parseChildren` 是解析的核心，它循环解析所有子节点。

```typescript
function parseChildren(
  context: ParserContext,
  ancestors: ElementNode[]
): TemplateChildNode[] {
  const nodes: TemplateChildNode[] = []

  // 循环解析，直到遇到结束标记
  while (!isEnd(context, ancestors)) {
    const s = context.source
    let node: TemplateChildNode | undefined

    // 1. 插值表达式 {{ }}
    if (startsWith(s, '{{')) {
      node = parseInterpolation(context)
    }
    // 2. 元素节点 <div>
    else if (s[0] === '<') {
      // 注释 <!-- -->
      if (startsWith(s, '<!--')) {
        node = parseComment(context)
      }
      // 结束标签 </div>
      else if (startsWith(s, '</')) {
        // 错误：多余的结束标签
      }
      // 开始标签 <div>
      else if (/[a-z]/i.test(s[1])) {
        node = parseElement(context, ancestors)
      }
    }

    // 3. 文本节点
    if (!node) {
      node = parseText(context)
    }

    nodes.push(node)
  }

  return nodes
}
```

### 解析结束条件

```typescript
function isEnd(context: ParserContext, ancestors: ElementNode[]): boolean {
  const s = context.source

  // 1. 源码已解析完
  if (!s) return true

  // 2. 遇到父元素的结束标签
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (startsWithEndTagOpen(s, ancestors[i].tag)) {
      return true
    }
  }

  return false
}
```

## 解析插值表达式

```typescript
function parseInterpolation(context: ParserContext): InterpolationNode {
  // {{ message }}
  // ^开头的位置

  const open = '{{'
  const close = '}}'

  // 找到结束标记
  const closeIndex = context.source.indexOf(close, open.length)

  if (closeIndex === -1) {
    // 错误：缺少结束标记
  }

  // 前进到内容开始
  advanceBy(context, open.length)

  // 获取内容
  const content = parseInterpolationContent(context, closeIndex - open.length)

  // 前进过结束标记
  advanceBy(context, close.length)

  return {
    type: NodeTypes.INTERPOLATION,
    content: {
      type: NodeTypes.SIMPLE_EXPRESSION,
      content: content.trim(),
      isStatic: false
    }
  }
}
```

### advanceBy 辅助函数

```typescript
function advanceBy(context: ParserContext, numberOfCharacters: number): void {
  const { source } = context

  // 更新偏移量、行号、列号
  advancePositionWithMutation(context, source, numberOfCharacters)

  // 截取剩余源码
  context.source = source.slice(numberOfCharacters)
}

function advancePositionWithMutation(
  pos: Position,
  source: string,
  numberOfCharacters: number = source.length
): Position {
  let linesCount = 0
  let lastNewLinePos = -1

  for (let i = 0; i < numberOfCharacters; i++) {
    if (source.charCodeAt(i) === 10 /* newline character */) {
      linesCount++
      lastNewLinePos = i
    }
  }

  pos.offset += numberOfCharacters
  pos.line += linesCount
  pos.column = lastNewLinePos === -1
    ? pos.column + numberOfCharacters
    : numberOfCharacters - lastNewLinePos

  return pos
}
```

## 解析元素节点

```typescript
function parseElement(
  context: ParserContext,
  ancestors: ElementNode[]
): ElementNode {
  // 1. 解析开始标签
  const element = parseTag(context, TagType.Start)

  // 2. 自闭合标签直接返回
  if (element.isSelfClosing) {
    return element
  }

  // 3. 递归解析子节点
  ancestors.push(element)
  const children = parseChildren(context, ancestors)
  ancestors.pop()

  // 4. 解析结束标签
  parseTag(context, TagType.End)

  element.children = children
  return element
}
```

### 解析标签

```typescript
function parseTag(context: ParserContext, type: TagType): ElementNode {
  // <div class="app">
  // ^当前位置

  // 匹配标签名
  const match = /^<\/?([a-z][^\t\r\n\f />]*)/i.exec(context.source)!
  const tag = match[1]

  // 前进到标签名后
  advanceBy(context, match[0].length)

  // 解析属性
  const props = parseAttributes(context)

  // 检查是否自闭合
  const isSelfClosing = context.source.startsWith('/>')
  advanceBy(context, isSelfClosing ? 2 : 1)

  return {
    type: NodeTypes.ELEMENT,
    tag,
    props,
    children: [],
    isSelfClosing
  }
}
```

### 解析属性

```typescript
function parseAttributes(context: ParserContext): Array<AttributeNode | DirectiveNode> {
  const props: Array<AttributeNode | DirectiveNode> = []

  // 循环解析，直到遇到 > 或 />
  while (context.source.length && !startsWith(context.source, '>') && !startsWith(context.source, '/>')) {
    const prop = parseAttribute(context)
    props.push(prop)
  }

  return props
}

function parseAttribute(context: ParserContext): AttributeNode | DirectiveNode {
  // class="app"
  // ^当前位置

  // 匹配属性名
  const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source)!
  const name = match[0]

  advanceBy(context, name.length)

  // 跳过空白
  advanceSpaces(context)

  // 没有 = 号，只有属性名
  if (!startsWith(context.source, '=')) {
    return {
      type: NodeTypes.ATTRIBUTE,
      name,
      value: undefined
    }
  }

  // 跳过 =
  advanceBy(context, 1)
  advanceSpaces(context)

  // 解析属性值
  const value = parseAttributeValue(context)

  // 判断是指令还是普通属性
  if (name.startsWith('v-') || name.startsWith(':') || name.startsWith('@')) {
    return parseDirective(name, value)
  }

  return {
    type: NodeTypes.ATTRIBUTE,
    name,
    value
  }
}
```

### 解析指令

```typescript
function parseDirective(name: string, value: TextNode): DirectiveNode {
  // v-on:click="handler"
  // @click="handler"
  // :class="activeClass"

  let dirName: string
  let arg: string | undefined

  if (name.startsWith('v-')) {
    // v-on:click
    const parts = name.slice(2).split(':')
    dirName = parts[0]
    arg = parts[1]
  } else if (name.startsWith(':')) {
    // :class
    dirName = 'bind'
    arg = name.slice(1)
  } else if (name.startsWith('@')) {
    // @click
    dirName = 'on'
    arg = name.slice(1)
  }

  return {
    type: NodeTypes.DIRECTIVE,
    name: dirName!,
    arg: arg ? {
      type: NodeTypes.SIMPLE_EXPRESSION,
      content: arg,
      isStatic: true
    } : undefined,
    exp: value ? {
      type: NodeTypes.SIMPLE_EXPRESSION,
      content: value.content,
      isStatic: false
    } : undefined
  }
}
```

## 解析文本节点

```typescript
function parseText(context: ParserContext): TextNode {
  // 文本结束的标志：< 或 {{
  const endTokens = ['<', '{{']

  let endIndex = context.source.length

  // 找到最近的结束标记
  for (let i = 0; i < endTokens.length; i++) {
    const index = context.source.indexOf(endTokens[i])
    if (index !== -1 && index < endIndex) {
      endIndex = index
    }
  }

  const content = context.source.slice(0, endIndex)
  advanceBy(context, content.length)

  return {
    type: NodeTypes.TEXT,
    content
  }
}
```

## 解析示例

### 示例 1：简单元素

```typescript
const template = `<div>hello</div>`

// 解析过程
// 1. parseElement
//    - parseTag(Start): <div
//    - parseChildren
//      - parseText: "hello"
//    - parseTag(End): </div>

// 生成的 AST
{
  type: 0, // ROOT
  children: [
    {
      type: 1, // ELEMENT
      tag: 'div',
      props: [],
      children: [
        {
          type: 2, // TEXT
          content: 'hello'
        }
      ]
    }
  ]
}
```

### 示例 2：带属性的元素

```typescript
const template = `<div class="app" id="main">text</div>`

// 生成的 AST
{
  type: 0,
  children: [
    {
      type: 1,
      tag: 'div',
      props: [
        {
          type: 4, // ATTRIBUTE
          name: 'class',
          value: { type: 2, content: 'app' }
        },
        {
          type: 4,
          name: 'id',
          value: { type: 2, content: 'main' }
        }
      ],
      children: [
        { type: 2, content: 'text' }
      ]
    }
  ]
}
```

### 示例 3：插值表达式

```typescript
const template = `<div>{{ message }}</div>`

// 生成的 AST
{
  type: 0,
  children: [
    {
      type: 1,
      tag: 'div',
      props: [],
      children: [
        {
          type: 5, // INTERPOLATION
          content: {
            type: 4, // SIMPLE_EXPRESSION
            content: 'message',
            isStatic: false
          }
        }
      ]
    }
  ]
}
```

### 示例 4：指令

```typescript
const template = `<div v-if="show" @click="handleClick"></div>`

// 生成的 AST
{
  type: 0,
  children: [
    {
      type: 1,
      tag: 'div',
      props: [
        {
          type: 7, // DIRECTIVE
          name: 'if',
          exp: {
            type: 4,
            content: 'show',
            isStatic: false
          }
        },
        {
          type: 7,
          name: 'on',
          arg: {
            type: 4,
            content: 'click',
            isStatic: true
          },
          exp: {
            type: 4,
            content: 'handleClick',
            isStatic: false
          }
        }
      ],
      children: []
    }
  ]
}
```

## 错误处理

Parser 需要处理各种语法错误：

```typescript
// 1. 未闭合的标签
<div>hello
// 错误：元素缺少结束标签

// 2. 未闭合的插值表达式
{{ message
// 错误：插值表达式缺少结束标记

// 3. 无效的标签名
<123>
// 错误：无效的标签名
```

### 错误报告

```typescript
function emitError(
  context: ParserContext,
  code: ErrorCodes,
  loc: SourceLocation
): void {
  const message = getErrorMessage(code)
  context.options.onError({
    code,
    message,
    loc
  })
}
```

## Source Location

每个 AST 节点都包含源码位置信息，便于错误报告和 Source Map 生成。

```typescript
interface SourceLocation {
  source: string      // 原始源码
  start: Position     // 开始位置
  end: Position       // 结束位置
}

interface Position {
  offset: number      // 字符偏移
  line: number        // 行号
  column: number      // 列号
}
```

### 获取位置

```typescript
function getCursor(context: ParserContext): Position {
  const { offset, line, column } = context
  return { offset, line, column }
}

function getSelection(
  context: ParserContext,
  start?: Position,
  end?: Position
): SourceLocation {
  return {
    source: context.originalSource.slice(
      start ? start.offset : context.offset,
      end ? end.offset : context.offset
    ),
    start: start || getCursor(context),
    end: end || getCursor(context)
  }
}
```

## 解析器状态机

Parser 本质上是一个状态机：

```
┌─────────────────────────────────────────────────────────────────┐
│                        解析状态机                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  初始状态                                                        │
│      │                                                           │
│      ▼                                                           │
│  检查下一个字符                                                   │
│      │                                                           │
│      ├── '<' ──► 检查后续字符                                    │
│      │              │                                            │
│      │              ├── '<!--' ──► 解析注释                       │
│      │              ├── '</'  ──► 解析结束标签                   │
│      │              └── 其他   ──► 解析开始标签                   │
│      │                                                           │
│      ├── '{{' ──► 解析插值表达式                                 │
│      │                                                           │
│      └── 其他 ──► 解析文本                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 总结

Parser 的核心功能：

| 功能 | 说明 |
|------|------|
| 词法分析 | 识别各种 token（标签、属性、文本、插值） |
| 语法分析 | 构建层级结构的 AST |
| 错误处理 | 报告语法错误 |
| 位置追踪 | 记录每个节点的源码位置 |

## 下一步

- [Transformer 转换器原理](./Transformer转换器原理.md)：了解 AST 如何转换
- [Codegen 代码生成器原理](./Codegen代码生成器原理.md)：学习代码生成