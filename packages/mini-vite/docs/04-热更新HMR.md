# 热更新 HMR

本文说明 mini-vite 的热更新(HMR)如何把"保存文件"变成"页面局部替换",涉及哪些文件、消息怎么流转,以及当前实现的边界。

对应源码:

- `src/node/server/hmr.ts` — 服务端:WebSocket、文件监听、模块图、更新决策
- `src/client/client.ts` — 客户端:接收消息、动态 import、执行 `import.meta.hot` 回调
- `src/node/plugins/importAnalysis.ts` — 给每个模块注入 `import.meta.hot`,并上报依赖关系
- `src/node/plugins/hmr.ts` — 提供虚拟客户端模块 `/node_modules/.mini-vite/client.js`
- `src/node/server/middlewares/indexHtml.ts` — 往 HTML 注入客户端脚本

## 1. 一句话原理

> 服务端维护模块依赖图,文件变化时沿"被谁导入"的方向向上算出候选边界,通过 WebSocket 通知浏览器;客户端动态 `import()` 新模块并执行 `import.meta.hot` 回调,能局部替换就局部替换,失败才整页刷新。

它本质是三件事的组合:

1. **编译期注入能力** — `importAnalysis` 给每个模块注入 `import.meta.hot`
2. **运行时通知机制** — WebSocket 把"哪些模块变了"推给浏览器
3. **最小化替换执行** — 客户端动态 `import()` 新模块 + 触发已注册回调

## 2. 启动阶段:HMR 是怎么接进来的

三步注入,缺一不可:

**第一步**,`indexHtml` 中间件响应 `/` 时,在 `</head>` 前插入客户端脚本:

```html
<script type="module">
    import "/node_modules/.mini-vite/client.js";
</script>
```

**第二步**,浏览器请求这个虚拟路径时,`hmr` 插件用 `resolveId` + `load` 拦截它,返回 `client.ts` 经 esbuild 编译后的代码(编译在 `configureServer` 阶段完成,结果缓存在 `clientCode` 变量里)。

**第三步**,每个业务 JS 模块经过 `importAnalysis` 时,会在代码顶部被注入:

```js
import { createHotContext } from "/node_modules/.mini-vite/client.js";
const __hmr__ = createHotContext("<当前模块的 URL>");
import.meta.hot = __hmr__;
```

注入后,业务代码就能写 `if (import.meta.hot) { import.meta.hot.accept(...) }`。注意 `importAnalysis` 会跳过 client 模块本身(`!importer.includes('.mini-vite/client')`),避免自我注入。

## 3. 服务端:从文件变化到推送消息

### 3.1 文件监听

`createHMRServer()` 用 chokidar 监听三类路径:

```ts
chokidar.watch([
  path.resolve(root, 'src/**/*'),
  path.resolve(root, '*.html'),
  path.resolve(root, 'public/**/*'),
])
```

任何变化先调用 `invalidateTransformCache()` 让转换缓存失效,确保后续请求拿到新结果,再决定推什么消息。

### 3.2 模块依赖图:两张反向索引表

服务端维护两张 `Map<string, Set<string>>`:

```ts
const moduleGraph    = new Map() // importer -> 它导入了谁
const importerGraph  = new Map() // importee -> 谁导入了它
```

**为什么要两张?** 因为不同场景查询方向相反:

| 场景 | 查询方向 | 用哪张图 |
| --- | --- | --- |
| 文件变更,找影响范围 | 向上找"谁导入了我" | `importerGraph` |
| 删除文件,清理依赖 | 向下找"我导入了谁" | `moduleGraph` |

两张图互为反向索引,把"找导入者"从遍历 O(n) 降到 O(1)。用 `Set` 而非数组是为了自动去重 + O(1) 删除/查找。

数据来源:`importAnalysis` 每次 transform 完一个模块,就调用 `updateModuleGraph(importer, importees)` 上报。

> 注意:依赖图基于 `es-module-lexer` 解析,只能识别静态的顶层 `import`,不解析动态 `import()` 里的表达式。完整 Vite 会用正则做 fallback,mini-vite 没有。

### 3.3 更新模块图:为什么要先清旧依赖

`updateModuleGraph` 分两步:**先清除旧依赖关系,再写入新的**。

清旧依赖是必须的。设想模块改动前后 import 变了:

```js
// 改动前
import { foo } from './a'
import { bar } from './b'

// 改动后,删掉了对 b 的导入
import { foo } from './a'
```

如果不清理,`importerGraph` 里 `./b` 仍然记着"被当前模块导入",边界计算就会出错。所以每次更新都先按旧的 importees 把反向引用删干净,再建立新的。

`updateModuleGraph` 还会过滤掉空字符串和自引用(`importee !== importer`)。

### 3.4 边界查找:从变更模块向上 BFS

文件变更时,`getBoundaryModules(changedUrl)` 沿 `importerGraph` 做广度优先遍历,收集整条导入链上的所有候选边界(包含变更模块自己):

```ts
function getBoundaryModules(changedFile) {
  const boundaries = []
  const visited = new Set()
  const queue = [normalizePath(changedFile)]

  while (queue.length > 0) {
    const file = queue.shift()
    if (visited.has(file)) continue   // visited 天然处理循环依赖
    visited.add(file)
    boundaries.push(file)             // 当前模块也是候选

    const importers = importerGraph.get(file)
    if (importers) {
      for (const importer of importers) {
        if (!visited.has(importer)) queue.push(importer)
      }
    }
  }
  return boundaries
}
```

举例,依赖链 `main.ts → App.ts → utils.ts → helper.ts`,当 `helper.ts` 变更:

```
队列初始: [helper]
→ boundaries: [helper],         入队 utils
→ boundaries: [helper,utils],   入队 App
→ boundaries: [helper,utils,App], 入队 main
→ boundaries: [helper,utils,App,main]
```

`visited` Set 让 BFS 天然跳过循环依赖(`A→B→C→A` 时 A 第二次出现会被跳过),不会死循环。

候选列表为空就回退 `full-reload`,否则把整条链都作为候选发给客户端逐个尝试。

### 3.5 不同文件类型的处理

`watcher.on('change')` 按类型分流:

| 文件类型 | 处理 |
| --- | --- |
| `.html` | `full-reload` |
| JS/TS/JSX/TSX(`isJsRequest`) | `getBoundaryModules` → 发一组 `js-update` 候选 |
| CSS(`isCssRequest`) | 发一条 `css-update` |
| 其他未知类型 | `full-reload` |

`add` / `unlink` 一律 `full-reload`;`unlink` 还会额外调 `removeModuleFromGraph` 清理图中残留节点。

### 3.6 消息协议

服务端发出的消息类型:

```ts
// 连接成功
{ type: 'connected' }

// 模块更新(JS/CSS 共用)
{ type: 'update', updates: [
  { type: 'js-update' | 'css-update', path, acceptedPath, timestamp }
]}

// 整页刷新
{ type: 'full-reload', path? }

// 错误
{ type: 'error', err: { message, stack } }
```

`js-update` 中:`path` 是候选边界模块,`acceptedPath` 是真正变化的模块,`timestamp` 用作动态 import 的防缓存查询参数。CSS 的 `path` 和 `acceptedPath` 通常相同。

## 4. 客户端:接收消息并执行更新

### 4.1 连接与分发

客户端用子协议 `vite-hmr` 建连:

```ts
new WebSocket(`${protocol}://${host}`, 'vite-hmr')
```

按 `payload.type` 分发到 `connected` / `update` / `full-reload` / `prune` / `error`。断线后每秒轮询重连,重连成功即 `location.reload()`。

### 4.2 createHotContext 与模块缓存

客户端维护 `moduleCache`,每个模块记录:`isSelfAccepting`、`acceptDeps`、`selfCallbacks`、`depCallbacks`、`disposers`、`isDeclined`。

`createHotContext(ownerPath)` 返回的 `import.meta.hot` 暴露这些 API:

- `accept()` / `accept(cb)` — 自接收,回调存入 `selfCallbacks`,置 `isSelfAccepting = true`
- `accept(dep, cb)` / `accept([deps], cb)` — 接收依赖更新,按依赖路径分桶存入 `depCallbacks`
- `dispose(cb)` — 注册清理回调
- `decline()` — 拒绝更新(置 `isDeclined`)
- `invalidate()` — 直接 `location.reload()`
- `on` / `off` / `send` — 自定义事件(基础实现)

### 4.3 JS 更新:多候选逐个尝试

收到 `update` 后,客户端先拆分 JS / CSS 更新,JS 部分采用"多候选边界逐个尝试"策略:

1. 遍历每条 `js-update`,用 `canAcceptUpdate(boundary, acceptedPath)` 判断能否接受:
   - `boundary === acceptedPath` 时,需要 `isSelfAccepting`
   - 否则需要 `acceptDeps` 包含 `acceptedPath`
2. 可接受的项执行热替换:
   - 先跑 `disposers` 清理旧副作用
   - 动态 `import(acceptedPath + '?t=' + timestamp)` 拉新模块
   - 按类型触发回调:自接收跑 `selfCallbacks`,依赖更新跑 `depCallbacks.get(acceptedPath)`
3. **只要有任意一条候选应用成功,就保留局部热更结果**
4. 所有 JS 候选都失败,才整页刷新

这正是服务端发"一整条链"作为候选的意义:客户端从链上找到第一个声明了 `accept` 的边界,在那里完成局部替换。

### 4.4 CSS 更新

CSS 在服务端已被转成 JS 模块(见 [模块转换与预构建](./03-模块转换与预构建.md)),模块顶层会把样式注入 `<style data-vite-dev-id="...">`。收到 `css-update` 时,客户端只需重新动态 `import()` 这个 JS 模块,顶层代码重新执行,样式即更新,无需整页刷新。

### 4.5 错误遮罩

收到 `error` 消息时,客户端创建一个 `#mini-vite-error-overlay` 全屏遮罩显示错误信息,点击关闭。这是个简化实现,没有源码定位、点击跳转编辑器等能力。

## 5. 什么时候会整页刷新

HMR 不是"永不刷新",而是"能局部更新就局部,不能就安全回退"。触发 `full-reload` 的典型场景:

- HTML 变化
- 文件新增 / 删除
- 非 JS/CSS 的未知类型变化
- 找不到任何可接受更新的边界
- 客户端所有 JS 候选都应用失败

## 6. 当前边界与改进方向

mini-vite 的 HMR 已经能跑通主流程,但相比完整 Vite 仍有差距:

- `prune` 生命周期未由服务端主动驱动(客户端有处理逻辑,服务端不发)
- `accept([deps], cb)` 多依赖语义按单依赖触发,不完全等价于 Vite
- 不解析动态 `import()`,依赖图可能不完整
- 错误恢复较弱,没有"编译修复后自动移除遮罩并重试"
- 模块图失效是粗粒度的,没有 Vite 那样精细的增量失效

## 7. 与完整 Vite 的差异

| 机制 | 完整 Vite | mini-vite |
| --- | --- | --- |
| 模块图 | `ModuleNode`,含 url/id/importers/imported/transformResult 等 | 仅 `moduleGraph` + `importerGraph` 两张 Map |
| 动态 import | 正则 fallback 解析 | 不解析 |
| 边界传播 | 完整 accept 链 + prune | 多候选逐个尝试,prune 未对接 |
| 错误遮罩 | 源码定位、跳转编辑器 | 纯文本遮罩 |
| 客户端运行时 | `@vite/client`,功能完整 | `client.ts`,核心可用 |

下一篇:[mini-vite 与 Vite 的差异](./05-与Vite的差异.md)。
