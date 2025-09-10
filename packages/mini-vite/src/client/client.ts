// HMR客户端代码，运行在浏览器中
console.log('[mini-vite] connecting...')

const socketProtocol = location.protocol === 'https:' ? 'wss' : 'ws'
const socketHost = `${location.hostname}:${location.port}`
const socket = new WebSocket(`${socketProtocol}://${socketHost}`, 'vite-hmr')

let isFirstUpdate = true

// 模块缓存和依赖管理
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
const hotModulesMap = new Map<string, HotModule>()

// HMR API接口定义
interface HotModule {
  data: any
  accept(): void
  accept(callback: (newMod: any) => void): void
  accept(dep: string, callback: (newMod: any) => void): void
  accept(deps: string[], callback: (newMods: any[]) => void): void
  dispose(callback: () => void): void
  decline(): void
  invalidate(): void
}

// 创建HMR API
function createHotContext(ownerPath: string): HotModule {
  if (!moduleCache[ownerPath]) {
    moduleCache[ownerPath] = {
      callbacks: new Set(),
      isSelfAccepting: false,
      isDeclined: false,
      acceptDeps: new Set(),
      disposers: new Set()
    }
  }

  const mod = moduleCache[ownerPath]

  const hotModule: HotModule = {
    data: mod.module?.hot?.data || {},
    
    // 接受自身更新
    accept(deps?: string | string[] | ((newMod: any) => void), callback?: (newMod: any) => void) {
      if (typeof deps === 'undefined') {
        // accept() - 接受自身更新，无回调
        mod.isSelfAccepting = true
      } else if (typeof deps === 'function') {
        // accept(callback) - 接受自身更新，有回调
        mod.isSelfAccepting = true
        mod.callbacks.add(deps as (newMod: any) => void)
      } else if (typeof deps === 'string') {
        // accept(dep, callback) - 接受单个依赖更新
        mod.acceptDeps.add(deps)
        if (callback) mod.callbacks.add(callback)
      } else if (Array.isArray(deps)) {
        // accept([deps], callback) - 接受多个依赖更新
        deps.forEach(dep => mod.acceptDeps.add(dep))
        if (callback) mod.callbacks.add(callback)
      }
    },

    // 注册清理回调
    dispose(callback: () => void) {
      mod.disposers.add(callback)
    },

    // 拒绝更新
    decline() {
      mod.isDeclined = true
    },

    // 使模块失效，触发完整重新加载
    invalidate() {
      location.reload()
    }
  }

  return hotModule
}

// 监听WebSocket消息
socket.addEventListener('message', async ({ data }) => {
  handleMessage(JSON.parse(data))
})

socket.addEventListener('open', () => {
  console.log('[mini-vite] connected')
})

socket.addEventListener('close', () => {
  console.log('[mini-vite] server connection lost. polling for restart...')
  setInterval(() => {
    new WebSocket(`${socketProtocol}://${socketHost}`, 'vite-hmr')
      .addEventListener('open', () => {
        location.reload()
      })
  }, 1000)
})

// 处理不同类型的HMR消息
async function handleMessage(payload: any) {
  switch (payload.type) {
    case 'connected':
      console.log(`[mini-vite] connected.`)
      break
    case 'update':
      if (isFirstUpdate && hasErrorOverlay()) {
        window.location.reload()
        return
      } else {
        clearErrorOverlay()
      }
      isFirstUpdate = false
      
      // 处理更新
      await Promise.all(
        payload.updates.map((update: any) => {
          if (update.type === 'js-update') {
            return updateModule(update)
          } else if (update.type === 'css-update') {
            return updateCss(update)
          }
        })
      )
      break
    case 'full-reload':
      console.log(`[mini-vite] page reload triggered by ${payload.path || 'unknown'}`)
      window.location.reload()
      break
    case 'prune':
      // 移除无效的模块
      payload.paths.forEach((path: string) => {
        const cached = moduleCache[path]
        if (cached) {
          // 执行清理回调
          cached.disposers.forEach(disposer => {
            try {
              disposer()
            } catch (e) {
              console.error(`[mini-vite] error during module disposal:`, e)
            }
          })
          delete moduleCache[path]
          hotModulesMap.delete(path)
        }
      })
      break
    case 'error':
      showErrorOverlay(payload.err)
      break
    default:
      console.warn(`[mini-vite] unknown message type: ${payload.type}`)
  }
}

// 查找可以接受此更新的模块边界
function findAcceptingModule(
  path: string,
  acceptedPath: string,
  visited: Set<string> = new Set()
): string | null {
  if (visited.has(path)) return null
  visited.add(path)

  const cached = moduleCache[path]
  if (!cached) return null

  if (cached.isSelfAccepting && path === acceptedPath) {
    return path
  }

  if (cached.acceptDeps.has(acceptedPath)) {
    return path
  }

  // 向上查找父模块
  for (const importer of getImporters(path)) {
    const found = findAcceptingModule(importer, acceptedPath, visited)
    if (found) return found
  }

  return null
}

// 获取模块的导入者
function getImporters(path: string): string[] {
  const importers: string[] = []
  for (const [modulePath, cache] of Object.entries(moduleCache)) {
    if (cache.acceptDeps.has(path) || (cache.isSelfAccepting && modulePath === path)) {
      importers.push(modulePath)
    }
  }
  return importers
}

// 更新JS模块
async function updateModule(update: any) {
  const { path, acceptedPath, timestamp } = update
  console.log(`[mini-vite] hot updated: ${path}`)
  
  try {
    // 查找可以处理此更新的边界模块
    const boundary = findAcceptingModule(path, acceptedPath || path)
    
    if (!boundary) {
      console.log(`[mini-vite] no HMR boundary found for ${path}, reloading page`)
      window.location.reload()
      return
    }

    // 添加时间戳防止缓存
    const newUrl = `${path}${path.includes('?') ? '&' : '?'}t=${timestamp}`
    
    // 获取边界模块的缓存
    const boundaryCache = moduleCache[boundary]
    if (!boundaryCache) {
      window.location.reload()
      return
    }

    // 如果模块被拒绝，则全量刷新
    if (boundaryCache.isDeclined) {
      console.log(`[mini-vite] module ${boundary} declined the update, reloading page`)
      window.location.reload()
      return
    }

    // 执行清理回调
    boundaryCache.disposers.forEach(disposer => {
      try {
        disposer()
      } catch (e) {
        console.error(`[mini-vite] error during module disposal:`, e)
      }
    })

    // 动态导入更新的模块
    const newModule = await import(newUrl)
    
    // 更新模块缓存
    if (moduleCache[path]) {
      moduleCache[path].module = newModule
    }

    // 如果是自我接受的模块
    if (boundary === path && boundaryCache.isSelfAccepting) {
      // 执行模块自身的更新逻辑
      if (newModule && newModule.default && typeof newModule.default === 'function') {
        newModule.default()
      }
    } else {
      // 执行依赖更新回调
      boundaryCache.callbacks.forEach(callback => {
        try {
          callback(newModule)
        } catch (e) {
          console.error(`[mini-vite] error during HMR callback:`, e)
        }
      })
    }

    console.log(`[mini-vite] hot update applied for ${path}`)
  } catch (error) {
    console.error(`[mini-vite] failed to update module ${path}:`, error)
    showErrorOverlay(error)
  }
}

// 更新CSS
function updateCss(update: any) {
  const { path, timestamp } = update
  console.log(`[mini-vite] css hot updated: ${path}`)
  
  const newUrl = `${path}${path.includes('?') ? '&' : '?'}t=${timestamp}`
  
  // 查找现有的CSS链接和样式
  const links = document.querySelectorAll<HTMLLinkElement>(
    `link[rel="stylesheet"][href*="${path}"], style[data-vite-dev-id*="${path}"]`
  )
  
  if (links.length > 0) {
    // 更新现有的CSS链接/样式
    links.forEach(link => {
      if (link.tagName === 'LINK') {
        const newLink = link.cloneNode() as HTMLLinkElement
        newLink.href = newUrl
        newLink.onload = () => {
          link.remove()
        }
        newLink.onerror = () => {
          console.error(`[mini-vite] failed to load updated css: ${newUrl}`)
          link.remove()
        }
        link.after(newLink)
      } else if (link.tagName === 'STYLE') {
        // 对于内联样式，需要重新获取内容
        fetch(newUrl)
          .then(res => res.text())
          .then(css => {
            // 更新样式内容
            const newStyle = document.createElement('style')
            newStyle.setAttribute('type', 'text/css')
            newStyle.setAttribute('data-vite-dev-id', path)
            newStyle.innerHTML = css
            link.parentNode?.replaceChild(newStyle, link)
          })
          .catch(err => {
            console.error(`[mini-vite] failed to fetch updated css: ${newUrl}`, err)
          })
      }
    })
  } else {
    // 如果没有找到对应的标签，尝试重新加载CSS模块
    fetch(newUrl)
      .then(res => res.text())
      .then(css => {
        const style = document.createElement('style')
        style.setAttribute('type', 'text/css')
        style.setAttribute('data-vite-dev-id', path)
        style.innerHTML = css
        document.head.appendChild(style)
      })
      .catch(err => {
        console.error(`[mini-vite] failed to fetch css: ${newUrl}`, err)
      })
  }
}

// 错误处理相关
function hasErrorOverlay(): boolean {
  return document.querySelector('#mini-vite-error-overlay') !== null
}

function clearErrorOverlay() {
  document.querySelector('#mini-vite-error-overlay')?.remove()
}

function showErrorOverlay(err: any) {
  clearErrorOverlay()
  
  const errorOverlay = document.createElement('div')
  errorOverlay.id = 'mini-vite-error-overlay'
  errorOverlay.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      color: #ff6b6b;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 14px;
      padding: 20px;
      box-sizing: border-box;
      z-index: 99999;
      overflow: auto;
      white-space: pre-wrap;
    ">
      <div style="margin-bottom: 20px; font-size: 18px; font-weight: bold;">
        ❌ Mini-Vite Error
      </div>
      <div style="background: rgba(255, 107, 107, 0.1); padding: 16px; border-radius: 4px;">
        ${err.message || err}
      </div>
      <div style="margin-top: 20px; opacity: 0.7;">
        Click anywhere to dismiss
      </div>
    </div>
  `
  
  errorOverlay.addEventListener('click', clearErrorOverlay)
  document.body.appendChild(errorOverlay)
}

// 创建并暴露全局HMR API
function createGlobalHMRContext() {
  // 添加导入时的HMR注册
//   const originalImport = window.import || eval('import')
  
  return {
    createHotContext,
    moduleCache,
    socket,
    
    // 注册模块
    registerModule(path: string, hotAccept?: () => void) {
      if (!moduleCache[path]) {
        moduleCache[path] = {
          callbacks: new Set(),
          isSelfAccepting: false,
          isDeclined: false,
          acceptDeps: new Set(),
          disposers: new Set()
        }
      }
      
      const hotModule = createHotContext(path)
      hotModulesMap.set(path, hotModule)
      
      if (hotAccept) {
        hotModule.accept()
      }
      
      return hotModule
    }
  }
}

// 扩展window对象
declare global {
  interface Window {
    __HMR_CACHE__: ModuleCache
    __mini_vite__: ReturnType<typeof createGlobalHMRContext>
  }
}

window.__HMR_CACHE__ = moduleCache
window.__mini_vite__ = createGlobalHMRContext()

// 导出类型供TypeScript使用
export type { HotModule }
export { createHotContext }
