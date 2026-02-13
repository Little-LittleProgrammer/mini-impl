import { SourceMap } from "rollup";
import { ServerContext } from "./server";
import { cleanUrl, normalizePath } from "./utils";
import fse from "fs-extra";
import path from "path";

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

interface TransformCacheEntry {
    result: TransformResult;
    mtimeMs: number | null;
}

const transformCache = new Map<string, TransformCacheEntry>();

export function invalidateTransformCache(id: string): void {
    const normalizedId = cleanUrl(id);
    const normalizedPathId = normalizePath(normalizedId);
    transformCache.delete(id);
    transformCache.delete(normalizedId);
    transformCache.delete(normalizedPathId);
}

async function getFileMtimeMs(id: string): Promise<number | null> {
    if (!path.isAbsolute(id)) {
        return null;
    }
    if (!(await fse.pathExists(id))) {
        return null;
    }
    const fileStat = await fse.stat(id);
    return fileStat.mtimeMs;
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
        const cacheKey = resolveResult.id;
        const mtimeMs = await getFileMtimeMs(resolveResult.id);
        const cacheEntry = transformCache.get(cacheKey);
        if (cacheEntry && cacheEntry.mtimeMs === mtimeMs) {
            return cacheEntry.result;
        }
        const loadResult = await pluginContainer.load(resolveResult.id);
        let code = loadResult;
        if (typeof loadResult === 'object' && loadResult !== null) {
            code = loadResult.code;
        }
        if (typeof code === 'string') {
            transformResult = await pluginContainer.transform(code, resolveResult.id);
            if (transformResult) {
                transformCache.set(cacheKey, {
                    result: transformResult,
                    mtimeMs
                });
            }
        }
    }
    return Promise.resolve(transformResult);;
}