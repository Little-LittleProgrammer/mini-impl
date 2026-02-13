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

  // 获取需要更新的边界模块
  function getBoundaryModules(changedFile: string): string[] {
    const boundaries: string[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>() // 用于检测循环依赖
    
    function traverse(file: string): boolean {
      // 如果已经访问过，说明是边界模块
      if (visited.has(file)) {
        return boundaries.includes(file)
      }
      
      // 检测循环依赖
      if (visiting.has(file)) {
        // 循环依赖情况下，将当前文件作为边界
        if (!boundaries.includes(file)) {
          boundaries.push(file)
        }
        return true
      }
      
      visiting.add(file)
      
      const importers = importerGraph.get(file)
      if (!importers || importers.size === 0) {
        // 如果没有导入者，这个文件本身就是边界
        boundaries.push(file)
        visiting.delete(file)
        visited.add(file)
        return true
      }
      
      let hasBoundary = false
      for (const importer of importers) {
        if (traverse(importer)) {
          hasBoundary = true
        }
      }
      
      // 如果所有导入者都不是边界，则当前文件是边界
      if (!hasBoundary) {
        boundaries.push(file)
      }
      
      visiting.delete(file)
      visited.add(file)
      return true
    }
    
    const normalizedChangedFile = normalizePath(changedFile)
    traverse(normalizedChangedFile)
    return boundaries
  }

  // 文件变化处理
  watcher.on('change', async (filePath) => {
    try {
      // 验证文件路径
      if (!filePath || typeof filePath !== 'string') {
        console.warn(colors.yellow('[HMR] 无效的文件路径:'), filePath)
        return
      }

      const normalizedPath = normalizePath(filePath)
      const changedUrl = normalizePath(
        fsPathToUrl(normalizedPath, serverContext.root)
      )
      invalidateTransformCache(normalizedPath)
      invalidateTransformCache(changedUrl)
      
      // 如果相对路径为空或无效，跳过处理
      if (!normalizedPath) {
        console.warn(colors.yellow('[HMR] 无法计算相对路径:'), normalizedPath)
        return
      }
      
      console.log(colors.cyan(`[HMR] 文件已更新: ${normalizedPath}`))

      // 处理不同类型的文件更新
      if (filePath.endsWith('.html')) {
        // HTML文件变化 - 全量刷新
        send({
          type: 'full-reload',
          path: changedUrl
        } as HMRFullReloadPayload)
      } else if (isJsRequest(filePath) || filePath.endsWith('.vue') || filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
        // JS/TS/Vue文件变化
        const timestamp = Date.now()
        
        // 获取受影响的边界模块
        const boundaryModules = getBoundaryModules(changedUrl)
        
        if (boundaryModules.length === 0) {
          // 如果找不到边界模块，进行全量刷新
          console.log(colors.yellow(`[HMR] 找不到 ${changedUrl} 的HMR边界，执行全量刷新`))
          send({
            type: 'full-reload',
            path: changedUrl
          } as HMRFullReloadPayload)
        } else {
          // 为每个边界模块创建更新信息
          const updates: Update[] = boundaryModules.map(boundaryModule => ({
            type: 'js-update' as const,
            path: boundaryModule,
            acceptedPath: changedUrl,
            timestamp,
          }))
          
          console.log(colors.green(`[HMR] 发送模块更新: ${changedUrl} -> 边界模块: ${boundaryModules.join(', ')}`))
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
          path: changedUrl,
          acceptedPath: changedUrl,
          timestamp,
        }]
        
        console.log(colors.green(`[HMR] CSS热更新: ${changedUrl}`))
        send({
          type: 'update',
          updates,
        } as HMRUpdatePayload)
      } else {
        // 其他文件变化 - 全量刷新
        console.log(colors.yellow(`[HMR] 未知文件类型 ${changedUrl}，执行全量刷新`))
        send({
          type: 'full-reload',
          path: changedUrl
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
    try {
      // 验证文件路径
      if (!filePath || typeof filePath !== 'string') {
        console.warn('[HMR] 无效的文件路径: ' + filePath)
        return
      }

      const normalizedPath = normalizePath(filePath)
      const changedUrl = normalizePath(
        fsPathToUrl(normalizedPath, serverContext.root)
      )
      invalidateTransformCache(normalizedPath)
      invalidateTransformCache(changedUrl)
      console.log(colors.green(`[HMR] 文件已添加: ${normalizedPath}`))
      // 新增文件触发全量刷新
      send({
        type: 'full-reload',
      } as HMRFullReloadPayload)
    } catch (error) {
      console.error(colors.red('[HMR] 处理文件添加错误:'), error)
    }
  })

  watcher.on('unlink', (filePath) => {
    try {
      // 验证文件路径
      if (!filePath || typeof filePath !== 'string') {
        console.warn('[HMR] 无效的文件路径: ' + filePath)
        return
      }

      const normalizedPath = normalizePath(filePath)
      const changedUrl = normalizePath(
        fsPathToUrl(normalizedPath, serverContext.root)
      )
      invalidateTransformCache(normalizedPath)
      invalidateTransformCache(changedUrl)
      console.log(colors.red(`[HMR] 文件已删除: ${normalizedPath}`))
      // 删除文件触发全量刷新
      send({
        type: 'full-reload',
      } as HMRFullReloadPayload)
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
