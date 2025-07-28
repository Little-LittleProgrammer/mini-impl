import path from 'path'
import { OptimizeDepsOptions } from './types'
import colors from 'picocolors'
import { esbuildScanPlugin } from './scanPlugin'
import { build } from 'esbuild'
import fse from 'fs-extra'

export async function optimizeDeps(config: OptimizeDepsOptions) {
    console.log('>>>optimizeDeps', config)
    // 1. 定位需预构建的项目工程入口文件
    const entry = path.resolve(config.root, 'src/main.ts')
    // 2. 从入口文件开始扫描依赖项
    const deps = new Set<string>()
    console.debug(colors.green('>>>扫描依赖项...... \n'))
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
    })
}
