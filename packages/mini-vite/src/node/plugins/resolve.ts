import path from "path";
import resolve from "resolve";

import { Plugin } from "../plugin";
import { pathExists } from "fs-extra";
import { normalizePath } from "../utils";
import { ServerContext } from "../server";

/**
 * 路径解析插件
 * 路径解析首先判断路径字符串是相对路径还是绝对路径
 * - 若是绝对路径，进一步判断路径对应的文件模块是否存在，若不存在则拼上项目根目录的路径再次判断
 * - 若是相对路径，通过将当前被遍历到的目标模块路径 importer 拼上相对路径再判断文件模块是否存在，若存在则返回拼接后的路径，若不存在则返回null
 */
export default function resolvePlugin(): Plugin {
    let serverContext: ServerContext;
    return {
        name: 'mini-vite:resolve',
        configureServer(serverCtx) {
            serverContext = serverCtx;
        },
        async resolveId(id, importer) {
            // 判断是否为绝对路径
            if (path.isAbsolute(id)) {
                 // 路径存在，直接返回
                if (await pathExists(id)) {
                    return { id };
                }
                // 路径不存在的情况下加上 root 路径前缀，支持类似 /src/main.ts 的情况
                id = path.join(serverContext.root, id);
                if (await pathExists(id)) {
                    return { id };
                }
                return null;
            } else if (id.startsWith('.')) {
                 // 相对路径
                 if (!importer) throw new Error('`importer` should not be undefined');
                 const hasExtension = path.extname(id).length > 1;
                 let resolveId: string;
                 // 包含文件名后缀, 如 ./main.ts
                 if (hasExtension) {
                    resolveId = normalizePath(resolve.sync(id, { basedir: path.dirname(importer) }));
                    if (await pathExists(resolveId)) {
                        return { id: resolveId };
                    }
                 } else {
                    // 不包含文件名后缀，如 ./main
                    // 遍历来实现自动推断文件后缀名，如：./main -> ./main.ts
                    for (const ext of ['.ts', '.js', '.jsx', '.tsx', '.json']) {
                        try {
                            const withExtension = `${id}${ext}`;
                            resolveId = normalizePath(resolve.sync(withExtension, { basedir: path.dirname(importer) }));
                            if (await pathExists(resolveId)) {
                                return { id: resolveId };
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                 }
            }
            return null;
        }
    }
}