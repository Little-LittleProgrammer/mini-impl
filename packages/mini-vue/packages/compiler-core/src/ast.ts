import { isString } from '@vue/shared'
import { CREATE_ELEMENT_VNODE } from './runtimeHelpers'

/**
 * AST 节点类型枚举
 * 定义了编译器中所有可能的节点类型，涵盖解析、转换和代码生成阶段
 */
export const enum NodeTypes {
	// === 基础 AST 节点类型 ===
	/**
	 * 根节点 - AST 的顶层节点
	 * 包含整个模板的所有子节点，是语法树的入口点
	 * 示例：整个 <template> 的内容
	 */
	ROOT,
	
	/**
	 * 元素节点 - HTML 标签元素
	 * 表示 HTML 元素，如 <div>、<span>、<component> 等
	 * 包含标签名、属性、子节点等信息
	 */
	ELEMENT,
	
	/**
	 * 文本节点 - 纯文本内容
	 * 表示模板中的纯文本部分
	 * 示例：<div>这是文本</div> 中的"这是文本"
	 */
	TEXT,
	
	/**
	 * 注释节点 - HTML 注释
	 * 表示模板中的注释内容 <!-- -->
	 * 通常在开发模式下保留，生产模式可能被移除
	 */
	COMMENT,
	
	/**
	 * 简单表达式节点 - JavaScript 表达式
	 * 表示简单的 JS 表达式，如变量名、属性访问等
	 * 示例：{{ msg }} 中的 "msg"，v-if="show" 中的 "show"
	 */
	SIMPLE_EXPRESSION,
	
	/**
	 * 插值表达式节点 - 双大括号表达式
	 * 表示模板中的插值语法 {{ }}
	 * 示例：{{ message }}、{{ user.name }}
	 */
	INTERPOLATION,
	
	/**
	 * 属性节点 - HTML 属性
	 * 表示普通的 HTML 属性，如 class、id、data-* 等
	 * 示例：<div class="container" id="app">
	 */
	ATTRIBUTE,
	
	/**
	 * 指令节点 - Vue 指令
	 * 表示 Vue 的指令，如 v-if、v-for、v-model 等
	 * 包含指令名、参数、修饰符和表达式
	 */
	DIRECTIVE,

	// === 容器节点类型 ===
	/**
	 * 复合表达式节点 - 多个表达式的组合
	 * 用于合并相邻的文本和插值表达式
	 * 示例：hello {{ name }} world -> "hello " + _toDisplayString(name) + " world"
	 */
	COMPOUND_EXPRESSION,
	
	/**
	 * 条件节点 - v-if 指令的容器
	 * 包含所有相关的条件分支（v-if、v-else-if、v-else）
	 * 用于组织整个条件渲染的逻辑结构
	 */
	IF,
	
	/**
	 * 条件分支节点 - 单个条件分支
	 * 表示 v-if、v-else-if 或 v-else 的单个分支
	 * 包含条件表达式和对应的子节点
	 */
	IF_BRANCH,
	
	/**
	 * 循环节点 - v-for 指令
	 * 表示列表渲染的循环结构
	 * 包含迭代变量、数据源和循环体
	 */
	FOR,
	
	/**
	 * 文本调用节点 - 文本处理的函数调用
	 * 用于表示需要特殊处理的文本内容
	 * 通常用于优化文本渲染性能
	 */
	TEXT_CALL,

	// === 代码生成节点类型 ===
	/**
	 * VNode 调用节点 - 创建虚拟节点的函数调用
	 * 表示 createElementVNode 或 createVNode 的函数调用
	 * 转换阶段将 ELEMENT 节点转换为此类型
	 */
	VNODE_CALL,
	
	/**
	 * JavaScript 调用表达式 - 函数调用
	 * 表示 JavaScript 中的函数调用表达式
	 * 如：_toDisplayString(msg)、_resolveComponent("MyComponent")
	 */
	JS_CALL_EXPRESSION,
	
	/**
	 * JavaScript 对象表达式 - 对象字面量
	 * 表示 JavaScript 对象字面量语法 {}
	 * 用于生成 props 对象、事件对象等
	 */
	JS_OBJECT_EXPRESSION,
	
	/**
	 * JavaScript 属性节点 - 对象属性
	 * 表示对象中的键值对属性
	 * 如：{ class: "container", onClick: handler }
	 */
	JS_PROPERTY,
	
	/**
	 * JavaScript 数组表达式 - 数组字面量
	 * 表示 JavaScript 数组字面量语法 []
	 * 用于生成子节点数组、参数数组等
	 */
	JS_ARRAY_EXPRESSION,
	
	/**
	 * JavaScript 函数表达式 - 函数定义
	 * 表示匿名函数或箭头函数的定义
	 * 用于生成事件处理器、作用域函数等
	 */
	JS_FUNCTION_EXPRESSION,
	
	/**
	 * JavaScript 条件表达式 - 三元运算符
	 * 表示条件运算符 condition ? consequent : alternate
	 * v-if 指令最终会转换为此类型的表达式
	 */
	JS_CONDITIONAL_EXPRESSION,
	
	/**
	 * JavaScript 缓存表达式 - 缓存优化
	 * 用于缓存重复计算的表达式，优化渲染性能
	 * 通常用于静态提升和计算缓存
	 */
	JS_CACHE_EXPRESSION,

	// === SSR（服务端渲染）专用节点类型 ===
	/**
	 * JavaScript 块语句 - 代码块
	 * 表示用大括号包围的代码块 { ... }
	 * SSR 模式下用于生成复杂的控制流结构
	 */
	JS_BLOCK_STATEMENT,
	
	/**
	 * JavaScript 模板字面量 - 模板字符串
	 * 表示模板字符串语法 `...${expression}...`
	 * SSR 模式下用于高效的字符串拼接
	 */
	JS_TEMPLATE_LITERAL,
	
	/**
	 * JavaScript if 语句 - 条件语句
	 * 表示 if/else 条件控制语句
	 * SSR 模式下用于生成条件渲染的控制流
	 */
	JS_IF_STATEMENT,
	
	/**
	 * JavaScript 赋值表达式 - 变量赋值
	 * 表示变量赋值操作 variable = value
	 * SSR 模式下用于变量的赋值和状态管理
	 */
	JS_ASSIGNMENT_EXPRESSION,
	
	/**
	 * JavaScript 序列表达式 - 逗号运算符
	 * 表示逗号分隔的表达式序列 expr1, expr2, expr3
	 * SSR 模式下用于组合多个操作
	 */
	JS_SEQUENCE_EXPRESSION,
	
	/**
	 * JavaScript 返回语句 - return 语句
	 * 表示函数的返回语句 return value
	 * SSR 模式下用于生成渲染函数的返回值
	 */
	JS_RETURN_STATEMENT
}

/**
 * Element 标签类型
 */
export const enum ElementTypes {
	/**
	 * element，例如：<div>
	 */
	ELEMENT,
	/**
	 * 组件
	 */
	COMPONENT,
	/**
	 * 插槽
	 */
	SLOT,
	/**
	 * template
	 */
	TEMPLATE
}

export function createVNodeCall(context, tag, props?, children?) {
	if (context) {
		context.helper(CREATE_ELEMENT_VNODE)
	}

	return {
		type: NodeTypes.VNODE_CALL,
		tag,
		props,
		children
	}
}

/**
 * return hello {{ msg }} 复合表达式
 */
export function createCompoundExpression(children, loc) {
	return {
		type: NodeTypes.COMPOUND_EXPRESSION,
		loc,
		children
	}
}

/**
 * 创建条件表达式的节点
 */
export function createConditionalExpression(
	test,
	consequent,
	alternate,
	newline = true
) {
	return {
		type: NodeTypes.JS_CONDITIONAL_EXPRESSION,
		test,
		consequent,
		alternate,
		newline,
		loc: {}
	}
}

/**
 * 创建调用表达式的节点
 */
export function createCallExpression(callee, args) {
	return {
		type: NodeTypes.JS_CALL_EXPRESSION,
		loc: {},
		callee,
		arguments: args
	}
}

/**
 * 创建简单的表达式节点
 */
export function createSimpleExpression(content, isStatic) {
	return {
		type: NodeTypes.SIMPLE_EXPRESSION,
		loc: {},
		content,
		isStatic
	}
}

/**
 * 创建对象属性节点
 */
export function createObjectProperty(key, value) {
	return {
		type: NodeTypes.JS_PROPERTY,
		loc: {},
		key: isString(key) ? createSimpleExpression(key, true) : key,
		value
	}
}