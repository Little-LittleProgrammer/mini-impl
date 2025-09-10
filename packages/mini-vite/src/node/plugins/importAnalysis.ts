import path from "path";
import { Plugin } from "../plugin";
import { ServerContext } from "../server";
import { isJsRequest, normalizePath } from "../utils";
import { init, parse } from "es-module-lexer";
import MagicString from "magic-string";
import resolve from "resolve";

/**
 * import分析插件用于在遍历分析已经编译好的模块文件内ESM导入语句
    如：
    import { createPinia } from 'pinia';
    import { createXXX } from 'xxx';
    import { transformText } from './kit/tool';

    并将导入对应的路径进行分类处理：

    第三方依赖路径(bare import)：重写为预构建产物路径
    绝对路径和相对路径：需借助之前的路径解析插件进行解析
 */

export function importAnalysisPlugin(): Plugin {
    let serverContext: ServerContext;
    return {
        name: "mini-vite:import-analysis",
        configureServer(server) {
            serverContext = server;
        },
        /**
         * 举例：
         * import { createPinia } from 'pinia';
         * => import { createPinia } from '/node_modules/.mini-vite/deps/pinia.js';
         */
        async transform(source, importer, options) {
            if (!serverContext) return null;
             // 只处理 JS 的请求
             if (!isJsRequest(importer)) return null;
             // 初始化解析器（必需步骤）
             await init;
             // 解析 import 语句
             const [imports] = parse(source);
             const ms = new MagicString(source);
             
             // 注入HMR API
             let hasHMRAPI = false;
             
             // 收集依赖项用于模块图更新
             const importees: string[] = [];
             
             // 遍历每个 import 语句依次进行分析
             if (imports.length > 0) {
                 for(let inportInfo of imports) {
                    /**
                     * 举例：import { createPinia } from 'pinia';
                     * s: 30
                     * e: 35
                     * n: 'pinia'
                     */
                    const {s: modStart, e: modEnd,n:modSource } = inportInfo;
                    if (!modSource) continue;
                    
                    let resolvedId = modSource;
                    
                    // 将第三方依赖的路径重写到预构建产物的路径
                    if (/^[\w@][^:]/.test(modSource)) {
                        const bundlePath = normalizePath(
                            path.join('/', path.join('node_modules', '.mini-vite', 'deps'), `${modSource}.js`)
                        );
                        ms.overwrite(modStart, modEnd, bundlePath);
                        resolvedId = bundlePath;
                    } else if (modSource.startsWith(".") || modSource.startsWith("/")) {
                        // 调用插件上下文的 resolve 方法，自动经过路径解析插件的处理
                        const resolved = await this.resolve(modSource, importer);
                        if (resolved) {
                            ms.overwrite(modStart, modEnd, resolved.id);
                            resolvedId = resolved.id;
                        }
                    }
                    
                    // 添加到依赖列表
                    if (resolvedId) {
                        importees.push(resolvedId);
                    }
                 }
             }
             
             // 更新模块依赖图
             if (serverContext.hmr && importees.length > 0) {
                 const normalizedImporter = normalizePath(importer);
                 serverContext.hmr.updateModuleGraph(normalizedImporter, importees);
             }
             
             // 如果没有import语句但有HMR API使用，仍然需要注入
             if (!hasHMRAPI && source.includes('import.meta.hot')) {
                 const hmrCode = `
// HMR API注入
const __HMR__ = window.__mini_vite__.createHotContext("${normalizePath(importer)}");
if (typeof import !== 'undefined' && import.meta) {
    import.meta.hot = __HMR__;
} else {
    // 创建import.meta对象
    globalThis['import.meta'] = globalThis['import.meta'] || {};
    globalThis['import.meta'].hot = __HMR__;
}
`.trim();
                 ms.prepend(hmrCode + '\n\n');
             }
             
             return {
                code: ms.toString(),
                map: ms.generateMap(),
             }
        }
    }
}