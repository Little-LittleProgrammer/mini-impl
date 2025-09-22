import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Plugin } from '../plugin'
import { transformWithEsbuild } from './esbuild'

/**
 * HMR插件，提供客户端代码服务
 */
export function hmrPlugin(): Plugin {
    let clientCode: string

    return {
        name: 'mini-vite:hmr',
        async configureServer(server) {
            // 从项目根目录查找客户端代码
            // 首先尝试从编译后的位置查找
            const __dirname = path.dirname(fileURLToPath(import.meta.url))
            let clientPath = path.resolve(__dirname, '../../client/client.ts')
            
            // 如果编译后的位置不存在，尝试从源码位置
            if (!fs.existsSync(clientPath)) {
                // 从当前工作目录向上查找
                const packageRoot = path.resolve(process.cwd(), 'node_modules/mini-vite')
                if (fs.existsSync(packageRoot)) {
                    clientPath = path.resolve(packageRoot, 'src/client/client.ts')
                } else {
                    // 如果是开发环境，直接使用源码路径
                    clientPath = path.resolve(process.cwd(), '..', 'mini-vite/src/client/client.ts')
                    if (!fs.existsSync(clientPath)) {
                        clientPath = path.resolve(__dirname, '../../../src/client/client.ts')
                    }
                }
            }
            
            console.log('[HMR] 尝试加载客户端代码from:', clientPath)
            
            if (fs.existsSync(clientPath)) {
                const clientSource = fs.readFileSync(clientPath, 'utf-8')
                
                // 使用esbuild编译TypeScript客户端代码
                const result = await transformWithEsbuild(
                    clientSource,
                    clientPath,
                    {
                        format: 'esm',
                        target: 'esnext',
                        loader: 'ts'
                    }
                )
                
                clientCode = result.code
                console.log('[HMR] 客户端代码加载成功')
            } else {
                console.warn('[HMR] 客户端代码文件不存在:', clientPath)
                // 提供一个基本的客户端代码作为后备
                clientCode = `
console.log('[mini-vite] HMR client loading...')
const socketProtocol = location.protocol === 'https:' ? 'wss' : 'ws'
const socketHost = \`\${location.hostname}:\${location.port}\`
const socket = new WebSocket(\`\${socketProtocol}://\${socketHost}\`, 'vite-hmr')

socket.addEventListener('message', async ({ data }) => {
    const payload = JSON.parse(data)
    if (payload.type === 'full-reload') {
        console.log('[mini-vite] page reload triggered')
        window.location.reload()
    }
})

socket.addEventListener('open', () => {
    console.log('[mini-vite] connected')
})

socket.addEventListener('close', () => {
    console.log('[mini-vite] server connection lost. polling for restart...')
    setInterval(() => {
        new WebSocket(\`\${socketProtocol}://\${socketHost}\`, 'vite-hmr')
            .addEventListener('open', () => {
                location.reload()
            })
    }, 1000)
})
                `.trim()
            }
        },
        resolveId(id) {
            if (id === '/node_modules/.mini-vite/client.js') {
                return { id }
            }
            return null
        },
        load(id) {
            if (id === '/node_modules/.mini-vite/client.js') {
                return clientCode
            }
        }
    }
}
