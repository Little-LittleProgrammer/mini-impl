# Vite 关键概念（mini-vite 未实现）

本文档整理 Vite 中非常关键的概念和机制，这些在 mini-vite 中未实现，但对于理解完整的 Vite 工作原理至关重要。

## 一、环境变量系统

### 概念说明

Vite 通过 `.env` 文件管理不同环境下的配置变量，是项目配置的核心机制。

### Vite 实现

```typescript
// .env 文件加载
VITE_API_URL=https://api.example.com
VITE_APP_TITLE=My App

// .env.development
VITE_API_URL=http://localhost:3000

// .env.production
VITE_API_URL=https://prod.example.com
```

**使用方式**

```typescript
// 源码中访问
const apiUrl = import.meta.env.VITE_API_URL

// 注入到代码中
// vite 通过 define 配置替换
const env = {
    VITE_API_URL: "https://api.example.com",
    MODE: "production",
    DEV: false,
    PROD: true,
    SSR: false
}
```

### 核心机制

1. **文件加载优先级**
   - `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`

2. **变量命名规则**
   - 只有 `VITE_` 前缀的变量会暴露给客户端
   - 其他变量仅服务端可用

3. **define 替换**
   - 构建时静态替换，非运行时读取

### 为什么关键

- 区分开发/生产环境配置
- 安全隔离敏感变量（非 VITE_ 前缀）
- 支持多环境部署（staging、preview 等）

---

## 二、配置文件系统

### 概念说明

`vite.config.ts` 是 Vite 的配置入口，支持 JS/TS/MJS 多种格式，提供完整的配置能力。

### Vite 配置结构

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    // 基础配置
    root: './src',
    base: '/app/',
    publicDir: 'public',
    
    // 环境变量
    envDir: './env',
    envPrefix: 'VITE_',
    
    // 开发服务器
    server: {
        host: '0.0.0.0',
        port: 3000,
        strictPort: true,
        https: true,
        open: true,
        cors: true,
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                rewrite: path => path.replace(/^\/api/, '')
            }
        },
        hmr: {
            overlay: true
        }
    },
    
    // 构建配置
    build: {
        target: 'es2015',
        outDir: 'dist',
        assetsDir: 'assets',
        assetsInlineLimit: 4096,
        cssCodeSplit: true,
        sourcemap: true,
        minify: 'esbuild',
        rollupOptions: {
            input: {
                main: 'index.html',
                admin: 'admin.html'
            }
        }
    },
    
    // CSS 配置
    css: {
        modules: {
            localsConvention: 'camelCase'
        },
        preprocessorOptions: {
            scss: {
                additionalData: `$injectedColor: orange;`
            }
        },
        postcss: {
            plugins: [autoprefixer()]
        }
    },
    
    // 优化配置
    optimizeDeps: {
        include: ['my-lib'],
        exclude: ['my-linked-lib'],
        esbuildOptions: { target: 'es2020' }
    },
    
    // 插件
    plugins: [vue()],
    
    // SSR
    ssr: {
        noExternal: ['some-lib']
    }
})
```

### 配置解析流程

```
1. 加载配置文件
   ↓
2. 支持 JS/TS/MJS 格式
   ↓
3. 执行 defineConfig 函数
   ↓
4. 合默认配置
   ↓
5. 执行 config 钩子
   ↓
6. 执行 configResolved 钩子
   ↓
7. 配置锁定，开始服务
```

### 为什么关键

- 项目定制的核心入口
- 插件、构建、开发服务器的统一配置
- 支持环境感知的动态配置

---

## 三、生产构建系统

### 概念说明

`vite build` 将源码打包为生产产物，是 Vite 作为完整构建工具的核心能力。

### 构建流程

```
vite build
    ↓
1. 配置加载
    ↓
2. 入口分析（HTML -> JS -> CSS）
    ↓
3. Rollup 打包
    ↓
4. CSS 分离
    ↓
5. 资源处理（图片、字体）
    ↓
6. 代码压缩（esbuild/terser）
    ↓
7. 生成 manifest
    ↓
8. 输出到 dist/
```

### 核心能力

| 能力 | 说明 |
|------|------|
| CSS 代码分割 | 每个 chunk 有独立 CSS 文件 |
| 资源 hash | 文件名带内容 hash，利于缓存 |
| 代码分割 | 动态 import 自动分割 chunk |
| Tree Shaking | 移除未使用代码 |
| Source Map | 支持调试生产代码 |
| 资源内联 | 小于 threshold 的资源 base64 内联 |

### 输出结构

```
dist/
├── index.html            # 入口 HTML（已注入资源）
├── assets/
│   ├── index.abc123.js   # 主 JS chunk
│   ├── vendor.def456.js  # 第三方依赖 chunk
│   ├── index.ghi789.css  # CSS 文件
│   ├── logo.123abc.png   # 图片资源
│   └── manifest.json     # 资源映射
```

### 为什么关键

- 生产部署必需
- Rollup 的完整能力
- 与开发体验无缝衔接

---

## 四、CSS Modules

### 概念说明

CSS Modules 提供局部作用域的 CSS，避免样式冲突，是组件化开发的关键。

### 使用方式

```typescript
// App.module.css
.container {
    padding: 20px;
}
.title {
    color: red;
}

// App.tsx
import styles from './App.module.css'

export function App() {
    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Hello</h1>
        </div>
    )
}

// 编译后
// 类名变为: _container_abc123, _title_def456
```

### Vite 处理流程

```
.module.css 文件请求
    ↓
1. 读取 CSS 内容
    ↓
2. 生成局部类名（hash）
    ↓
3. 返回 JS 模块（类名映射）
    ↓
4. 注入转换后的 CSS
```

### 返回格式

```javascript
// 开发模式
export default {
    container: "_container_abc123",
    title: "_title_def456"
}

// 生产模式（更紧凑）
export default { container: "A", title: "B" }
```

### 为什么关键

- 组件样式隔离
- 避免 CSS 全局污染
- 支持类名复用和组合

---

## 五、CSS 预处理器

### 概念说明

Vite 支持 Sass、Less、Stylus 等 CSS 预处理器，是现代前端开发的基础能力。

### 使用方式

```typescript
// 安装预处理器
npm add -D sass

// 使用
import './App.scss'

// App.scss
$primary-color: #1890ff;

.container {
    background: $primary-color;
    
    &:hover {
        opacity: 0.8;
    }
}
```

### Vite 处理流程

```
.scss/.less/.styl 文件请求
    ↓
1. 检测预处理器类型
    ↓
2. 调用预处理器编译
    ↓
3. 返回编译后的 CSS
    ↓
4. 注入到页面
```

### 配置选项

```typescript
// vite.config.ts
export default {
    css: {
        preprocessorOptions: {
            scss: {
                // 全局变量注入
                additionalData: `$theme: 'dark';`,
                // API 类型
                api: 'modern-compiler'
            },
            less: {
                math: 'always',
                globalVars: {
                    primary: '#1890ff'
                }
            }
        }
    }
}
```

### 为什么关键

- CSS 编程能力（变量、嵌套、函数）
- 统一的样式系统
- 大型项目的样式管理

---

## 六、PostCSS 处理

### 概念说明

PostCSS 是 CSS 后处理器，支持 autoprefixer、CSS 变量、压缩等转换。

### 使用方式

```typescript
// postcss.config.js
export default {
    plugins: [
        autoprefixer(),
        postcssPresetEnv(),
        cssnano()
    ]
}

// 或 vite.config.ts
export default {
    css: {
        postcss: {
            plugins: [autoprefixer()]
        }
    }
}
```

### 处理效果

```css
/* 输入 */
.container {
    display: flex;
    user-select: none;
}

/* autoprefixer 输出 */
.container {
    display: -webkit-box;
    display: -webkit-flex;
    display: flex;
    -webkit-user-select: none;
    user-select: none;
}
```

### 为什么关键

- CSS 兼容性处理
- 未来 CSS 特性支持
- CSS 优化压缩

---

## 七、模块预加载优化

### 概念说明

Vite 通过预加载提示优化模块加载顺序，减少瀑布流请求。

### preload 配置

```typescript
// vite.config.ts
export default {
    build: {
        modulePreload: {
            polyfill: true,  // 自动注入 preload polyfill
            resolveDependencies: (filename, deps) => {
                // 自定义预加载策略
                return deps.filter(d => d.includes('vendor'))
            }
        }
    }
}
```

### HTML 中的预加载

```html
<!-- Vite 自动注入 -->
<link rel="modulepreload" href="/assets/vendor.js">
<link rel="modulepreload" href="/assets/utils.js">
```

### 动态预加载

```typescript
// 动态导入自动预加载
const module = await import('./heavy-module.js')

// Vite 注入预加载提示
<link rel="modulepreload" href="/assets/heavy-module.js">
```

### 为什么关键

- 减少瀑布流请求延迟
- 优化首屏加载时间
- 提升用户体验

---

## 八、Source Map

### 概念说明

Source Map 映射编译后代码到源码，支持调试生产代码和查看原始错误位置。

### 配置

```typescript
// vite.config.ts
export default {
    build: {
        sourcemap: true,        // 生成完整 sourcemap
        // 或 'hidden' - 生成但不暴露
        // 或 'inline' - 内联到文件
    }
}
```

### 开发模式 Source Map

```typescript
// mini-vite 使用 esbuild 时
esbuild.build({
    sourcemap: 'linked',  // 外部 sourcemap 文件
    // 或 'inline' - 内联
})
```

### 效果

```javascript
// 浏览器控制台
// 错误显示源码位置而非编译后位置
Error: undefined is not a function
    at handleClick (App.tsx:25)  // ← 源码位置
```

### 为什么关键

- 生产环境调试
- 错误追踪和监控
- 开发体验一致性

---

## 九、代理配置

### 概念说明

开发服务器代理解决跨域问题，将请求转发到后端服务。

### 配置

```typescript
// vite.config.ts
export default {
    server: {
        proxy: {
            // 字符串简写
            '/api': 'http://localhost:8080',
            
            // 完整配置
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                rewrite: path => path.replace(/^\/api/, ''),
                headers: {
                    'X-Custom': 'value'
                },
                configure: (proxy, options) => {
                    proxy.on('error', (err) => { ... })
                }
            },
            
            // WebSocket 代理
            '/socket': {
                target: 'ws://localhost:8080',
                ws: true
            }
        }
    }
}
```

### 代理原理

```
浏览器请求: /api/users
    ↓
Vite Dev Server 接收
    ↓
http-proxy-middleware 处理
    ↓
转发到: http://localhost:8080/users
    ↓
返回响应给浏览器
```

### 为什么关键

- 开发环境跨域解决方案
- 与真实后端集成开发
- WebSocket 代理支持

---

## 十、public 目录

### 概念说明

public 目录存放无需构建处理的静态资源，直接复制到输出目录。

### 使用方式

```
project/
├── public/
│   ├── favicon.ico
│   ├── robots.txt
│   └── images/
│       └── logo.png
├── src/
└── index.html

// 访问方式
// 开发: /favicon.ico
// 生产: /favicon.ico
// 无需 import，直接在 HTML 中引用
```

### HTML 引用

```html
<link rel="icon" href="/favicon.ico">
<img src="/images/logo.png">
```

### 与 assets 的区别

| public | assets（src/assets） |
|--------|---------------------|
| 无需 import | 需要 import |
| 无 hash | 有 hash |
| 直接复制 | 经过构建处理 |
| URL 固定 | URL 动态生成 |

### 为什么关键

- favicon、robots 等固定文件
- 第三方静态资源
- 不参与构建的资源

---

## 十一、多入口支持

### 概念说明

多入口支持构建多页面应用（MPA），每个入口独立打包。

### 配置

```typescript
// vite.config.ts
export default {
    build: {
        rollupOptions: {
            input: {
                main: 'index.html',
                admin: 'admin.html',
                landing: 'landing.html'
            }
        }
    }
}
```

### 入口 HTML

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Main App</title>
</head>
<body>
    <script type="module" src="/src/main.js"></script>
</body>
</html>

<!-- admin.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Admin Panel</title>
</head>
<body>
    <script type="module" src="/src/admin.js"></script>
</body>
</html>
```

### 输出结构

```
dist/
├── index.html
├── admin.html
├── landing.html
├── assets/
│   ├── index.[hash].js
│   ├── admin.[hash].js
│   ├── landing.[hash].js
│   └── shared.[hash].js  # 共享代码 chunk
```

### 为什么关键

- 多页面应用支持
- 入口隔离与共享优化
- 灵活的部署策略

---

## 十二、错误 Overlay

### 概念说明

Vite 提供可视化的错误展示界面，直接在浏览器中显示构建错误和运行时错误。

### Overlay 功能

```
┌─────────────────────────────────────┐
│  ✘ Error                            │
│                                     │
│  Failed to compile:                 │
│                                     │
│  ./src/App.tsx                      │
│  Line 25: Cannot read property      │
│           'name' of undefined       │
│                                     │
│  const name = user.name;            │
│               ^                     │
│                                     │
│  [Click to open in editor]          │
└─────────────────────────────────────┘
```

### 配置

```typescript
// vite.config.ts
export default {
    server: {
        hmr: {
            overlay: true  // 显示错误 overlay
        }
    }
}
```

### 实现原理

```typescript
// client/overlay.ts
// 1. 监听 WebSocket error 消息
// 2. 创建 overlay DOM 元素
// 3. 显示错误信息和源码位置
// 4. 支持点击打开编辑器
```

### 为什么关键

- 即时错误反馈
- 减少开发调试时间
- 提升开发体验

---

## 十三、SSR 支持

### 概念说明

SSR（服务端渲染）在服务器生成 HTML，提升首屏性能和 SEO。

### Vite SSR 能力

```typescript
// server-entry.js
export async function render(url) {
    const app = createApp()
    const router = app.use(router)
    await router.push(url)
    return app.renderToString()
}

// 服务器使用
import { render } from './server-entry.js'
const html = await render('/about')
```

### SSR 配置

```typescript
// vite.config.ts
export default {
    ssr: {
        noExternal: ['vue'],  // 不预构建的 SSR 依赖
        external: ['axios'],  // SSR 外部依赖
        target: 'node',       // SSR 目标环境
    }
}
```

### SSR 构建流程

```
vite build --ssr
    ↓
1. 客户端构建（常规）
    ↓
2. SSR 构建（server-entry）
    ↓
3. 生成 SSR manifest
    ↓
4. 输出客户端 + SSR 产物
```

### 为什么关键

- 首屏性能优化
- SEO 友好
- 同构应用支持

---

## 十四、手动 HMR 边界控制

### 概念说明

通过 `import.meta.hot` API 手动控制 HMR 更新边界，实现精确的热更新。

### HMR API

```typescript
// 接受自更新
import.meta.hot.accept((newMod) => {
    console.log('Module updated')
})

// 接受依赖更新
import.meta.hot.accept(['./utils.js'], (mods) => {
    // utils.js 更新时执行
})

// 清理副作用
import.meta.hot.dispose(() => {
    clearInterval(timer)
})

// 保存跨更新数据
import.meta.hot.data.timer = timer

// 拒绝更新（强制 full reload）
import.meta.hot.decline()

// 强制重新加载
import.meta.hot.invalidate()

// 自定义事件
import.meta.hot.on('custom-event', (data) => {
    // 处理自定义事件
})
```

### 典型用法

```typescript
// store.ts
export const store = createStore()

if (import.meta.hot) {
    // 保留状态，不接受更新
    import.meta.hot.dispose(() => {
        store.destroy()
    })
    
    import.meta.hot.accept()
}

// timer.ts
let timer = setInterval(() => { ... }, 1000)

if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        clearInterval(timer)  // 清理旧定时器
    })
    
    import.meta.hot.accept((newMod) => {
        timer = newMod.timer  // 获取新定时器
    })
}
```

### 为什么关键

- 精确控制更新范围
- 处理副作用清理
- 保留状态跨更新

---

## 十五、Web Worker 支持

### 概念说明

Vite 支持直接导入 Web Worker，自动处理 Worker 构建和通信。

### 使用方式

```typescript
// 普通 Worker
import MyWorker from './worker?worker'
const worker = new MyWorker()
worker.postMessage({ type: 'start' })

// 内联 Worker（小文件）
import InlineWorker from './worker?worker&inline'

// URL 形式
import workerUrl from './worker?worker&url'
const worker = new Worker(workerUrl)
```

### Worker 文件

```typescript
// worker.js
self.onmessage = (e) => {
    const result = heavyComputation(e.data)
    self.postMessage(result)
}
```

### 配置

```typescript
// vite.config.ts
export default {
    worker: {
        format: 'es',
        plugins: () => [myPlugin()],
        rollupOptions: {
            output: {
                entryFileNames: 'worker.[hash].js'
            }
        }
    }
}
```

### 为什么关键

- 后台任务处理
- 大计算卸载
- 不阻塞主线程

---

## 总结

以上 15 个概念是 Vite 作为完整构建工具的核心能力：

| 概念 | 核心价值 |
|------|----------|
| 环境变量 | 多环境配置管理 |
| 配置文件 | 项目定制入口 |
| 生产构建 | 部署必需能力 |
| CSS Modules | 样式隔离 |
| CSS 预处理器 | CSS 编程能力 |
| PostCSS | CSS 兼容性 |
| 模块预加载 | 加载性能优化 |
| Source Map | 调试支持 |
| 代理配置 | 跨域解决 |
| public 目录 | 静态资源管理 |
| 多入口 | MPA 支持 |
| 错误 Overlay | 开发体验 |
| SSR | 首屏性能/SEO |
| 手动 HMR | 精确更新控制 |
| Web Worker | 后台任务处理 |

mini-vite 聚焦于核心请求链路，这些高级能力需要进一步探索完整 Vite 实现。