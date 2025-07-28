import { SourceMap } from "rollup";
import { ServerContext } from "./server";
import { cleanUrl } from "./utils";

export interface TransformOptions {
    html?: boolean;
}
export interface TransformResult {
    code: string;
    map?: SourceMap | { mappings: '' } | null;
    etag?: string;
    deps?: string[];
    dynamicDeps?: string[];
}

/**
 * 转换请求
 * @param url 请求的 URL
 * @param serverContext 服务器上下文
 * @param options 转换选项
 * @returns 转换结果
 */
export async function transformRequest(url: string, serverContext: ServerContext, options: TransformOptions = {}): Promise<TransformResult | null> {
    const {pluginContainer} = serverContext;
    url = cleanUrl(url);
    // 依次调用插件容器的 resolveId、load、transform 方法
    const resolveResult = await pluginContainer.resolveId(url);
    let transformResult: TransformResult | null = null;
    if (resolveResult?.id) {
        const loadResult = await pluginContainer.load(resolveResult.id);
        let code = loadResult;
        if (typeof loadResult === 'object' && loadResult !== null) {
            code = loadResult.code;
        }
        if (typeof code === 'string') {
            transformResult = await pluginContainer.transform(code, resolveResult.id);
        }
    }
    return Promise.resolve(transformResult);;
}