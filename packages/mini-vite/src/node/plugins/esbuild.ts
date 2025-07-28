import { Loader, transform, TransformOptions } from 'esbuild'
import path from 'path';
import { cleanUrl, isJsRequest } from '../utils';
import { Plugin } from "../plugin";
import fse from 'fs-extra';

/**
 * 编译插件最主要的作用是拿到通过插件容器 resolveId 钩子方法处理过的字符串路径 id 后
 * 加载模块内容并将JS/TS/JSX/TSX内容编译转换成浏览器可以执行的JS语法的代码
 * @param code
 * @param id
 */
export async function transformWithEsbuild(
    code: string,
    filename: string,
    options?: TransformOptions,
    inMap?: object
) {
    let loader = options?.loader;
    if (!loader) {
        // 如果 filename 以有效扩展名结尾，则直接使用它（例如 .vue）
        // 否则，在检查扩展名前先清理查询参数
        const ext = path.extname(/\.\w+$/.test(filename) ? filename : cleanUrl(filename)).slice(1)

        if (ext === 'cjs' || ext === 'mjs') {
            loader = 'js';
        } else if (ext === 'cts' || ext === 'mts') {
            loader = 'ts';
        } else {
            loader = ext as Loader;
        }
    }

    const result = await transform(code, options);
    return result
}

export function esbuildTransformPlugin(): Plugin {
    return {
        name: "mini-vite:esbuild-transform",
        async load(id) {
            if (isJsRequest(id)) {
                try {
                    const code = await fse.readFile(id, 'utf-8');
                    return code
                } catch (e) {
                    return null;
                }
            }
        },
        async transform(code, id) {
            const reg = /\.(m?ts|[jt]sx|cjs|mjs)$/;
            if (reg.test(id) || reg.test(cleanUrl(id))) {
                const result = await transformWithEsbuild(code, id, {
                    target: "esnext",
                    format: "esm",
                    sourcemap: true,
                });
                return {
                    code: result.code,
                    map: result.map,
                }
            }
            return null;
        }
    }
}