import { isArray, isString } from '@vue/shared'
import { ElementTypes, NodeTypes } from './ast'
import { isSingleElementRoot } from './hoistStatic'
import { TO_DISPLAY_STRING } from './runtimeHelpers'
import { isVSlot } from './utils'

/**
 * transform 转换阶段的上下文对象
 * 用于在 AST 转换过程中传递状态、配置和工具方法
 */
export interface TransformContext {
  /**
   * AST 根节点
   * 保存整个抽象语法树的根节点引用，用于全局访问和最终的代码生成
   */
  root
  /**
   * 当前节点的父节点
   * 在深度优先遍历过程中，记录当前处理节点的父级节点
   * 主要用于节点替换操作和维护节点间的层级关系
   */
  parent: ParentNode | null
  /**
   * 当前节点在父节点中的索引位置
   * 表示当前节点在父节点的 children 数组中的位置
   * 用于精确定位和替换节点，确保操作的准确性
   */
  childIndex: number
  /**
   * 当前正在处理的 AST 节点
   * 在遍历转换过程中会不断更新，指向当前正在被转换的节点
   * 转换函数通过此属性获取和修改当前节点
   */
  currentNode
  /**
   * 帮助函数使用统计映射表
   * key: Symbol(帮助函数名称) - 如 CREATE_ELEMENT_VNODE, TO_DISPLAY_STRING 等
   * value: number(使用次数) - 记录该帮助函数在转换过程中被使用的次数
   * 最终用于代码生成阶段决定需要导入哪些帮助函数
   */
  helpers: Map<symbol, number>
  /**
   * 注册帮助函数的方法
   * @param name 帮助函数的 Symbol 标识
   * @returns 返回传入的 Symbol，支持链式调用
   * 作用：记录渲染函数中需要使用的帮助函数，如 createElementVNode、toDisplayString 等
   */
  helper<T extends symbol>(name: T): T
  /**
   * 节点转换函数数组
   * 包含所有用于转换不同类型 AST 节点的函数，如：
   * - transformElement: 转换元素节点
   * - transformText: 转换文本节点
   * - transformIf: 转换 v-if 指令节点
   * 这些函数按顺序应用到每个遍历到的节点上
   */
  nodeTransforms: any[]
  /**
   * 节点替换方法
   * @param node 新的节点对象
   * 作用：将当前节点替换为新节点，主要用于指令转换
   * 例如：将带有 v-if 的元素节点替换为条件表达式节点
   * 会同时更新父节点的 children 数组和 currentNode 引用
   */
  replaceNode(node): void
}

/**
 * 创建 transform 上下文
 */
export function createTransformContext(
  root,
  { nodeTransforms = [] }
): TransformContext {
  const context: TransformContext = {
    // === 配置选项 ===
    // 节点转换函数数组，包含所有用于转换 AST 节点的函数（如 transformElement、transformText 等）
    nodeTransforms,

    // === 状态数据 ===
    // AST 的根节点，保存整个语法树的起始点，用于最终生成代码时的全局引用
    root,
    // 帮助函数映射表，记录渲染函数中需要用到的帮助函数及其使用次数
    // key: Symbol(函数名)，value: 使用次数，如 CREATE_ELEMENT_VNODE -> 3
    helpers: new Map(),
    // 当前正在处理的 AST 节点，在遍历过程中会不断更新
    currentNode: root,
    // 当前节点的父节点，用于节点替换和上下文关系维护
    parent: null,
    // 当前节点在父节点 children 数组中的索引位置，用于精确定位和替换节点
    childIndex: 0,

    // === 工具方法 ===
    // 注册帮助函数的方法，用于记录渲染函数中需要导入的帮助函数
    // 例如：helper(CREATE_ELEMENT_VNODE) 会在 helpers Map 中记录该函数的使用
    helper(name) {
      const count = context.helpers.get(name) || 0
      context.helpers.set(name, count + 1)
      return name
    },
    // 替换当前节点的方法，用于将某个节点替换为新的节点（如 v-if 指令转换）
    // 会同时更新父节点的 children 数组和当前节点的引用
    replaceNode(node) {
      context.parent!.children[context.childIndex] = context.currentNode = node
    }
  }

  return context
}

/**
 * 根据 AST 生成 JavaScript AST
 * @param root AST
 * @param options 配置对象
 */
export function transform(root, options) {
  // 创建 transform 上下文
  const context = createTransformContext(root, options)
  // 按照深度优先依次处理 node 节点转化
  traverseNode(root, context)
  createRootCodegen(root)
  root.helpers = [...context.helpers.keys()]
  root.components = []
  root.directives = []
  root.imports = []
  root.hoists = []
  root.temps = []
  root.cached = []
}

/**
 * 遍历转化节点，转化的过程一定要是深度优先的（即：孙 -> 子 -> 父），因为当前节点的状态往往需要根据子节点的情况来确定。
 * 转化的过程分为两个阶段：
 * 1. 进入阶段：存储所有节点的转化函数到 exitFns 中
 * 2. 退出阶段：执行 exitFns 中缓存的转化函数，且一定是倒叙的。因为只有这样才能保证整个处理过程是深度优先的
 */
export function traverseNode(node, context: TransformContext) {
  // 通过上下文记录当前正在处理的 node 节点
  context.currentNode = node
  // 获取当前所有 node 节点的 transform 方法
  const { nodeTransforms } = context
  // 存储转化函数的数组
  const exitFns: any = []
  // 循环获取节点的 transform 方法，缓存到 exitFns 中
  for (let i = 0; i < nodeTransforms.length; i++) {
    const onExit = nodeTransforms[i](node, context)
    if (onExit) {
      // 指令的 transforms 返回为 数组，所以需要解构
      if (isArray(onExit)) {
        exitFns.push(...onExit)
      } else {
        exitFns.push(onExit)
      }
    }
    // 因为触发了 replaceNode，可能会导致 context.currentNode 发生变化，所以需要在这里校正
    if (!context.currentNode) {
      // 节点已删除
      return
    } else {
      // 节点更换
      node = context.currentNode
    }
  }

  // 继续转化子节点
  switch (node.type) {
    case NodeTypes.IF_BRANCH:
    case NodeTypes.ELEMENT:
    case NodeTypes.ROOT:
      traverseChildren(node, context)
      break
    // 处理插值表达式 {{}}
    case NodeTypes.INTERPOLATION:
      context.helper(TO_DISPLAY_STRING)
      break
    // v-if 指令处理
    case NodeTypes.IF:
      for (let i = 0; i < node.branches.length; i++) {
        traverseNode(node.branches[i], context)
      }
      break
  }

  // 在退出时执行 transform
  context.currentNode = node
  let i = exitFns.length
  while (i--) {
    exitFns[i]()
  }
}

/**
 * 循环处理子节点
 */
export function traverseChildren(parent, context: TransformContext) {
  parent.children.forEach((node, index) => {
    context.parent = parent
    context.childIndex = index
    traverseNode(node, context)
  })
}

/**
 * 生成 root 节点下的 codegen
 */
function createRootCodegen(root) {
  const { children } = root

  // 仅支持一个根节点的处理
  if (children.length === 1) {
    // 获取单个根节点
    const child = children[0]
    if (isSingleElementRoot(root, child) && child.codegenNode) {
      const codegenNode = child.codegenNode
      root.codegenNode = codegenNode
    }
  }
}

/**
 * 针对于指令的处理
 * @param name 正则。匹配具体的指令
 * @param fn 指令的具体处理方法，通常为闭包函数
 * @returns 返回一个闭包函数
 */
export function createStructuralDirectiveTransform(name: string | RegExp, fn) {
  const matches = isString(name)
    ? (n: string) => n === name
    : (n: string) => name.test(n)

  return (node, context) => {
    if (node.type === NodeTypes.ELEMENT) {
      const { props } = node
      // 结构的转换与 v-slot 无关
      if (node.tagType === ElementTypes.TEMPLATE && props.some(isVSlot)) {
        return
      }

      // 存储转化函数的数组
      const exitFns: any = []
      // 遍历所有的 props
      for (let i = 0; i < props.length; i++) {
        const prop = props[i]
        // 仅处理指令，并且该指令要匹配指定的正则
        if (prop.type === NodeTypes.DIRECTIVE && matches(prop.name)) {
          // 删除结构指令以避免无限递归
          props.splice(i, 1)
          i--
          // fn 会返回具体的指令函数
          const onExit = fn(node, prop, context)
          // 存储到数组中
          if (onExit) exitFns.push(onExit)
        }
      }
      // 返回包含所有函数的数组
      return exitFns
    }
  }
}
