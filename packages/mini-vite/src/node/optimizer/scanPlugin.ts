// 从 'esbuild' 模块中导入 Plugin 类型，这是定义 esbuild 插件所必需的类型。
import { Plugin } from 'esbuild'
// 从 '../constants' 文件中导入 externalTypes。
// externalTypes 是一个包含文件后缀名的数组，比如 ['css', 'less', 'svg', 'png'] 等。
// 这些文件类型在依赖扫描时会被当作外部资源处理，esbuild 不会尝试解析它们。
import { externalTypes } from '../constants'

/**
 * 定义并导出一个函数 esbuildScanPlugin，它创建并返回一个用于依赖扫描的 esbuild 插件。
 * @param depImports - 一个 Set<string> 类型的参数，用于收集扫描到的所有第三方依赖的名称。
 * @returns 返回一个配置好的 esbuild 插件对象。
 */
export function esbuildScanPlugin(depImports: Set<string>): Plugin {
    return {
        name: 'mini-vite:dep-scan',
        // setup 是 esbuild 插件的入口函数，esbuild 在初始化时会调用它，并传入一个 build 对象。
        // 我们可以通过 build 对象上的钩子（hooks）来介入构建过程。
        setup(build) {
            // 第一个 onResolve 钩子：处理并过滤掉非 JavaScript/TypeScript 类型的资源。
            build.onResolve(
                // 这里它会匹配所有以 externalTypes 中定义的后缀名结尾的文件路径。
                { filter: new RegExp(`\\.(${externalTypes.join("|")})$`)},
                (resolveInfo) => {
                    return {
                        // resolveInfo.path 是原始的导入路径。
                        path: resolveInfo.path,
                        // 'external: true' 是关键。它告诉 esbuild 将这个导入标记为“外部模块”。
                        // 这意味着 esbuild 不会尝试去解析和打包这个文件，从而避免了处理它不支持的文件类型（如样式、图片）时可能发生的错误。
                        // 原注释：无关的资源标记 external，不让 esbuild 处理，防止 Esbuild 未知报错
                        external: true,
                    }
                }
            )
            // 第二个 onResolve 钩子：用于捕获所有的裸模块导入（bare module imports），也就是第三方依赖。
            build.onResolve(
                // 这个正则表达式 /^[\w@][^:]/ 用于匹配裸模块。
                // - `^` 匹配字符串的开头。
                // - `[\w@]` 匹配任何单词字符（字母、数字、下quinoline）或 '@' 符号。这通常是 npm 包名的开头（如 'react' 或 '@vitejs/plugin-react'）。
                // - `[^:]` 确保第二个字符不是冒号，这有助于排除 Windows 绝对路径（如 C:\...）或 Vite 内部的一些虚拟模块。
                // 综上，这个过滤器可以有效地识别出第三方库的导入语句。
                {filter: /^[\w@][^:]/,},
                (resolveInfo) => {
                    // 当匹配到裸模块导入时，执行此回调。
                    const { path: id } = resolveInfo;
                    // 将捕获到的依赖包名（如 'react'）添加到传入的 depImports 集合中。
                    // 这是实现依赖收集的核心步骤。
                    depImports.add(id);
                    // 同样地，将这个依赖标记为外部模块。
                    // 在扫描阶段，我们只关心“有哪些依赖”，而不需要打包依赖本身的内容。
                    // 所以我们告诉 esbuild：“记录下来，然后跳过它”。
                    return {
                        path: id,
                        external: true,
                    };
                }
            )
        }
    }
}
