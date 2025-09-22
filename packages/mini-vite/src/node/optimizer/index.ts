import path from 'path'
import { OptimizeDepsOptions } from './types'
import colors from 'picocolors'
import { esbuildScanPlugin } from './scanPlugin'
import { build } from 'esbuild'

export async function optimizeDeps(config: OptimizeDepsOptions) {
    console.log('>>>optimizeDeps', config)
    // 1. 定位需预构建的项目工程入口文件
    const entry = path.resolve(config.root, 'src/main.ts')
    // 2. 从入口文件开始扫描依赖项
    const deps = new Set<string>()
    console.debug(colors.green('>>>扫描依赖项...... \n'))
    /**
     * 扫描依赖项，将依赖项添加到 deps 集合中
     * 递归扫描依赖项
     */
    await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        plugins: [esbuildScanPlugin(deps)]
    })
    console.log(
        `${colors.green('需预构建的依赖项如下:')}\n${[...deps]
            .map(colors.green)
            .map(item => `- ${item}`)
            .join('\n')}\n\n`
    )
    // 3. 预构建依赖
    // 使用更明确的配置来处理 CommonJS 和 ES 模块转换
    await build({
        entryPoints: [...deps],
        write: true,
        bundle: true,
        format: "esm",
        splitting: true,
        logLevel: 'error',
        outdir: path.resolve(config.root, path.join('node_modules', '.mini-vite', 'deps')),
        // 增强的 CommonJS 支持配置
        platform: 'browser',
        target: 'esnext',
        mainFields: ['module', 'browser', 'main'],
        conditions: ['module', 'browser', 'import'],
        // 处理一些可能的 CommonJS 全局变量
        define: {
            'global': 'globalThis',
            'process.env.NODE_ENV': '"development"'
        }
    })
}
