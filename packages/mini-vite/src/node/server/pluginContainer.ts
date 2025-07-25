import {
    InputOptions,
    ModuleInfo,
    CustomPluginOptions,
    PartialResolvedId,
    SourceDescription,
    SourceMap,
    LoadResult,
    PluginContext,
    ResolvedId
} from 'rollup'

/**
 * 插件容器
 * Vite 插件钩子执行顺序
 *
 * 1. 配置解析阶段 (Configuration Parsing)
 *    - config() - Vite独有钩子，用于修改配置
 *    - configResolved() - Vite独有钩子，配置解析完成
 *    - options() - Vite独有钩子，设置构建选项
 *    - configureServer() - Vite独有钩子，配置开发服务器
 *    - configurePreviewServer() - Vite独有钩子，配置预览服务器
 *
 * 2. 构建阶段 (Build Phase)
 *    - buildStart() - 通用钩子，构建开始
 *    - resolvedId() - 通用钩子，解析模块ID
 *    - load() - 通用钩子，加载模块内容
 *    - transform() - 通用钩子，转换模块内容
 *    - buildEnd() - 通用钩子，构建结束
 *
 * 3. 输出阶段 (Output Phase)
 *    - outputOptions() - 通用钩子，输出选项配置
 *    - renderStart() - 通用钩子，渲染开始
 *    - argumentChunkHash() - 通用钩子，生成chunk哈希
 *    - renderChunk() - 通用钩子，渲染chunk
 *    - generateBundle() - 通用钩子，生成bundle
 *    - writeBundle() - 通用钩子，写入bundle
 *
 * 独立钩子：
 * - handleHotUpdate() - Vite独有钩子，处理热更新
 * - transformIndexHtml() - Vite独有钩子，转换HTML模板
 * - closeBundle() - 通用钩子，关闭bundle（最终清理步骤）
 *
 * 执行流程：
 * 配置解析 -> 构建阶段 -> 输出阶段 -> 独立钩子
 * 
 * resolve、load、transform三个钩子是实际工程化项目当中使用较为频繁的三个钩子
 */

export interface PluginContainer {
    /**
     * 解析模块ID
     * @param id
     * @param imports
     * @param options
     * @returns
     */
    resolveId(
        id: string,
        imports?: string,
        options?: {
            attributes?: Record<string, string>
            custom?: CustomPluginOptions
            skip?: Set<Plugin>
            ssr?: boolean
            scan?: boolean
            isEntry?: boolean
        }
    ): Promise<PartialResolvedId | null>

    /**
     * 转换模块内容
     * @param code
     * @param id
     * @param options
     * @returns
     */
    transform(
        code: string,
        id: string,
        options?: {
            inMap?: SourceDescription['map']
            ssr?: boolean
        }
    ): Promise<SourceDescription | null>

    /**
     * 加载模块内容
     * @param id
     * @param options
     * @returns
     */
    load(id: string, options?: { ssr?: boolean }): Promise<LoadResult | null>
}

export const createPluginContainer = (config: {
    plugins: any[]
}): PluginContainer => {
    const plugins = config.plugins

    // 插件上下文对象
    class Context implements Pick<PluginContext, 'resolve'> {
        async resolve(id: string, importer?: string) {
            let out = await pluginContainer.resolveId(id, importer);
            if (typeof out === 'string') {
                return {id: out};
            }
            return out as ResolvedId | null;
        }
    }

    // 插件容器
    const pluginContainer: PluginContainer = {
        // 解析模块ID 路径映射关系转换钩子
        async resolveId(id: string, importer?: string) {
            const ctx = new Context()
            for (const plugin of plugins) {
                if (plugin.resolveId) {
                    const newId = await plugin.resolvedId.call(
                        ctx,
                        id,
                        importer
                    )
                    if (newId) {
                        id = typeof newId === 'string' ? newId : newId.id
                        return { id }
                    }
                }
            }
            return null
        },

        async load(id) {
            const ctx = new Context()
            for (const plugin of plugins) {
                if (plugin.load) {
                    const result = await plugin.load.call(ctx, id)
                    if (result) {
                        return result
                    }
                }
            }
            return null
        },

        async transform(code, id) {
            const ctx = new Context()
            for (const plugin of plugins) {
                if (plugin.transform) {
                    let result = null
                    if ('handler' in plugin.transform) {
                        result = await plugin.transform.handler.call(
                            ctx,
                            code,
                            id
                        )
                    } else {
                        result = await plugin.transform.call(ctx, code, id)
                    }
                    if (!result) continue
                    if (typeof result === 'string') {
                        code = result
                    } else if (result.code) {
                        code = result.code
                    }
                }
            }
            return {
                code,
                map: null
            }
        }
    }
    return pluginContainer;
}
