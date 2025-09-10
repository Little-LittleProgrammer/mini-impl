import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import chokidar from 'chokidar'
import path from 'node:path'
import colors from 'picocolors'
import { ServerContext } from './index'
import { isCssRequest, isJsRequest, normalizePath } from '../utils'

export interface HmrContext {
  send(payload: HMRPayload): void
  close(): void
  updateModuleGraph(importer: string, importees: string[]): void
}

export interface HMRPayload {
  type: string
  [key: string]: any
}

export interface HMRUpdatePayload extends HMRPayload {
  type: 'update'
  updates: Update[]
}

export interface Update {
  type: 'js-update' | 'css-update'
  path: string
  acceptedPath: string
  timestamp: number
}

export interface HMRConnectedPayload extends HMRPayload {
  type: 'connected'
}

export interface HMRFullReloadPayload extends HMRPayload {
  type: 'full-reload'
}

export function createHMRServer(
  server: Server,
  serverContext: ServerContext
): HmrContext {
  const wss = new WebSocketServer({ server })
  const clients = new Set<WebSocket>()

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log(colors.green('[HMR] 客户端已连接'))
    
    // 发送连接成功消息
    ws.send(JSON.stringify({ type: 'connected' } as HMRConnectedPayload))

    ws.on('close', () => {
      clients.delete(ws)
      console.log(colors.yellow('[HMR] 客户端已断开连接'))
    })

    ws.on('error', (err) => {
      console.error(colors.red('[HMR] WebSocket错误:'), err)
    })
  })

  // 创建文件监听器
  const watcher = chokidar.watch(
    [
      path.resolve(serverContext.root, 'src/**/*'),
      path.resolve(serverContext.root, '*.html'),
      path.resolve(serverContext.root, 'public/**/*'),
    ],
    {
      ignored: ['**/node_modules/**', '**/.git/**', '**/.DS_Store'],
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 10,
      },
    }
  )

  // 模块依赖图，追踪模块间的依赖关系
  const moduleGraph = new Map<string, Set<string>>() // 模块 -> 其导入的模块们
  const importerGraph = new Map<string, Set<string>>() // 模块 -> 导入它的模块们

  // 更新模块图
  function updateModuleGraph(importer: string, importees: string[]) {
    // 清除旧的依赖关系
    if (moduleGraph.has(importer)) {
      for (const importee of moduleGraph.get(importer)!) {
        const importers = importerGraph.get(importee)
        if (importers) {
          importers.delete(importer)
          if (importers.size === 0) {
            importerGraph.delete(importee)
          }
        }
      }
    }

    // 设置新的依赖关系
    moduleGraph.set(importer, new Set(importees))
    for (const importee of importees) {
      if (!importerGraph.has(importee)) {
        importerGraph.set(importee, new Set())
      }
      importerGraph.get(importee)!.add(importer)
    }
  }

  // 获取需要更新的边界模块
  function getBoundaryModules(changedFile: string): string[] {
    const boundaries: string[] = []
    const visited = new Set<string>()
    
    function traverse(file: string) {
      if (visited.has(file)) return
      visited.add(file)
      
      const importers = importerGraph.get(file)
      if (!importers || importers.size === 0) {
        // 如果没有导入者，这个文件本身就是边界
        boundaries.push(file)
        return
      }
      
      for (const importer of importers) {
        traverse(importer)
      }
    }
    
    traverse(changedFile)
    return boundaries
  }

  // 文件变化处理
  watcher.on('change', async (filePath) => {
    const normalizedPath = normalizePath(filePath)
    const relativePath = path.relative(serverContext.root, normalizedPath)
    const moduleUrl = relativePath[0] === '/' ? relativePath : `/${relativePath}`
    
    console.log(colors.cyan(`[HMR] 文件已更新: ${relativePath}`))

    try {
      // 处理不同类型的文件更新
      if (filePath.endsWith('.html')) {
        // HTML文件变化 - 全量刷新
        send({
          type: 'full-reload',
          path: relativePath
        } as HMRFullReloadPayload)
      } else if (isJsRequest(filePath) || filePath.endsWith('.vue') || filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
        // JS/TS/Vue文件变化
        const timestamp = Date.now()
        
        // 获取受影响的边界模块
        const boundaryModules = getBoundaryModules(moduleUrl)
        
        if (boundaryModules.length === 0) {
          // 如果找不到边界模块，进行全量刷新
          console.log(colors.yellow(`[HMR] 找不到 ${relativePath} 的HMR边界，执行全量刷新`))
          send({
            type: 'full-reload',
            path: relativePath
          } as HMRFullReloadPayload)
        } else {
          // 发送模块更新
          const updates: Update[] = [{
            type: 'js-update',
            path: moduleUrl,
            acceptedPath: moduleUrl,
            timestamp,
          }]
          
          console.log(colors.green(`[HMR] 发送模块更新: ${relativePath}`))
          send({
            type: 'update',
            updates,
          } as HMRUpdatePayload)
        }
      } else if (isCssRequest(filePath)) {
        // CSS文件变化 - 总是可以热更新
        const timestamp = Date.now()
        const updates: Update[] = [{
          type: 'css-update',
          path: moduleUrl,
          acceptedPath: moduleUrl,
          timestamp,
        }]
        
        console.log(colors.green(`[HMR] CSS热更新: ${relativePath}`))
        send({
          type: 'update',
          updates,
        } as HMRUpdatePayload)
      } else {
        // 其他文件变化 - 全量刷新
        console.log(colors.yellow(`[HMR] 未知文件类型 ${relativePath}，执行全量刷新`))
        send({
          type: 'full-reload',
          path: relativePath
        } as HMRFullReloadPayload)
      }
    } catch (error) {
      console.error(colors.red('[HMR] 处理文件更新错误:'), error)
      send({
        type: 'error',
        err: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      })
    }
  })

  watcher.on('add', (filePath) => {
    const relativePath = path.relative(serverContext.root, filePath)
    console.log(colors.green(`[HMR] 文件已添加: ${relativePath}`))
    // 新增文件触发全量刷新
    send({
      type: 'full-reload',
    } as HMRFullReloadPayload)
  })

  watcher.on('unlink', (filePath) => {
    const relativePath = path.relative(serverContext.root, filePath)
    console.log(colors.red(`[HMR] 文件已删除: ${relativePath}`))
    // 删除文件触发全量刷新
    send({
      type: 'full-reload',
    } as HMRFullReloadPayload)
  })

  watcher.on('error', (error) => {
    console.error(colors.red('[HMR] 文件监听错误:'), error)
  })

  function send(payload: HMRPayload) {
    const stringified = JSON.stringify(payload)
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(stringified)
      }
    })
  }

  function close() {
    clients.forEach((client) => client.close())
    watcher.close()
    wss.close()
  }

  return {
    send,
    close,
    updateModuleGraph,
  }
}
