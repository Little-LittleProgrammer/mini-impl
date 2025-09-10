# HMR (热模块替换) 功能说明

## 概述

mini-vite 现在完全支持模块级别的热更新（HMR），包括：

- ✅ **JavaScript 模块热更新**：支持模块级别的精确更新
- ✅ **CSS 样式热更新**：样式变化无需刷新页面
- ✅ **状态保持**：热更新时保留应用状态
- ✅ **错误处理**：热更新失败时自动回退
- ✅ **HMR API**：提供完整的 `import.meta.hot` API

## 功能特性

### 1. JavaScript 模块热更新

支持以下几种更新模式：

#### 自我接受更新
```javascript
// 方式1: 接受自身更新，无回调
if (import.meta.hot) {
    import.meta.hot.accept();
}

// 方式2: 接受自身更新，并提供回调处理
if (import.meta.hot) {
    import.meta.hot.accept((newModule) => {
        console.log('模块已热更新！', newModule);
        // 执行更新逻辑，可以访问新的模块内容
    });
}
```

#### 依赖更新处理
```javascript
// 处理特定依赖的更新
if (import.meta.hot) {
    import.meta.hot.accept(['./dependency.js'], ([newModule]) => {
        console.log('依赖模块已更新');
        // 处理依赖更新
    });
}
```

#### 状态保持
```javascript
if (import.meta.hot) {
    // 清理回调 - 保存状态
    import.meta.hot.dispose(() => {
        if (import.meta.hot.data) {
            import.meta.hot.data.savedState = currentState;
        }
    });
    
    // 从热更新数据中恢复状态
    if (import.meta.hot.data && import.meta.hot.data.savedState) {
        currentState = import.meta.hot.data.savedState;
    }
}
```

### 2. CSS 样式热更新

CSS 文件的更改会立即应用到页面，无需刷新：

```css
/* 修改这些样式会立即生效 */
.my-component {
    background: red; /* 尝试改为 blue */
    padding: 10px;   /* 尝试改为 20px */
}
```

### 3. 完整的 HMR API

#### `import.meta.hot.accept()`
- `accept()`：接受自身模块的更新，无回调
- `accept(callback)`：接受自身模块的更新，并提供更新回调
- `accept(dep, callback)`：接受特定依赖的更新
- `accept([deps], callback)`：接受多个依赖的更新

#### `import.meta.hot.dispose(callback)`
模块被替换前的清理回调

#### `import.meta.hot.decline()`
拒绝模块更新，触发全量刷新

#### `import.meta.hot.invalidate()`
使当前模块无效，触发全量刷新

#### `import.meta.hot.data`
在热更新间保持的数据对象

## 使用示例

### 基础计数器组件

```javascript
// counter.js
let count = 0;

export function createCounter() {
    const button = document.createElement('button');
    button.textContent = `Count: ${count}`;
    button.onclick = () => {
        count++;
        button.textContent = `Count: ${count}`;
    };
    return button;
}

// HMR 支持
if (import.meta.hot) {
    import.meta.hot.accept(() => {
        // 更新现有按钮
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => {
            if (btn.textContent.includes('Count:')) {
                btn.textContent = `Count: ${count} (已更新)`;
            }
        });
    });
    
    // 保存计数状态
    import.meta.hot.dispose(() => {
        if (import.meta.hot.data) {
            import.meta.hot.data.count = count;
        }
    });
    
    // 恢复计数状态
    if (import.meta.hot.data && typeof import.meta.hot.data.count === 'number') {
        count = import.meta.hot.data.count;
    }
}
```

### React 风格组件热更新

```javascript
// Component.js
export class Component {
    constructor(props) {
        this.props = props;
        this.state = { value: 0 };
    }
    
    render() {
        return `<div>Value: ${this.state.value}</div>`;
    }
    
    update() {
        // 组件更新逻辑
    }
}

if (import.meta.hot) {
    import.meta.hot.accept(() => {
        // 重新渲染所有组件实例
        Component.instances?.forEach(instance => {
            instance.update();
        });
    });
}
```

## 工作原理

### 1. 模块依赖图管理

系统自动追踪模块间的依赖关系：

```
main.js
├── utils.js
├── component.js
│   └── styles.css
└── api.js
```

当任何模块发生变化时，系统会：
1. 查找可以接受该更新的边界模块
2. 执行模块的热更新逻辑
3. 如果没有边界模块，则全量刷新

### 2. 更新传播机制

```
文件变化 → 依赖分析 → 查找边界 → 执行更新 → 状态保持
```

### 3. 错误处理

- 如果热更新失败，自动回退到全量刷新
- 显示友好的错误提示
- 保持开发服务器稳定运行

## 最佳实践

### 1. 模块边界设计

```javascript
// 好的实践：明确的边界模块
if (import.meta.hot) {
    import.meta.hot.accept(() => {
        // 清理旧状态
        cleanup();
        // 重新初始化
        init();
    });
}
```

### 2. 状态管理

```javascript
// 使用 data 对象保持状态
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        import.meta.hot.data.appState = getAppState();
    });
    
    if (import.meta.hot.data.appState) {
        restoreAppState(import.meta.hot.data.appState);
    }
}
```

### 3. 条件性热更新

```javascript
// 对于复杂组件，可能需要条件性更新
if (import.meta.hot) {
    import.meta.hot.accept((newModule) => {
        if (canHotUpdate(newModule)) {
            performHotUpdate(newModule);
        } else {
            import.meta.hot.invalidate();
        }
    });
}
```

## 调试和开发

### 1. HMR 日志

在浏览器控制台中查看 HMR 相关日志：

```
[mini-vite] connected
[HMR] hot updated: /src/component.js
[HMR] CSS热更新: /src/styles.css
```

### 2. 全局 API

在浏览器控制台中访问：

```javascript
// 查看模块缓存
window.__HMR_CACHE__

// 查看 HMR 连接状态  
window.__mini_vite__.socket.readyState

// 手动触发模块注册
window.__mini_vite__.registerModule('/src/myModule.js')
```

## 已知限制

1. **不支持的模块类型**：某些模块类型（如 WebAssembly）不支持热更新
2. **循环依赖**：复杂的循环依赖可能导致热更新失败
3. **全局状态**：全局变量的更改可能需要特殊处理

## 故障排除

### 问题：模块热更新失败

**解决方案：**
1. 检查是否正确使用了 `import.meta.hot.accept()`
2. 确认模块没有语法错误
3. 查看浏览器控制台的错误信息

### 问题：状态丢失

**解决方案：**
1. 使用 `import.meta.hot.data` 保存状态
2. 在 `dispose` 回调中正确保存数据
3. 在模块重新加载时恢复状态

### 问题：CSS 热更新不生效

**解决方案：**
1. 确认 CSS 文件被正确导入
2. 检查样式选择器的优先级
3. 清除浏览器缓存

---

🔥 **享受热更新带来的开发体验提升！**
