# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

mini-impl 是一个学习型项目，实现知名前端库的 mini 版本源码。目前包含：
- **mini-vite**: Vite 核心功能的简化实现
- **mini-vue**: Vue 核心功能的简化实现
- **playground**: 用于测试 mini-vite 和 mini-vue 的示例项目

## Commands

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 开发模式 (监听文件变化)
pnpm dev

# 代码检查
pnpm lint

# 测试
pnpm test

# 代码格式化
pnpm format

# 交互式提交 (使用 czg)
pnpm commit
```

### 单独包命令

```bash
# mini-vite
cd packages/mini-vite
pnpm build    # 构建产物
pnpm dev      # 开发模式，监听文件变化

# mini-vue
cd packages/mini-vue
pnpm build    # rollup 构建
pnpm dev      # rollup 监听模式

# playground
cd packages/playground
pnpm dev      # 使用 mini-vite 启动开发服务器
```

## Architecture

### Monorepo 结构

使用 pnpm workspaces + Turborepo 管理：
- `pnpm-workspace.yaml` 定义包目录和 catalog（共享依赖版本）
- `turbo.json` 定义任务依赖关系和缓存策略

### mini-vite 架构 (`packages/mini-vite/src/node/`)

核心模块：
- `server/` - 开发服务器，使用 connect 作为 HTTP 服务器
- `plugins/` - 插件系统实现（resolve, esbuild, importAnalysis, cjs, css）
- `optimizer/` - 依赖预构建，使用 esbuild 扫描和打包第三方依赖
- `plugin.ts` - 插件接口定义（类似 Rollup 插件）
- `transformRequest.ts` - 模块转换流程：resolveId -> load -> transform

关键流程：
1. CLI 启动 → 创建服务器 → 依赖预构建
2. 浏览器请求 → 中间件处理 → 插件容器转换 → 返回结果

### mini-vue 架构 (`packages/mini-vue/packages/`)

模块划分：
- `reactivity/` - 响应式系统（effect, reactive, ref, computed）
- `compiler-core/` - 编译器核心（模板解析、AST 生成）
- `compiler-dom/` - 浏览器特定编译
- `runtime-core/` - 运行时核心（虚拟 DOM、组件系统）
- `runtime-dom/` - 浏览器 DOM 操作
- `shared/` - 共享工具函数
- `vue/` - 入口，整合所有模块

## Code Style

- ESLint 配置继承 `@q-front-npm-configs/eslint/eslint-tslib`
- Prettier: 单引号、无分号、80 字符宽度、tabWidth=4
- 使用 TypeScript，输出 ESM 格式