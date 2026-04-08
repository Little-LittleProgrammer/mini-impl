# Parser 解析器原理详解

Parser（解析器）是 Vue3 编译器的第一阶段，负责将模板字符串转换为抽象语法树（AST）。本文档基于 mini-vue 的实现，详细解析解析器的工作原理。

## 核心文件

- `packages/compiler-core/src/parse.ts` - 解析器核心实现

## 整体架构

```
模板字符串 → Parser → AST（抽象语法树）
```

解析器采用**递归下降解析**算法，通过维护一个 `source` 指针逐步消费模板字符串，生成结构化的 AST 节点。

## 核心数据结构

### ParserContext（解析器上下文）

```typescript
export interface ParserContext {
  source: string  // 模板数据源，待解析的模板字符串
}
```

解析器通过不断更新 `context.source` 来消费模板内容。

### 节点类型（NodeTypes）

解析阶段主要生成以下 AST 节点类型：

| 类型 | 说明 | 示例 |
|------|------|------|
| `ROOT` | 根节点 | 整个模板的容器 |
| `ELEMENT` | 元素节点 | `<div>`, `<span>` |
| `TEXT` | 文本节点 | `hello world` |
| `INTERPOLATION` | 插值表达式 | `{{ msg }}` |
| `ATTRIBUTE` | 普通属性 | `class="foo"` |
| `DIRECTIVE` | 指令 | `v-if="show"` |

### ElementTypes（元素类型）

| 类型 | 说明 |
|------|------|
| `ELEMENT` | 普通 HTML 元素 |
| `COMPONENT` | 组件 |
| `SLOT` | 插槽 |
| `TEMPLATE` | template 元素 |

## 解析流程

### 1. 入口函数：baseParse

```typescript
export function baseParse(content: string) {
  const context = createParserContext(content)
  const children = parseChildren(context, [])
  return createRoot(children)
}
```

流程：
1. 创建解析器上下文
2. 递归解析子节点
3. 创建根节点并返回

### 2. parseChildren（解析子节点）

核心循环逻辑，持续消费模板直到结束：

```typescript
function parseChildren(context: ParserContext, ancestors) {
  const nodes = []

  while (!isEnd(context, ancestors)) {
    const s = context.source
    let node

    // 1. 解析插值表达式 {{ xxx }}
    if (startsWith(s, '{{')) {
      node = parseInterpolation(context)
    }
    // 2. 解析元素标签
    else if (s[0] === '<') {
      if (/[a-z]/i.test(s[1])) {
        node = parseElement(context, ancestors)
      }
    }
    // 3. 解析文本
    if (!node) {
      node = parseText(context)
    }

    pushNode(nodes, node)
  }

  return nodes
}
```

解析顺序：
```
<div>hello world</div>
  ↓
1. <div     → 解析开始标签
2. >        → 标签结束
3. hello world → 解析文本
4. </div>   → 解析结束标签
```

### 3. advanceBy（指针推进）

解析器的核心机制：通过 `advanceBy` 函数不断推进 `source` 指针。

```typescript
function advanceBy(context: ParserContext, numberOfCharacters: number) {
  const { source } = context
  context.source = source.slice(numberOfCharacters)
}
```

以 `<div>hello</div>` 为例：
```
第1次: <div        → 消费 "<div"  → 剩余 ">hello</div>"
第2次: >hello      → 消费 ">"    → 剩余 "hello</div>"
第3次: hello</div → 消费 "hello" → 剩余 "</div>"
第4次: </div>     → 消费 "</div>" → 剩余 ""
```

## 各类节点解析

### 1. 元素节点 parseElement

```typescript
function parseElement(context: ParserContext, ancestors) {
  // 1. 解析开始标签
  const element = parseTag(context, TagType.Start)

  // 2. 递归解析子节点
  ancestors.push(element)
  const children = parseChildren(context, ancestors)
  ancestors.pop()
  element.children = children

  // 3. 解析结束标签
  if (startsWithEndTagOpen(context.source, element.tag)) {
    parseTag(context, TagType.End)
  }

  return element
}
```

流程：
```
<div>
  <span>text</span>
</div>

解析顺序：
1. <div        → parseTag(Start)
2. >           → 推进指针
3. <span       → parseElement 递归
4. >           → 推进指针
5. text        → parseText
6. </span>     → parseTag(End)
7. </div>      → parseTag(End)
```

### 2. 标签解析 parseTag

```typescript
function parseTag(context: any, type: TagType): any {
  // 1. 提取标签名
  const match = /^<\/?([a-z][^\r\n\t\f />]*)/i.exec(context.source)
  const tag = match[1]

  // 2. 推进指针
  advanceBy(context, match[0].length)

  // 3. 解析属性
  advanceSpaces(context)
  let props = parseAttributes(context, type)

  // 4. 判断自闭合标签
  let isSelfClosing = startsWith(context.source, '/>')
  advanceBy(context, isSelfClosing ? 2 : 1)

  return {
    type: NodeTypes.ELEMENT,
    tag,
    tagType: ElementTypes.ELEMENT,
    props
  }
}
```

### 3. 属性解析 parseAttributes

循环解析直到遇到 `>` 或 `/>`：

```typescript
function parseAttributes(context, type) {
  const props = []
  const attributeNames = new Set<string>()

  while (
    context.source.length > 0 &&
    !startsWith(context.source, '>') &&
    !startsWith(context.source, '/>')
  ) {
    const attr = parseAttribute(context, attributeNames)
    if (type === TagType.Start) {
      props.push(attr)
    }
    advanceSpaces(context)
  }
  return props
}
```

### 4. 单个属性解析 parseAttribute

处理普通属性和指令：

```typescript
function parseAttribute(context: ParserContext, nameSet: Set<string>) {
  // 提取属性名
  const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source)!
  const name = match[0]
  nameSet.add(name)
  advanceBy(context, name.length)

  // 提取属性值
  let value: any = undefined
  if (/^[\t\r\n\f ]*=/.test(context.source)) {
    advanceSpaces(context)
    advanceBy(context, 1)  // = 号
    advanceSpaces(context)
    value = parseAttributeValue(context)
  }

  // 指令处理 (v-, :, @, # 开头)
  if (/^(v-[A-Za-z0-9-]|:|\.|@|#)/.test(name)) {
    const match = /(?:^v-([a-z0-9-]+))?(?:(?::|^\.|^@|^#)(\[[^\]]+\]|[^\.]+))?(.+)?$/i.exec(name)!
    let dirName = match[1]

    return {
      type: NodeTypes.DIRECTIVE,
      name: dirName,
      exp: value && {
        type: NodeTypes.SIMPLE_EXPRESSION,
        content: value.content,
        isStatic: false,
        loc: value.loc
      },
      arg: undefined,
      modifiers: undefined,
      loc: {}
    }
  }

  // 普通属性
  return {
    type: NodeTypes.ATTRIBUTE,
    name,
    value: value && {
      type: NodeTypes.TEXT,
      content: value.content,
      loc: value.loc
    },
    loc: {}
  }
}
```

### 5. 插值表达式 parseInterpolation

```typescript
function parseInterpolation(context: ParserContext) {
  const [open, close] = ['{{', '}}']

  advanceBy(context, open.length)

  const closeIndex = context.source.indexOf(close, open.length)
  const preTrimContent = parseTextData(context, closeIndex)
  const content = preTrimContent.trim()

  advanceBy(context, close.length)

  return {
    type: NodeTypes.INTERPOLATION,
    content: {
      type: NodeTypes.SIMPLE_EXPRESSION,
      isStatic: false,
      content
    }
  }
}
```

### 6. 文本解析 parseText

```typescript
function parseText(context: ParserContext) {
  const endTokens = ['<', '{{']
  let endIndex = context.source.length

  // 找到最近的结束标记
  for (let i = 0; i < endTokens.length; i++) {
    const index = context.source.indexOf(endTokens[i], 1)
    if (index !== -1 && endIndex > index) {
      endIndex = index
    }
  }

  const content = parseTextData(context, endIndex)

  return {
    type: NodeTypes.TEXT,
    content
  }
}
```

## 解析示例

### 输入模板

```html
<div id="app">
  <h1 v-if="show">{{ title }}</h1>
  <p>Hello {{ name }}</p>
</div>
```

### 生成的 AST

```javascript
{
  type: NodeTypes.ROOT,
  children: [
    {
      type: NodeTypes.ELEMENT,
      tag: 'div',
      tagType: ElementTypes.ELEMENT,
      props: [
        {
          type: NodeTypes.ATTRIBUTE,
          name: 'id',
          value: { type: NodeTypes.TEXT, content: 'app' }
        }
      ],
      children: [
        {
          type: NodeTypes.ELEMENT,
          tag: 'h1',
          props: [
            {
              type: NodeTypes.DIRECTIVE,
              name: 'if',
              exp: { type: NodeTypes.SIMPLE_EXPRESSION, content: 'show', isStatic: false }
            }
          ],
          children: [
            {
              type: NodeTypes.INTERPOLATION,
              content: {
                type: NodeTypes.SIMPLE_EXPRESSION,
                content: 'title',
                isStatic: false
              }
            }
          ]
        },
        {
          type: NodeTypes.ELEMENT,
          tag: 'p',
          props: [],
          children: [
            { type: NodeTypes.TEXT, content: 'Hello ' },
            {
              type: NodeTypes.INTERPOLATION,
              content: {
                type: NodeTypes.SIMPLE_EXPRESSION,
                content: 'name',
                isStatic: false
              }
            }
          ]
        }
      ]
    }
  ]
}
```

## 关键算法

### 1. 递归下降解析

解析器采用递归下降算法，通过 `parseChildren` 递归调用自身来处理嵌套结构：

```
parseChildren
  ├── parseElement (遇到 <)
  │     ├── parseTag
  │     ├── parseAttributes
  │     └── parseChildren (递归)
  │           └── ...
  └── parseText / parseInterpolation
```

### 2. 结束条件判断 isEnd

```typescript
function isEnd(context: ParserContext, ancestors): boolean {
  const s = context.source

  // 遇到结束标签时，检查是否匹配最近的开始标签
  if (startsWith(s, '</')) {
    for (let i = ancestors.length - 1; i >= 0; --i) {
      if (startsWithEndTagOpen(s, ancestors[i].tag)) {
        return true
      }
    }
  }
  // source 为空时结束
  return !s
}
```

### 3. 结束标签匹配 startsWithEndTagOpen

```typescript
function startsWithEndTagOpen(source: string, tag: string): boolean {
  return (
    startsWith(source, '</') &&
    source.slice(2, 2 + tag.length).toLowerCase() === tag.toLowerCase() &&
    /[\t\r\n\f />]/.test(source[2 + tag.length] || '>')
  )
}
```

## 总结

Parser 阶段的核心工作机制：

1. **指针推进**：通过 `advanceBy` 不断消费模板字符串
2. **递归下降**：通过 `parseChildren` 递归处理嵌套结构
3. **模式匹配**：根据首字符判断当前解析模式（插值/元素/文本）
4. **状态维护**：通过 `ancestors` 数组追踪嵌套层级，确保结束标签匹配

解析后的 AST 将传递给 Transform 阶段进行转换。
