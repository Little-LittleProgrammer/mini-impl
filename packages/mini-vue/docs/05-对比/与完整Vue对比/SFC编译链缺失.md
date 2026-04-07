# SFC 编译链缺失

## 1. 为什么完整 Vue 开发离不开 SFC 编译链

真实 Vue 项目大多以 `.vue` 单文件组件为基本单元。也就是说，框架真正面对的不是单独一段模板，而是一个同时包含：

- `<template>`
- `<script>`
- `<script setup>`
- `<style>`

的复合文件格式。

## 2. 完整 Vue 的实现原理

完整 Vue 的 `compiler-sfc` 会把一个 `.vue` 文件拆成多个 block，再分别处理。

第一步是 `parse`：

- 识别出 template、script、style、自定义 block
- 记录每个 block 的源码区间、属性和语言类型

第二步是针对不同 block 走不同编译：

- `compileTemplate` 负责把模板编成 render 函数代码
- `compileScript` 负责合并普通 script 和 `script setup`
- `compileStyle` 负责 scoped CSS、CSS Modules、变量注入等

其中 `script setup` 的处理尤其复杂。它要做：

- 宏语法识别，如 `defineProps`、`defineEmits`
- 顶层绑定分析
- 模板可见变量暴露
- 与模板编译结果对接

`scoped style` 的实现则依赖给组件和模板节点注入作用域 id，再在编译后的选择器上附加对应属性选择器。

为了让工程链正常工作，SFC 编译链还要输出：

- source map
- HMR 需要的元信息
- 类型推导辅助信息
- 给打包器消费的中间结果

## 3. 为什么这部分决定了“能不能用于真实开发”

没有 SFC 编译链，框架依然可以演示运行时原理；但只要进入真实项目，就会立刻缺失：

- `.vue` 文件入口
- `script setup`
- scoped CSS
- 与构建工具的协作

这就是为什么它是完整 Vue 和教学实现之间最明显的工程分界线之一。

## 4. 理解重点

完整 Vue 的编译器不是单个模板编译器，而是一条围绕 `.vue` 文件展开的多阶段工程流水线。
