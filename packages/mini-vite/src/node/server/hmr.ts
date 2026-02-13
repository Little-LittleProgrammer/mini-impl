import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import chokidar from 'chokidar'
import path from 'node:path'
import colors from 'picocolors'
import { ServerContext } from './index'
import { fsPathToUrl, isCssRequest, isJsRequest, normalizePath } from '../utils'
import { invalidateTransformCache } from '../transformRequest'

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

interface ChangedFileContext {
  normalizedPath: string
  changedUrl: string
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
  // 用于确定哪些模块需要重新加载
  const moduleGraph = new Map<string, Set<string>>() // 模块 -> 其导入的模块们
  const importerGraph = new Map<string, Set<string>>() // 模块 -> 导入它的模块们

  // 更新模块图
  function updateModuleGraph(importer: string, importees: string[]) {
    const normalizedImporter = normalizePath(importer);
    
    // 清除旧的依赖关系
    if (moduleGraph.has(normalizedImporter)) {
      for (const importee of moduleGraph.get(normalizedImporter)!) {
        const importers = importerGraph.get(importee)
        if (importers) {
          importers.delete(normalizedImporter)
          if (importers.size === 0) {
            importerGraph.delete(importee)
          }
        }
      }
    }

    // 规范化所有依赖项路径
    const normalizedImportees = importees.map(importee => normalizePath(importee));
    
    // 过滤掉无效的依赖项（如空字符串或自身引用）
    const validImportees = normalizedImportees.filter(importee => 
      importee && importee !== normalizedImporter
    );

    // 设置新的依赖关系
    moduleGraph.set(normalizedImporter, new Set(validImportees))
    for (const importee of validImportees) {
      if (!importerGraph.has(importee)) {
        importerGraph.set(importee, new Set())
      }
      importerGraph.get(importee)!.add(normalizedImporter)
    }
  }

  // 从模块图中移除指定模块，避免删除文件后依赖残留
  function removeModuleFromGraph(moduleId: string) {
    const normalizedModuleId = normalizePath(moduleId)

    const importees = moduleGraph.get(normalizedModuleId)
    if (importees) {
      for (const importee of importees) {
        const importers = importerGraph.get(importee)
        if (importers) {
          importers.delete(normalizedModuleId)
          if (importers.size === 0) {
            importerGraph.delete(importee)
          }
        }
      }
      moduleGraph.delete(normalizedModuleId)
    }

    const importers = importerGraph.get(normalizedModuleId)
    if (importers) {
      for (const importer of importers) {
        const importerDeps = moduleGraph.get(importer)
        if (importerDeps) {
          importerDeps.delete(normalizedModuleId)
        }
      }
      importerGraph.delete(normalizedModuleId)
    }
  }

  // 获取需要更新的边界模块
  function getBoundaryModules(changedFile: string): string[] {
    const normalizedChangedFile = normalizePath(changedFile)
    const boundaries: string[] = []
    const visited = new Set<string>()
    const queue: string[] = [normalizedChangedFile]

    // 以变更模块为起点向上收集所有导入链路候选边界
    while (queue.length > 0) {
      const file = queue.shift()!
      if (visited.has(file)) {
        continue
      }
      visited.add(file)
      boundaries.push(file)

      const importers = importerGraph.get(file)
      if (!importers || importers.size === 0) {
        continue
      }
      for (const importer of importers) {
        if (!visited.has(importer)) {
          queue.push(importer)
        }
      }
    }

    return boundaries
  }

  function isValidFilePath(filePath: unknown): filePath is string {
    return typeof filePath === 'string' && filePath.length > 0
  }

  function toChangedFileContext(filePath: string): ChangedFileContext {
    const normalizedPath = normalizePath(filePath)
    const changedUrl = normalizePath(
      fsPathToUrl(normalizedPath, serverContext.root)
    )
    return { normalizedPath, changedUrl }
  }

  function invalidateChangedFileCaches(context: ChangedFileContext) {
    invalidateTransformCache(context.normalizedPath)
    invalidateTransformCache(context.changedUrl)
  }

  function sendFullReload(path?: string) {
    const payload: HMRFullReloadPayload = { type: 'full-reload' }
    if (path) {
      payload.path = path
    }
    send(payload)
  }

  function sendJsUpdate(changedUrl: string) {
    const boundaryModules = getBoundaryModules(changedUrl)
    if (boundaryModules.length === 0) {
      console.log(colors.yellow(`[HMR] 找不到 ${changedUrl} 的HMR边界，执行全量刷新`))
      sendFullReload(changedUrl)
      return
    }

    const timestamp = Date.now()
    const updates: Update[] = boundaryModules.map((boundaryModule) => ({
      type: 'js-update',
      path: boundaryModule,
      acceptedPath: changedUrl,
      timestamp,
    }))

    console.log(
      colors.green(
        `[HMR] 发送模块更新: ${changedUrl} -> 边界模块: ${boundaryModules.join(', ')}`
      )
    )
    send({
      type: 'update',
      updates,
    } as HMRUpdatePayload)
  }

  function sendCssUpdate(changedUrl: string) {
    const timestamp = Date.now()
    const updates: Update[] = [
      {
        type: 'css-update',
        path: changedUrl,
        acceptedPath: changedUrl,
        timestamp,
      },
    ]

    console.log(colors.green(`[HMR] CSS热更新: ${changedUrl}`))
    send({
      type: 'update',
      updates,
    } as HMRUpdatePayload)
  }

  // 文件变化处理
  watcher.on('change', async (filePath) => {
    try {
      if (!isValidFilePath(filePath)) {
        console.warn(colors.yellow('[HMR] 无效的文件路径:'), filePath)
        return
      }

      const context = toChangedFileContext(filePath)
      invalidateChangedFileCaches(context)
      
      // 如果相对路径为空或无效，跳过处理
      if (!context.normalizedPath) {
        console.warn(colors.yellow('[HMR] 无法计算相对路径:'), context.normalizedPath)
        return
      }
      
      console.log(colors.cyan(`[HMR] 文件已更新: ${context.normalizedPath}`))

      // 处理不同类型的文件更新
      if (filePath.endsWith('.html')) {
        sendFullReload(context.changedUrl)
      } else if (isJsRequest(filePath)) {
        sendJsUpdate(context.changedUrl)
      } else if (isCssRequest(filePath)) {
        sendCssUpdate(context.changedUrl)
      } else {
        console.log(colors.yellow(`[HMR] 未知文件类型 ${context.changedUrl}，执行全量刷新`))
        sendFullReload(context.changedUrl)
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
    try {
      if (!isValidFilePath(filePath)) {
        console.warn('[HMR] 无效的文件路径: ' + filePath)
        return
      }

      const context = toChangedFileContext(filePath)
      invalidateChangedFileCaches(context)
      console.log(colors.green(`[HMR] 文件已添加: ${context.normalizedPath}`))
      // 新增文件触发全量刷新
      sendFullReload()
    } catch (error) {
      console.error(colors.red('[HMR] 处理文件添加错误:'), error)
    }
  })

  watcher.on('unlink', (filePath) => {
    try {
      if (!isValidFilePath(filePath)) {
        console.warn('[HMR] 无效的文件路径: ' + filePath)
        return
      }

      const context = toChangedFileContext(filePath)
      invalidateChangedFileCaches(context)
      removeModuleFromGraph(context.changedUrl)
      removeModuleFromGraph(context.normalizedPath)
      console.log(colors.red(`[HMR] 文件已删除: ${context.normalizedPath}`))
      // 删除文件触发全量刷新
      sendFullReload()
    } catch (error) {
      console.error(colors.red('[HMR] 处理文件删除错误:'), error)
    }
  })

  watcher.on('error', (error) => {
    console.error(colors.red('[HMR] 文件监听错误:'), error)
  })

  function send(payload: HMRPayload) {
    try {
      const stringified = JSON.stringify(payload)
      clients.forEach((client) => {
        try {
          if (client.readyState === WebSocket.OPEN) {
            client.send(stringified)
          }
        } catch (error) {
          console.error(colors.red('[HMR] 发送消息到客户端时出错:'), error)
          // 如果发送失败，移除客户端
          clients.delete(client)
        }
      })
    } catch (error) {
      console.error(colors.red('[HMR] 序列化消息时出错:'), error)
    }
  }

  function close() {
    try {
      clients.forEach((client) => {
        try {
          client.close()
        } catch (error) {
          console.error(colors.red('[HMR] 关闭客户端连接时出错:'), error)
        }
      })
      clients.clear()
    } catch (error) {
      console.error(colors.red('[HMR] 关闭客户端连接时出错:'), error)
    }
    
    try {
      watcher.close()
    } catch (error) {
      console.error(colors.red('[HMR] 关闭文件监听器时出错:'), error)
    }
    
    try {
      wss.close()
    } catch (error) {
      console.error(colors.red('[HMR] 关闭WebSocket服务器时出错:'), error)
    }
  }

  return {
    send,
    close,
    updateModuleGraph,
  }
}
