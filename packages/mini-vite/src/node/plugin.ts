import {
    LoadResult,
    ObjectHook,
    PartialResolvedId,
    TransformPluginContext,
    TransformResult,
    Plugin as RollupPlugin
} from 'rollup'
import { ServerContext } from './server'

export type ServerHook = (
    server: ServerContext
) => (() => void) | void | Promise<(() => void) | void>

// type ObjectHook<T, O = {}> = T | ({ handler: T; order?: 'pre' | 'post' | null } & O);

// 只实现以下这几个钩子
export interface Plugin extends RollupPlugin {
    // 插件名称
    name: string
    /**
     * 配置服务器
     * @param server 服务器
     */
    configureServer?: ServerHook
    /**
     * 解析模块
     * @param id 模块路径
     * @param importer 导入模块路径,哪个文件导入的
     * @returns 解析后的模块路径
     */
    resolveId?: (
        id: string, // 模块路径
        importer?: string // 导入模块路径,哪个文件导入的
    ) => Promise<PartialResolvedId | null> | PartialResolvedId | null
    /**
     * 加载模块
     * @param id 模块路径
     * @returns 模块内容
     */
    load?: (id: string) => Promise<LoadResult | null> | LoadResult | null
    /**
     * 转换模块
     * @param code 模块内容
     * @param id 模块路径
     * @param options 选项
     * @returns 转换后的模块内容
     */
    transform?: ObjectHook<
        (
            this: Partial<TransformPluginContext> &
                Pick<TransformPluginContext, 'resolve'>,
            code: string,
            id: string,
            options?: { ssr?: boolean }
        ) => Promise<TransformResult | null> | TransformResult | null
    >
    /**
     * 转换 HTML 文件
     * @param raw HTML 文件内容
     * @returns 转换后的 HTML 文件内容
     */
    transformIndexHtml?: (raw: string) => Promise<string> | string
}
