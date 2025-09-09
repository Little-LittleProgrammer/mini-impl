// HMR客户端代码，运行在浏览器中
console.log('[mini-vite] connecting...')

const socketProtocol = location.protocol === 'https:' ? 'wss' : 'ws'
const socketHost = `${location.hostname}:${location.port}`
const socket = new WebSocket(`${socketProtocol}://${socketHost}`, 'vite-hmr')

let isFirstUpdate = true

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
      payload.updates.forEach((update: any) => {
        if (update.type === 'js-update') {
          updateModule(update)
        } else if (update.type === 'css-update') {
          updateCss(update)
        }
      })
      break
    case 'full-reload':
      console.log(`[mini-vite] page reload triggered by ${payload.path || 'unknown'}`)
      window.location.reload()
      break
    case 'prune':
      // 移除无效的模块
      payload.paths.forEach((path: string) => {
        delete window.__HMR_CACHE__[path]
      })
      break
    case 'error':
      showErrorOverlay(payload.err)
      break
    default:
      console.warn(`[mini-vite] unknown message type: ${payload.type}`)
  }
}

// 更新JS模块
async function updateModule(update: any) {
  const { path, timestamp } = update
  console.log(`[mini-vite] hot updated: ${path}`)
  
  try {
    // 添加时间戳防止缓存
    const newUrl = `${path}${path.includes('?') ? '&' : '?'}t=${timestamp}`
    
    // 动态导入更新的模块
    const newModule = await import(newUrl)
    
    // 查找需要更新的模块
    const moduleLinks = document.querySelectorAll(`script[data-src="${path}"]`)
    
    if (moduleLinks.length > 0) {
      // 如果是通过script标签加载的模块，重新加载
      moduleLinks.forEach(link => {
        const newScript = document.createElement('script')
        newScript.type = 'module'
        newScript.src = newUrl
        newScript.dataset.src = path
        link.parentNode?.replaceChild(newScript, link)
      })
    } else {
      // 如果是动态导入的模块，尝试执行模块的更新逻辑
      if (newModule && typeof newModule.__hmr_accept__ === 'function') {
        newModule.__hmr_accept__()
      } else {
        // 如果模块没有HMR支持，则刷新页面
        console.log(`[mini-vite] module ${path} doesn't accept HMR, reloading page`)
        window.location.reload()
      }
    }
  } catch (error) {
    console.error(`[mini-vite] failed to update module ${path}:`, error)
    window.location.reload()
  }
}

// 更新CSS
function updateCss(update: any) {
  const { path, timestamp } = update
  console.log(`[mini-vite] css hot updated: ${path}`)
  
  const newUrl = `${path}${path.includes('?') ? '&' : '?'}t=${timestamp}`
  
  // 查找现有的CSS链接
  const links = document.querySelectorAll<HTMLLinkElement>(
    `link[rel="stylesheet"][href*="${path}"]`
  )
  
  if (links.length > 0) {
    // 更新现有的CSS链接
    links.forEach(link => {
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
    })
  } else {
    // 如果没有找到对应的link标签，创建新的
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = newUrl
    document.head.appendChild(link)
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

// 扩展window对象用于调试
declare global {
  interface Window {
    __HMR_CACHE__: Record<string, any>
    __mini_vite__: {
      socket: WebSocket
    }
  }
}

window.__HMR_CACHE__ = {}
window.__mini_vite__ = {
  socket
}

export {}
