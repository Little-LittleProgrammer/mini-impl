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
             if (!imports.length) return null;
             const ms = new MagicString(source);
             // 遍历每个 import 语句依次进行分析
             for(let inportInfo of imports) {
                /**
                 * 举例：import { createPinia } from 'pinia';
                 * s: 0
                 * e: 25
                 * n: 'pinia'
                 */
                const {s: modStart, e: modEnd,n:modSource } = inportInfo;
                if (!modSource) continue;
                // 将第三方依赖的路径重写到预构建产物的路径
                if (/^[\w@][^:]/.test(modSource)) {
                    const bundlePath = normalizePath(
                        path.join('/', path.join('node_modules', '.mini-vite', 'deps'), `${modSource}.js`)
                    );
                    ms.overwrite(modStart, modEnd, bundlePath);
                } else if (modSource.startsWith(".") || modSource.startsWith("/")) {
                    // 调用插件上下文的 resolve 方法，自动经过路径解析插件的处理
                    const resolved = await this.resolve(modSource, importer);
                    if (resolved) {
                        ms.overwrite(modStart, modEnd, resolved.id);
                    }
                }
             }
             return {
                code: ms.toString(),
                map: ms.generateMap(),
             }
        }
    }
}