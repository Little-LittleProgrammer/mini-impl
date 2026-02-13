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
        selfCallbacks: Set<(mod: any) => void>
        depCallbacks: Map<string, Set<(mod: any) => void>>
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
    // 添加更多HMR API方法
    on(event: string, cb: (...args: any[]) => void): void
    off(event: string, cb?: (...args: any[]) => void): void
    send(data: any): void
}

interface JsUpdate {
    type: 'js-update'
    path: string
    acceptedPath?: string
    timestamp: number
}

interface CssUpdate {
    type: 'css-update'
    path: string
    acceptedPath?: string
    timestamp: number
}

interface UpdatePayloadMessage {
    type: 'update'
    updates: Array<JsUpdate | CssUpdate>
}

// 创建HMR API
function createHotContext(ownerPath: string): HotModule {
    if (!moduleCache[ownerPath]) {
        moduleCache[ownerPath] = {
            selfCallbacks: new Set(),
            depCallbacks: new Map(),
            isSelfAccepting: false,
            isDeclined: false,
            acceptDeps: new Set(),
            disposers: new Set()
        }
    }

    const mod = moduleCache[ownerPath]

    // 事件监听器映射
    const eventListeners = new Map<string, Set<(...args: any[]) => void>>()

    function normalizeAcceptedDep(dep: string): string {
        if (dep.startsWith('/')) {
            return dep
        }
        if (dep.startsWith('.')) {
            const ownerDir = ownerPath.slice(0, ownerPath.lastIndexOf('/') + 1)
            return new URL(dep, `${location.origin}${ownerDir}`).pathname
        }
        return dep
    }

    function addDepCallback(dep: string, cb: (mod: any) => void) {
        const normalizedDep = normalizeAcceptedDep(dep)
        mod.acceptDeps.add(normalizedDep)
        if (!mod.depCallbacks.has(normalizedDep)) {
            mod.depCallbacks.set(normalizedDep, new Set())
        }
        mod.depCallbacks.get(normalizedDep)!.add(cb)
    }

    const hotModule: HotModule = {
        data: mod.module?.hot?.data || {},

        // 接受自身更新
        accept(
            deps?: string | string[] | ((newMod: any) => void),
            callback?: (newMod: any) => void
        ) {
            if (typeof deps === 'undefined') {
                // accept() - 接受自身更新，无回调
                mod.isSelfAccepting = true
            } else if (typeof deps === 'function') {
                // accept(callback) - 接受自身更新，有回调
                mod.isSelfAccepting = true
                mod.selfCallbacks.add(deps as (newMod: any) => void)
            } else if (typeof deps === 'string') {
                // accept(dep, callback) - 接受单个依赖更新
                if (callback) {
                    addDepCallback(deps, callback)
                } else {
                    mod.acceptDeps.add(normalizeAcceptedDep(deps))
                }
            } else if (Array.isArray(deps)) {
                // accept([deps], callback) - 接受多个依赖更新
                deps.forEach(dep => {
                    if (callback) {
                        addDepCallback(dep, (newMod: any) =>
                            (callback as (newMods: any[]) => void)([newMod])
                        )
                    } else {
                        mod.acceptDeps.add(normalizeAcceptedDep(dep))
                    }
                })
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
        },

        // 添加事件监听器
        on(event: string, cb: (...args: any[]) => void) {
            if (!eventListeners.has(event)) {
                eventListeners.set(event, new Set())
            }
            eventListeners.get(event)!.add(cb)
        },

        // 移除事件监听器
        off(event: string, cb?: (...args: any[]) => void) {
            if (!eventListeners.has(event)) return
            if (cb) {
                eventListeners.get(event)!.delete(cb)
            } else {
                eventListeners.delete(event)
            }
        },

        // 发送自定义消息到服务器
        send(data: any) {
            socket.send(
                JSON.stringify({
                    type: 'custom',
                    event: 'message',
                    data: {
                        ownerPath,
                        ...data
                    }
                })
            )
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
        new WebSocket(
            `${socketProtocol}://${socketHost}`,
            'vite-hmr'
        ).addEventListener('open', () => {
            location.reload()
        })
    }, 1000)
})

function isJsUpdate(update: JsUpdate | CssUpdate): update is JsUpdate {
    return update.type === 'js-update'
}

function isCssUpdate(update: JsUpdate | CssUpdate): update is CssUpdate {
    return update.type === 'css-update'
}

async function applyUpdatePayload(payload: UpdatePayloadMessage) {
    const jsUpdates = payload.updates.filter(isJsUpdate)
    const cssUpdates = payload.updates.filter(isCssUpdate)

    const hasAppliedJsUpdate = await applyJsUpdates(jsUpdates)
    applyCssUpdates(cssUpdates)

    if (jsUpdates.length > 0 && !hasAppliedJsUpdate) {
        console.log('[mini-vite] no accepted HMR boundary found, reloading page')
        window.location.reload()
    }
}

async function applyJsUpdates(updates: JsUpdate[]): Promise<boolean> {
    let hasApplied = false
    for (const update of updates) {
        const applied = await updateModule(update)
        if (applied) {
            hasApplied = true
        }
    }
    return hasApplied
}

function applyCssUpdates(updates: CssUpdate[]) {
    updates.forEach(update => {
        updateCss(update)
    })
}

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

            await applyUpdatePayload(payload as UpdatePayloadMessage)
            break
        case 'full-reload':
            console.log(
                `[mini-vite] page reload triggered by ${payload.path || 'unknown'}`
            )
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
                            console.error(
                                `[mini-vite] error during module disposal:`,
                                e
                            )
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

function canAcceptUpdate(boundaryPath: string, acceptedPath: string): boolean {
    const cached = moduleCache[boundaryPath]
    if (!cached || cached.isDeclined) return false
    if (boundaryPath === acceptedPath) {
        return cached.isSelfAccepting
    }
    return cached.acceptDeps.has(acceptedPath)
}

// 更新JS模块
async function updateModule(update: JsUpdate): Promise<boolean> {
    const { path, acceptedPath, timestamp } = update
    console.log(`[mini-vite] hot updated: ${path}`)

    try {
        const boundary = path
        const updateTarget = acceptedPath || path

        if (!canAcceptUpdate(boundary, updateTarget)) {
            console.log(`[mini-vite] boundary skipped: ${boundary} does not accept ${updateTarget}`)
            return false
        }

        // 添加时间戳防止缓存
        const newUrl = `${updateTarget}${updateTarget.includes('?') ? '&' : '?'}t=${timestamp}`

        // 获取边界模块的缓存
        const boundaryCache = moduleCache[boundary]
        if (!boundaryCache) {
            return false
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
        if (moduleCache[updateTarget]) {
            moduleCache[updateTarget].module = newModule
        }

        // 自身更新：执行 self accept 回调
        if (boundary === updateTarget && boundaryCache.isSelfAccepting) {
            boundaryCache.selfCallbacks.forEach(callback => {
                try {
                    callback(newModule)
                } catch (e) {
                    console.error(`[mini-vite] error during HMR callback:`, e)
                }
            })
        } else {
            // 依赖更新：只触发对应依赖注册的回调
            const depCallbacks = boundaryCache.depCallbacks.get(updateTarget)
            depCallbacks?.forEach(callback => {
                try {
                    callback(newModule)
                } catch (e) {
                    console.error(`[mini-vite] error during HMR callback:`, e)
                }
            })
        }

        console.log(`[mini-vite] hot update applied for ${path}`)
        return true
    } catch (error) {
        console.error(`[mini-vite] failed to update module ${path}:`, error)
        showErrorOverlay(error)
        return false
    }
}

// 更新CSS
function updateCss(update: CssUpdate) {
    const { path, timestamp } = update
    console.log(`[mini-vite] css hot updated: ${path}`)

    // 对于CSS文件，我们需要重新导入JavaScript模块而不是直接获取CSS内容
    // 因为CSS插件将CSS转换为包含updateStyle函数的JavaScript模块
    const newUrl = `${path}${path.includes('?') ? '&' : '?'}t=${timestamp}`

    // 使用动态导入重新加载CSS模块（JavaScript代码）
    import(/* @vite-ignore */ newUrl)
        .then(() => {
            console.log(`[mini-vite] css module reloaded: ${path}`)
        })
        .catch(err => {
            console.error(
                `[mini-vite] failed to reload css module: ${path}`,
                err
            )
        })
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
                    selfCallbacks: new Set(),
                    depCallbacks: new Map(),
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
