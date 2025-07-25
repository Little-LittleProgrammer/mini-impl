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

export async function transformRequest(url: string, serverContext: ServerContext, options: TransformOptions = {}): Promise<TransformResult | null> {
    const {pluginContainer} = serverContext;
    url = cleanUrl(url);
    // 依次调用插件容器的 resolveId、load、transform 方法
    const resolveResult = await pluginContainer.resolveId(url);
    let transformResult: TransformResult | null = null;
    if (resolveResult?.id) {
        const LoadResult = await pluginContainer.load(resolveResult.id);
        let code = '';
        if (typeof LoadResult === 'object' && LoadResult !== null) {
            code = LoadResult.code;
        }
        if (code) {
            transformResult = await pluginContainer.transform(code, resolveResult.id);
        }
    }
    return Promise.resolve(transformResult);;
}