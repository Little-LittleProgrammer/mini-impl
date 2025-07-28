# CommonJS 模块支持

## 概述

mini-vite 现在完全支持 CommonJS 模块与 ES 模块的混合使用，实现了以下核心功能：

1. **依赖预构建时的 CommonJS 转换**：自动将 CommonJS 第三方依赖转换为 ES 模块格式
2. **运行时 CommonJS 兼容性**：支持在项目源码中使用 CommonJS 语法
3. **混合模块格式支持**：同一项目中可以同时使用 ES 模块和 CommonJS 模块

## 功能特性

### 1. 导出语法转换

#### exports.xxx 转换
```javascript
// 原始 CommonJS 代码
exports.add = function(a, b) {
    return a + b;
};
exports.PI = 3.14159;

// 自动转换为（保留原代码 + 添加 ES 导出）
exports.add = function(a, b) {
    return a + b;
};
const add = exports.add;
export { add };
const PI = exports.PI;
exports.PI = 3.14159;
export { PI };
```

#### module.exports 转换
```javascript
// 原始 CommonJS 代码
module.exports = {
    Calculator: Calculator,
    createCalculator: createCalculator,
};

// 自动转换为
module.exports = {
    Calculator: Calculator,
    createCalculator: createCalculator,
};
export default {
    Calculator: Calculator,
    createCalculator: createCalculator,
};
export { Calculator, createCalculator};
```

### 2. require() 函数支持

提供浏览器环境下的 `require()` 函数模拟实现：

```javascript
// CommonJS require() 浏览器兼容实现
function __createRequire() {
    const moduleCache = new Map();
    
    return function require(id) {
        // 缓存支持
        if (moduleCache.has(id)) {
            return moduleCache.get(id);
        }
        
        // 相对路径和第三方包的处理逻辑
        // ...
    };
}
```

### 3. 全局变量 Polyfill

自动注入 CommonJS 全局变量：

```javascript
// CommonJS 全局变量 polyfill
if (typeof module === 'undefined') {
    var module = { exports: {} };
}
if (typeof exports === 'undefined') {
    var exports = module.exports;
}
```

## 使用示例

### 创建 CommonJS 模块

**math.js** (使用 exports.xxx)
```javascript
// 基础数学运算
exports.add = function(a, b) {
    return a + b;
};

exports.subtract = function(a, b) {
    return a - b;
};

exports.PI = 3.14159;
```

**calculator.js** (使用 module.exports)
```javascript
function Calculator() {
    this.result = 0;
}

Calculator.prototype.add = function(value) {
    this.result += value;
    return this;
};

module.exports = {
    Calculator: Calculator,
    createCalculator: () => new Calculator(),
};
```

### 在 ES 模块中使用 CommonJS

**main.ts**
```typescript
// ES 模块导入 CommonJS (exports.xxx)
import * as math from './math.js';
console.log('Addition:', math.add(5, 3));
console.log('PI:', math.PI);

// ES 模块导入 CommonJS (module.exports)
import calculatorModule from './calculator.js';
const { Calculator, createCalculator } = calculatorModule;

const calc = createCalculator();
const result = calc.add(10).multiply(2).getValue();
console.log('Result:', result);

// 使用 require()（实验性）
// const mathModule = require('./math.js');
```

## 依赖预构建增强

在依赖预构建阶段，mini-vite 使用增强的 esbuild 配置来处理 CommonJS 依赖：

```javascript
await build({
    entryPoints: [...deps],
    write: true,
    bundle: true,
    format: "esm",              // 输出 ES 模块格式
    splitting: true,
    platform: 'browser',        // 浏览器平台
    target: 'esnext',           // 现代浏览器目标
    mainFields: ['module', 'browser', 'main'], // 模块解析优先级
    conditions: ['module', 'browser', 'import'], // 导入条件
    define: {
        'global': 'globalThis',           // 全局变量处理
        'process.env.NODE_ENV': '"development"'
    }
});
```

## 插件架构

CommonJS 支持通过 `commonjsPlugin()` 插件实现，插件执行顺序为：

1. `resolvePlugin()` - 路径解析
2. `esbuildTransformPlugin()` - TypeScript/JSX 转换
3. **`commonjsPlugin()`** - CommonJS 兼容性处理
4. `importAnalysisPlugin()` - 导入分析和路径重写
5. `cssPlugin()` - CSS 处理

## 测试方法

1. 启动开发服务器：
   ```bash
   cd packages/playground
   pnpm mini-vite serve
   ```

2. 打开浏览器访问 `http://localhost:3001`

3. 查看控制台输出，应该能看到 CommonJS 模块的测试结果

## 支持的文件类型

- `.js` - JavaScript 文件
- `.cjs` - CommonJS 文件
- `.mjs` - ES 模块文件
- `.ts` - TypeScript 文件
- `.cts` - CommonJS TypeScript 文件
- `.mts` - ES 模块 TypeScript 文件

## 注意事项

1. **require() 限制**：浏览器环境下的 `require()` 是模拟实现，主要用于向后兼容，建议优先使用 ES 模块语法

2. **动态导入**：对于相对路径的动态 require，建议使用标准的 `import()` 语法

3. **性能考虑**：CommonJS 转换会增加少量运行时开销，建议在新项目中直接使用 ES 模块

4. **调试**：转换后的代码在浏览器调试工具中可能与源码略有差异

## 故障排除

如果遇到 CommonJS 模块加载问题：

1. 检查文件扩展名是否正确
2. 确认模块导出语法是否符合 CommonJS 规范
3. 查看浏览器控制台是否有错误信息
4. 验证插件执行顺序是否正确 