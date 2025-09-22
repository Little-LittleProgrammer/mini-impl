import { Plugin } from "../plugin";
import { cleanUrl } from "../utils";
import { transform, TransformOptions } from "esbuild";
import path from "path";

/**
 * CommonJS 兼容插件 (基于 esbuild)
 * 使用 esbuild 将 CommonJS 模块转换为 ES 模块
 * 1. 自动转换 module.exports 和 exports.xx 为 ES 模块导出
 * 2. 处理 require() 调用，转换为 import 语句
 * 3. 提供更好的性能和兼容性
 */
export function commonjsPlugin(): Plugin {
    return {
        name: "mini-vite:commonjs",
        async transform(code, id) {
            // 只处理 JavaScript 文件（.js, .cjs, .mjs），不处理 TypeScript 和 JSX
            const jsFileReg = /\.(js|cjs)$/;
            if (!jsFileReg.test(id) && !jsFileReg.test(cleanUrl(id))) {
                return null;
            }

            // 检查是否已经是 ESM 模块（包含 import/export 语句）
            if (isESMModule(code)) {
                return null;
            }

            // 检查是否包含 CommonJS 语法
            if (!hasCommonJSSyntax(code)) {
                return null;
            }

            try {
                // 使用 esbuild 将 CommonJS 转换为 ESM
                const result = await transform(code, {
                    loader: getLoader(id),
                    format: 'esm', // 输出 ESM 格式
                    platform: 'browser', // 浏览器平台
                    target: 'esnext',
                    sourcemap: true,
                    // 启用 CommonJS 转换
                    define: {
                        'process.env.NODE_ENV': '"development"',
                        'global': 'globalThis'
                    }
                });

                return {
                    code: result.code,
                    map: result.map
                };
            } catch (error) {
                // 如果 esbuild 转换失败，回退到原始代码
                console.warn(`Failed to transform CommonJS module ${id}:`, error);
                return null;
            }
        }
    };
}

/**
 * 检查是否已经是 ESM 模块
 */
function isESMModule(code: string): boolean {
    const cleaned = cleanCode(code);
    
    // 检测 ES 模块的特征
    const hasImport = /(?:^|[^\w$])import\s+/m.test(cleaned);
    const hasExport = /(?:^|[^\w$])export\s+/m.test(cleaned);
    
    return hasImport || hasExport;
}

/**
 * 检查是否包含 CommonJS 语法
 */
function hasCommonJSSyntax(code: string): boolean {
    const cleaned = cleanCode(code);
    
    // 检测 CommonJS 的特征
    const hasRequire = /(?:^|[^\w$])require\s*\(/m.test(cleaned);
    const hasModuleExports = /(?:^|[^\w$])module\.exports/m.test(cleaned);
    const hasExports = /(?:^|[^\w$])exports\./m.test(cleaned);
    
    return hasRequire || hasModuleExports || hasExports;
}

/**
 * 清理代码中的注释和字符串
 */
function cleanCode(code: string): string {
    let cleanCode = code;
    
    // 移除单行注释
    cleanCode = cleanCode.replace(/\/\/.*$/gm, '');
    
    // 移除多行注释
    cleanCode = cleanCode.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // 移除字符串字面量（简化处理，支持单引号和双引号）
    cleanCode = cleanCode.replace(/'([^'\\]|\\.)*'/g, '""');
    cleanCode = cleanCode.replace(/"([^"\\]|\\.)*"/g, '""');
    cleanCode = cleanCode.replace(/`([^`\\]|\\.)*`/g, '""');
    
    return cleanCode;
}

/**
 * 根据文件扩展名获取对应的 esbuild loader
 */
function getLoader(filename: string): TransformOptions['loader'] {
    const ext = path.extname(cleanUrl(filename)).slice(1);
    
    switch (ext) {
        case 'js':
        case 'cjs':
        case 'mjs':
            return 'js';
        case 'ts':
        case 'cts':
        case 'mts':
            return 'ts';
        case 'jsx':
            return 'jsx';
        case 'tsx':
            return 'tsx';
        default:
            return 'js';
    }
} 