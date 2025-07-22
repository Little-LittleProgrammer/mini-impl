/**
 * Vue 编译器 AST 和 JavaScript AST 类型定义
 * 
 * 此文件定义了 Vue 编译器中使用的抽象语法树（AST）节点类型
 * 包括 Vue 模板 AST 节点和生成的 JavaScript AST 节点的完整类型定义
 */

import { NodeTypes, ElementTypes } from './ast'

// =============================================
// 基础类型定义
// =============================================

/**
 * 源码位置信息
 * 用于错误报告和调试
 */
export interface SourceLocation {
  source?: string
  start?: Position
  end?: Position
}

/**
 * 位置坐标
 */
export interface Position {
  offset: number
  line: number
  column: number
}

/**
 * 所有 AST 节点的基础接口
 */
export interface Node {
  type: NodeTypes
  loc?: SourceLocation
}

/**
 * 父节点类型 - 可以包含子节点的节点
 */
export interface ParentNode extends Node {
  children: TemplateChildNode[]
}

/**
 * 模板子节点联合类型
 * 表示所有可以作为模板子节点的节点类型
 */
export type TemplateChildNode =
  | ElementNode
  | TextNode
  | CommentNode
  | InterpolationNode
  | CompoundExpressionNode
  | IfNode
  | IfBranchNode
  | ForNode
  | TextCallNode

// =============================================
// Vue 模板 AST 节点类型
// =============================================

/**
 * 根节点 - AST 的顶层节点
 */
export interface RootNode extends Node {
  type: NodeTypes.ROOT
  children: TemplateChildNode[]
  helpers: symbol[]
  components: string[]
  directives: string[]
  hoists: JSChildNode[]
  imports: ImportItem[]
  cached: number
  temps: number
  codegenNode?: TemplateChildNode | JSChildNode
}

/**
 * 元素节点 - HTML 标签元素
 */
export interface ElementNode extends Node {
  type: NodeTypes.ELEMENT
  ns: Namespace
  tag: string
  tagType: ElementTypes
  props: Array<AttributeNode | DirectiveNode>
  isSelfClosing: boolean
  children: TemplateChildNode[]
  codegenNode?: VNodeCall | SimpleExpressionNode | JSChildNode
}

/**
 * 文本节点 - 纯文本内容
 */
export interface TextNode extends Node {
  type: NodeTypes.TEXT
  content: string
}

/**
 * 注释节点 - HTML 注释
 */
export interface CommentNode extends Node {
  type: NodeTypes.COMMENT
  content: string
}

/**
 * 简单表达式节点 - JavaScript 表达式
 */
export interface SimpleExpressionNode extends Node {
  type: NodeTypes.SIMPLE_EXPRESSION
  content: string
  isStatic: boolean
  constType?: ConstantTypes
  /**
   * 标识符
   * 用于分析表达式的依赖关系和静态分析
   */
  identifiers?: string[]
}

/**
 * 插值表达式节点 - 双大括号表达式 {{ }}
 */
export interface InterpolationNode extends Node {
  type: NodeTypes.INTERPOLATION
  content: ExpressionNode
}

/**
 * 属性节点 - HTML 属性
 */
export interface AttributeNode extends Node {
  type: NodeTypes.ATTRIBUTE
  name: string
  value: TextNode | undefined
}

/**
 * 指令节点 - Vue 指令
 */
export interface DirectiveNode extends Node {
  type: NodeTypes.DIRECTIVE
  name: string
  exp: ExpressionNode | undefined
  arg: ExpressionNode | undefined
  modifiers: string[]
  /**
   * v-on 和 v-slot 的解析位置
   */
  parseResult?: DirectiveParseResult
}

/**
 * 复合表达式节点 - 多个表达式的组合
 */
export interface CompoundExpressionNode extends Node {
  type: NodeTypes.COMPOUND_EXPRESSION
  children: (
    | SimpleExpressionNode
    | CompoundExpressionNode
    | InterpolationNode
    | TextNode
    | string
    | symbol
  )[]
  /**
   * 标识符集合，用于依赖收集
   */
  identifiers?: string[]
}

/**
 * 条件节点 - v-if 指令的容器
 */
export interface IfNode extends Node {
  type: NodeTypes.IF
  branches: IfBranchNode[]
  codegenNode?: ConditionalExpression | CacheExpression
}

/**
 * 条件分支节点 - 单个条件分支
 */
export interface IfBranchNode extends Node {
  type: NodeTypes.IF_BRANCH
  condition: ExpressionNode | undefined // v-else 分支的条件为 undefined
  children: TemplateChildNode[]
  userKey?: AttributeNode | DirectiveNode
}

/**
 * 循环节点 - v-for 指令
 */
export interface ForNode extends Node {
  type: NodeTypes.FOR
  source: ExpressionNode
  valueAlias: ExpressionNode | undefined
  keyAlias: ExpressionNode | undefined
  objectIndexAlias: ExpressionNode | undefined
  parseResult: ForParseResult
  children: TemplateChildNode[]
  codegenNode?: ForCodegenNode
}

/**
 * 文本调用节点 - 文本处理的函数调用
 */
export interface TextCallNode extends Node {
  type: NodeTypes.TEXT_CALL
  content: TextNode | InterpolationNode | CompoundExpressionNode
  codegenNode: CallExpression | SimpleExpressionNode
}

// =============================================
// JavaScript AST 节点类型
// =============================================

/**
 * 所有 JavaScript 节点的基础接口
 */
export interface JSNode extends Node {}

/**
 * JavaScript 子节点联合类型
 */
export type JSChildNode =
  | VNodeCall
  | CallExpression
  | ObjectExpression
  | ArrayExpression
  | ExpressionNode
  | FunctionExpression
  | ConditionalExpression
  | CacheExpression
  | AssignmentExpression
  | SequenceExpression

/**
 * VNode 调用节点 - 创建虚拟节点的函数调用
 */
export interface VNodeCall extends JSNode {
  type: NodeTypes.VNODE_CALL
  tag: string | symbol | CallExpression
  props: PropsExpression | undefined
  children:
    | TemplateChildNode[] // multiple children
    | TemplateChildNode // single child
    | JSChildNode[]
    | JSChildNode
    | undefined
  patchFlag?: string | number
  dynamicProps?: string | SimpleExpressionNode
  directives?: DirectiveArguments
  isBlock?: boolean
  disableTracking?: boolean
  isComponent?: boolean
}

/**
 * JavaScript 调用表达式 - 函数调用
 */
export interface CallExpression extends JSNode {
  type: NodeTypes.JS_CALL_EXPRESSION
  callee: string | symbol | JSChildNode
  arguments: (string | symbol | JSChildNode | TemplateChildNode)[]
}

/**
 * JavaScript 对象表达式 - 对象字面量
 */
export interface ObjectExpression extends JSNode {
  type: NodeTypes.JS_OBJECT_EXPRESSION
  properties: Array<Property>
}

/**
 * JavaScript 属性节点 - 对象属性
 */
export interface Property extends JSNode {
  type: NodeTypes.JS_PROPERTY
  key: ExpressionNode
  value: JSChildNode
}

/**
 * JavaScript 数组表达式 - 数组字面量
 */
export interface ArrayExpression extends JSNode {
  type: NodeTypes.JS_ARRAY_EXPRESSION
  elements: Array<string | JSChildNode>
}

/**
 * JavaScript 函数表达式 - 函数定义
 */
export interface FunctionExpression extends JSNode {
  type: NodeTypes.JS_FUNCTION_EXPRESSION
  params: ExpressionNode[]
  returns?: TemplateChildNode | TemplateChildNode[] | JSChildNode
  body?: BlockStatement | IfStatement
  newline: boolean
  /**
   * 这是一个异步函数吗？
   * 仅在 <script setup> 中使用
   */
  isAsync?: boolean
  /**
   * 这是一个插槽函数吗？
   * 如果是，它将被包装在 () => {} 中
   */
  isSlot?: boolean
}

/**
 * JavaScript 条件表达式 - 三元运算符
 */
export interface ConditionalExpression extends JSNode {
  type: NodeTypes.JS_CONDITIONAL_EXPRESSION
  test: JSChildNode
  consequent: JSChildNode
  alternate: JSChildNode
  newline: boolean
}

/**
 * JavaScript 缓存表达式 - 缓存优化
 */
export interface CacheExpression extends JSNode {
  type: NodeTypes.JS_CACHE_EXPRESSION
  index: number
  value: JSChildNode
  isVNode: boolean
}

// =============================================
// SSR 专用 JavaScript AST 节点类型
// =============================================

/**
 * JavaScript 块语句 - 代码块
 */
export interface BlockStatement extends JSNode {
  type: NodeTypes.JS_BLOCK_STATEMENT
  body: (JSChildNode | IfStatement)[]
}

/**
 * JavaScript 模板字面量 - 模板字符串
 */
export interface TemplateLiteral extends JSNode {
  type: NodeTypes.JS_TEMPLATE_LITERAL
  elements: (string | JSChildNode)[]
}

/**
 * JavaScript if 语句 - 条件语句
 */
export interface IfStatement extends JSNode {
  type: NodeTypes.JS_IF_STATEMENT
  test: ExpressionNode
  consequent: BlockStatement
  alternate: IfStatement | BlockStatement | ReturnStatement | undefined
}

/**
 * JavaScript 赋值表达式 - 变量赋值
 */
export interface AssignmentExpression extends JSNode {
  type: NodeTypes.JS_ASSIGNMENT_EXPRESSION
  left: SimpleExpressionNode
  right: JSChildNode
}

/**
 * JavaScript 序列表达式 - 逗号运算符
 */
export interface SequenceExpression extends JSNode {
  type: NodeTypes.JS_SEQUENCE_EXPRESSION
  expressions: JSChildNode[]
}

/**
 * JavaScript 返回语句 - return 语句
 */
export interface ReturnStatement extends JSNode {
  type: NodeTypes.JS_RETURN_STATEMENT
  returns: TemplateChildNode | TemplateChildNode[] | JSChildNode
}

// =============================================
// 辅助类型定义
// =============================================

/**
 * 表达式节点联合类型
 */
export type ExpressionNode = SimpleExpressionNode | CompoundExpressionNode

/**
 * Props 表达式类型
 */
export type PropsExpression = ObjectExpression | CallExpression | ExpressionNode

/**
 * 指令参数类型
 */
export type DirectiveArguments = ArrayExpression | CallExpression

/**
 * 命名空间枚举
 */
export const enum Namespace {
  HTML,
  SVG,
  MATH_ML
}

/**
 * 常量类型枚举 - 用于静态分析优化
 */
export const enum ConstantTypes {
  NOT_CONSTANT = 0,
  CAN_SKIP_PATCH,
  CAN_HOIST,
  CAN_STRINGIFY
}

/**
 * 导入项接口
 */
export interface ImportItem {
  exp: string | ExpressionNode
  path: string
}

/**
 * 指令解析结果
 */
export interface DirectiveParseResult {
  content: ExpressionNode
  source: string
  arg?: ExpressionNode
  exp?: ExpressionNode
  modifiers: string[]
}

/**
 * v-for 解析结果
 */
export interface ForParseResult {
  source: ExpressionNode
  value: ExpressionNode | undefined
  key: ExpressionNode | undefined
  index: ExpressionNode | undefined
}

/**
 * v-for 代码生成节点
 */
export interface ForCodegenNode extends VNodeCall {
  isBlock: true
  tag: symbol
  props: undefined
  children: ForRenderListExpression
}

/**
 * v-for 渲染列表表达式
 */
export interface ForRenderListExpression extends CallExpression {
  callee: symbol // RENDER_LIST
  arguments: [ExpressionNode, ForIteratorExpression]
}

/**
 * v-for 迭代器表达式
 */
export interface ForIteratorExpression extends FunctionExpression {
  returns: VNodeCall
}

// =============================================
// 类型谓词（Type Guards）
// =============================================

/**
 * 判断是否为模板子节点
 */
export function isTemplateChildNode(node: any): node is TemplateChildNode {
  return node && typeof node.type === 'number' && node.type < NodeTypes.JS_CALL_EXPRESSION
}

/**
 * 判断是否为 JavaScript 节点
 */
export function isJSNode(node: any): node is JSChildNode {
  return node && typeof node.type === 'number' && node.type >= NodeTypes.JS_CALL_EXPRESSION
}

/**
 * 判断是否为表达式节点
 */
export function isExpressionNode(node: any): node is ExpressionNode {
  return node && (node.type === NodeTypes.SIMPLE_EXPRESSION || node.type === NodeTypes.COMPOUND_EXPRESSION)
}

/**
 * 判断是否为文本节点
 */
export function isTextNode(node: any): node is TextNode {
  return node && node.type === NodeTypes.TEXT
}

/**
 * 判断是否为元素节点
 */
export function isElementNode(node: any): node is ElementNode {
  return node && node.type === NodeTypes.ELEMENT
}

/**
 * 判断是否为组件节点
 */
export function isComponentNode(node: ElementNode): boolean {
  return node.tagType === ElementTypes.COMPONENT
}

/**
 * 判断是否为插槽节点
 */
export function isSlotNode(node: ElementNode): boolean {
  return node.tagType === ElementTypes.SLOT
}

/**
 * 判断是否为模板元素节点
 */
export function isTemplateElementNode(node: ElementNode): boolean {
  return node.tagType === ElementTypes.TEMPLATE
}

/**
 * 判断是否为静态表达式
 */
export function isStaticExp(node: any): node is SimpleExpressionNode {
  return node && node.type === NodeTypes.SIMPLE_EXPRESSION && node.isStatic
}
