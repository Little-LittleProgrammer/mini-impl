import path from "path"
import os from "os"

export function slash(p: string): string {
    return p.replace(/\\/g, "/");
  }

export const isWindows = os.platform() === "win32";

export const QUERY_RE = /\?.*$/s;
export const HASH_RE = /#.*$/s;
/**
 * 清理 URL 中的查询参数和哈希值
 */
export function cleanUrl(url: string): string {
    return url.replace(QUERY_RE, "").replace(HASH_RE, "");
}

const knownJsSrcRE = /\.(?:[jt]sx?|m[jt]s|vue|marko|svelte|astro|imba|mdx)(?:$|\?)/;

/**
 * 将 Windows 的路径转换为 POSIX 路径
 * 例子：
 * C:\Users\user\Desktop\mini-vite\packages\mini-vite\src\node\utils.ts -> 
 * C:/Users/user/Desktop/mini-vite/packages/mini-vite/src/node/utils.ts
 * @param id 路径
 * @returns 转换后的路径
 */
export function normalizePath(id: string): string {
    return path.posix.normalize(isWindows ? slash(id): id)
}

/**
 * 判断是否为 JS 模块资源
 */
export function isJsRequest(url: string): boolean {
    url = cleanUrl(url);
    if (knownJsSrcRE.test(url)) {
        return true;
    }
    // 如果 URL 没有后缀名，且不是以 / 结尾，则认为是 JS 模块资源
    if (!path.extname(url) && url[url.length - 1] !== '/') {
        return true;
    }
    return false;
}

const importQueryRE = /(\?|&)import=?(?:&|$)/
const trailingSeparatorRE = /[?&]$/
/**
 * 判断是否为 import 请求
 */
export function isImportRequest(url: string): boolean {
    url = cleanUrl(url);
    // 如果 URL 中包含 import 查询参数，或者 URL 以 ? 或 & 结尾，则认为是 import 请求
    return importQueryRE.test(url) || trailingSeparatorRE.test(url);
}

export const CSS_LANGS_RE = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

/**
 * 判断是否为 CSS 模块资源
 */
export function isCssRequest(url: string): boolean {
    url = cleanUrl(url);
    return CSS_LANGS_RE.test(url);
}