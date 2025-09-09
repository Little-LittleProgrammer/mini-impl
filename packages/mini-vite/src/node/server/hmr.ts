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

  // 文件变化处理
  watcher.on('change', async (filePath) => {
    const normalizedPath = normalizePath(filePath)
    const relativePath = path.relative(serverContext.root, normalizedPath)
    
    console.log(colors.cyan(`[HMR] 文件已更新: ${relativePath}`))

    try {
      // 处理不同类型的文件更新
      if (filePath.endsWith('.html')) {
        // HTML文件变化 - 全量刷新
        send({
          type: 'full-reload',
        } as HMRFullReloadPayload)
      } else if (isJsRequest(filePath) || filePath.endsWith('.vue')) {
        // JS/Vue文件变化
        const timestamp = Date.now()
        const updates: Update[] = [{
          type: 'js-update',
          path: `/${relativePath}`,
          acceptedPath: `/${relativePath}`,
          timestamp,
        }]
        
        send({
          type: 'update',
          updates,
        } as HMRUpdatePayload)
      } else if (isCssRequest(filePath)) {
        // CSS文件变化
        const timestamp = Date.now()
        const updates: Update[] = [{
          type: 'css-update',
          path: `/${relativePath}`,
          acceptedPath: `/${relativePath}`,
          timestamp,
        }]
        
        send({
          type: 'update',
          updates,
        } as HMRUpdatePayload)
      } else {
        // 其他文件变化 - 全量刷新
        send({
          type: 'full-reload',
        } as HMRFullReloadPayload)
      }
    } catch (error) {
      console.error(colors.red('[HMR] 处理文件更新错误:'), error)
      send({
        type: 'full-reload',
      } as HMRFullReloadPayload)
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
  }
}
