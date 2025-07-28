import { Plugin } from "../plugin";
import { 
    isESMModule,
    isJsRequest, 
    transformExportsAssignments, 
    transformModuleExports,
    hasSpecificSyntax
} from "../utils";


/**
 * CommonJS 兼容插件
 * 处理 CommonJS 模块与 ES 模块之间的互操作性
 * 1. 自动转换 module.exports 和 exports.xx 为 ES 模块导出
 * 2. 提供 require() 函数的浏览器兼容实现
 * 3. 支持混合模块格式
 */
export function commonjsPlugin(): Plugin {
    return {
        name: "mini-vite:commonjs",
        async transform(code, id) {
            // 只处理 JS 请求
            if (!isJsRequest(id)) return null;

            // 检查是否为 ESM 模块，如果是则跳过 CommonJS 转换
            if (isESMModule(code)) {
                return null;
            }

            // 检测和转换 CommonJS 模块
            let transformedCode = code;

            // 1. 转换 exports.xxx = value 为 ES 模块导出
            const exportsResult = transformExportsAssignments(code, transformedCode);
            transformedCode = exportsResult.code;

            // 2. 转换 module.exports = value 为默认导出
            transformedCode = transformModuleExports(code, transformedCode);

            // 3. 为 require() 提供浏览器兼容实现
            if (hasSpecificSyntax(code, /(?:^|[^\w$])require\s*\(/m)) {
                const requirePolyfill = `
// CommonJS require() 浏览器兼容实现
function __createRequire() {
    const moduleCache = new Map();
    
    return function require(id) {
        // 检查缓存
        if (moduleCache.has(id)) {
            return moduleCache.get(id);
        }
        
        // 对于相对路径，需要动态导入
        if (id.startsWith('./') || id.startsWith('../')) {
            // 这里应该通过动态导入来解决
            console.warn('Dynamic require for relative paths is not fully supported in browser environment');
            return {};
        }
        
        // 对于第三方包，返回空对象作为占位符
        console.warn(\`require('\${id}') is not fully supported in browser environment. Consider using ES modules instead.\`);
        return {};
    };
}

const require = __createRequire();
`;
                transformedCode = requirePolyfill + transformedCode;
            }

            // 4. 添加 CommonJS 全局变量
            if (hasSpecificSyntax(code, /(?:^|[^\w$])(?:module|exports)(?:[^\w$]|$)/m)) {
                const globalsPolyfill = `
// CommonJS 全局变量 polyfill
if (typeof module === 'undefined') {
    var module = { exports: {} };
}
if (typeof exports === 'undefined') {
    var exports = module.exports;
}
`;
                transformedCode = globalsPolyfill + transformedCode;
            }
            return {
                code: transformedCode,
                map: null // 简化实现，不生成 source map
            };
        }
    };
} 