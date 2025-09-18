# HMR (热模块替换) 原理解析

## 1. 原理概述

HMR（Hot Module Replacement，热模块替换）是现代前端开发中的重要特性，它允许在运行时更新模块，而无需完全刷新页面。这大大提高了开发体验，特别是在处理有状态的应用时。

## 2. 实现架构

HMR 实现包括客户端和服务端两部分：

### 2.1 服务端实现 (server/hmr.ts)

#### 2.1.1 WebSocket 服务器

建立与客户端的实时通信：

```typescript
// 创建 WebSocket 服务器
const wss = new WebSocketServer({ server });
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  // 发送连接成功消息
  ws.send(JSON.stringify({ type: 'connected' } as HMRConnectedPayload));
});
```

#### 2.1.2 文件监听

使用 chokidar 监听文件变化：

```typescript
// 创建文件监听器
const watcher = chokidar.watch([
  path.resolve(serverContext.root, 'src/**/*'),
  path.resolve(serverContext.root, '*.html'),
  path.resolve(serverContext.root, 'public/**/*'),
], {
  ignored: ['**/node_modules/**', '**/.git/**'],
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 50,
    pollInterval: 10,
  },
});
```

#### 2.1.3 模块依赖图

维护模块间的依赖关系：

```typescript
// 模块依赖图，追踪模块间的依赖关系
const moduleGraph = new Map<string, Set<string>>() // 模块 -> 其导入的模块们
const importerGraph = new Map<string, Set<string>>() // 模块 -> 导入它的模块们
```

### 2.2 客户端实现 (client/client.ts)

#### 2.2.1 WebSocket 客户端

连接到服务端：

```typescript
const socketProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
const socketHost = `${location.hostname}:${location.port}`;
const socket = new WebSocket(`${socketProtocol}://${socketHost}`, 'vite-hmr');
```

#### 2.2.2 模块缓存管理

维护模块缓存和状态：

```typescript
interface ModuleCache {
  [url: string]: {
    module?: any
    callbacks: Set<(mod: any) => void>
    isSelfAccepting: boolean
    isDeclined: boolean
    acceptDeps: Set<string>
    disposers: Set<() => void>
  }
}

const moduleCache: ModuleCache = {}
```

#### 2.2.3 更新应用

接收并应用更新：

```typescript
// 监听WebSocket消息
socket.addEventListener('message', async ({ data }) => {
  handleMessage(JSON.parse(data));
});
```

## 3. HMR API

客户端提供了完整的 HMR API：

### 3.1 accept 方法

接受模块更新：

```javascript
// 接受自身更新
import.meta.hot.accept();

// 接受自身更新并提供回调
import.meta.hot.accept((newModule) => {
  // 处理更新逻辑
});

// 接受特定依赖更新
import.meta.hot.accept('./dependency.js', (newModule) => {
  // 处理依赖更新
});

// 接受多个依赖更新
import.meta.hot.accept(['./dep1.js', './dep2.js'], ([newMod1, newMod2]) => {
  // 处理多个依赖更新
});
```

### 3.2 dispose 方法

注册清理回调：

```javascript
// 注册清理回调
import.meta.hot.dispose(() => {
  // 清理资源，如事件监听器、定时器等
  // 保存状态到 hot.data
});
```

### 3.3 decline 方法

拒绝更新：

```javascript
// 拒绝更新，触发全量刷新
import.meta.hot.decline();
```

### 3.4 invalidate 方法

使模块无效：

```javascript
// 使当前模块无效，触发全量刷新
import.meta.hot.invalidate();
```

### 3.5 data 属性

在热更新间保持的数据对象：

```javascript
// 保存状态
import.meta.hot.dispose(() => {
  import.meta.hot.data.myState = currentState;
});

// 恢复状态
if (import.meta.hot.data.myState) {
  currentState = import.meta.hot.data.myState;
}
```

## 4. 更新传播机制

### 4.1 文件变化检测

服务端检测到文件变化：

```typescript
watcher.on('change', async (filePath) => {
  // 处理不同类型的文件更新
  if (isJsRequest(filePath)) {
    // JS文件变化处理
  } else if (isCssRequest(filePath)) {
    // CSS文件变化处理
  }
});
```

### 4.2 依赖分析

查找受影响的模块：

```typescript
// 获取需要更新的边界模块
function getBoundaryModules(changedFile: string): string[] {
  // 通过模块依赖图查找可以接受更新的模块
}
```

### 4.3 边界确定

确定可以接受更新的模块边界：

```typescript
// 查找可以接受此更新的模块边界
function findAcceptingModule(
  path: string,
  acceptedPath: string,
  visited: Set<string> = new Set()
): string | null {
  // 查找可以处理更新的模块
}
```

### 4.4 消息发送

向客户端发送更新消息：

```typescript
// 发送模块更新
const updates: Update[] = [{
  type: 'js-update',
  path: normalizedPath,
  acceptedPath: normalizedPath,
  timestamp,
}];

send({
  type: 'update',
  updates,
} as HMRUpdatePayload);
```

### 4.5 更新应用

客户端应用更新并执行清理回调：

```typescript
// 执行清理回调
boundaryCache.disposers.forEach(disposer => {
  try {
    disposer();
  } catch (e) {
    console.error(`[mini-vite] error during module disposal:`, e);
  }
});
```

## 5. 消息类型

### 5.1 connected

连接成功消息：

```typescript
{
  type: 'connected'
}
```

### 5.2 update

模块更新消息：

```typescript
{
  type: 'update',
  updates: [
    {
      type: 'js-update' | 'css-update',
      path: string,
      acceptedPath: string,
      timestamp: number
    }
  ]
}
```

### 5.3 full-reload

全量刷新消息：

```typescript
{
  type: 'full-reload',
  path?: string
}
```

### 5.4 prune

移除无效模块消息：

```typescript
{
  type: 'prune',
  paths: string[]
}
```

### 5.5 error

错误消息：

```typescript
{
  type: 'error',
  err: {
    message: string,
    stack?: string
  }
}
```

## 6. 状态保持机制

### 6.1 数据存储

使用 `hot.data` 对象在热更新间保持数据：

```javascript
// 保存状态
import.meta.hot.dispose(() => {
  import.meta.hot.data.count = count;
});

// 恢复状态
if (import.meta.hot.data.count !== undefined) {
  count = import.meta.hot.data.count;
}
```

### 6.2 清理回调

在模块被替换前执行清理逻辑：

```javascript
import.meta.hot.dispose(() => {
  // 清理事件监听器
  window.removeEventListener('resize', handleResize);
  
  // 清理定时器
  clearInterval(timer);
  
  // 保存重要状态
  import.meta.hot.data.appState = getAppState();
});
```

## 7. 错误处理

### 7.1 更新失败处理

当热更新失败时自动回退到全量刷新：

```typescript
if (!boundary) {
  console.log(`[mini-vite] no HMR boundary found for ${path}, reloading page`);
  window.location.reload();
  return;
}
```

### 7.2 错误显示

在浏览器中显示友好的错误提示：

```typescript
function showErrorOverlay(err: any) {
  // 创建错误覆盖层
  const errorOverlay = document.createElement('div');
  errorOverlay.id = 'mini-vite-error-overlay';
  // 显示错误信息
}
```

## 8. 性能优化

### 8.1 增量更新

只更新发生变化的模块，避免全量刷新：

```typescript
// 只发送实际变化的模块更新
const updates: Update[] = changedFiles.map(file => ({
  type: getFileType(file),
  path: file,
  acceptedPath: file,
  timestamp: Date.now()
}));
```

### 8.2 批量处理

批量处理多个更新消息：

```typescript
// 批量处理更新
await Promise.all(
  payload.updates.map((update: any) => {
    if (update.type === 'js-update') {
      return updateModule(update);
    } else if (update.type === 'css-update') {
      return updateCss(update);
    }
  })
);
```

## 9. 与其他模块的交互

### 9.1 与插件系统的交互

HMR 与插件系统紧密集成：

```typescript
// HMR 插件
export function hmrPlugin(): Plugin {
  return {
    name: 'mini-vite:hmr',
    configureServer(server) {
      // 配置 HMR 服务器
    }
  };
}
```

### 9.2 与模块解析的交互

HMR 需要准确的模块依赖图：

```typescript
// 在导入分析插件中更新模块图
serverContext.hmr?.updateModuleGraph(
  normalizedImporter,
  importees
);
```

### 9.3 与预构建的交互

预构建产物的更新也需要 HMR 支持：

```typescript
// 监听预构建产物变化
watcher.on('change', (filePath) => {
  if (isPrebundledFile(filePath)) {
    // 发送预构建产物更新消息
  }
});
```