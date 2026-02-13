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
 * 判断某个文件路径是否位于 root 内
 */
export function isFileInsideRoot(filePath: string, root: string): boolean {
    const normalizedRoot = normalizePath(path.resolve(root));
    const normalizedFile = normalizePath(path.resolve(filePath));
    return (
        normalizedFile === normalizedRoot ||
        normalizedFile.startsWith(`${normalizedRoot}/`)
    );
}

/**
 * 将文件系统路径转换为浏览器 URL 路径（root 内）
 */
export function fsPathToUrl(filePath: string, root: string): string {
    const normalizedRoot = normalizePath(path.resolve(root));
    const normalizedFile = normalizePath(path.resolve(filePath));
    if (isFileInsideRoot(normalizedFile, normalizedRoot)) {
        const relativePath = normalizePath(path.relative(normalizedRoot, normalizedFile));
        return `/${relativePath}`;
    }
    return normalizedFile;
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

// 辅助函数：找到赋值语句的结束位置
export function findAssignmentEnd(codeFromAssignment: string): number {
    let braceCount = 0;
    let parenCount = 0;
    let bracketCount = 0;
    let inString = false;
    let stringChar = '';
    let i = 0;
    let hasStartedValue = false;
    
    // 跳过 "exports.name = " 部分
    const equalIndex = codeFromAssignment.indexOf('=');
    if (equalIndex === -1) return 0;
    i = equalIndex + 1;
    
    // 跳过等号后的空白字符
    while (i < codeFromAssignment.length && /\s/.test(codeFromAssignment[i])) {
        i++;
    }
    
    // 解析赋值内容
    while (i < codeFromAssignment.length) {
        const char = codeFromAssignment[i];
        const prevChar = i > 0 ? codeFromAssignment[i - 1] : '';
        
        // 标记已经开始解析值
        if (!hasStartedValue && !/\s/.test(char)) {
            hasStartedValue = true;
        }
        
        // 处理字符串
        if (!inString && (char === '"' || char === "'" || char === '`')) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            stringChar = '';
        }
        
        if (!inString && hasStartedValue) {
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                // 如果所有括号都匹配了，检查是否是函数或对象结束
                if (braceCount === 0) {
                    // 检查下一个有意义的字符
                    let j = i + 1;
                    while (j < codeFromAssignment.length && /\s/.test(codeFromAssignment[j])) {
                        j++;
                    }
                    if (j >= codeFromAssignment.length || codeFromAssignment[j] === ';' || codeFromAssignment[j] === '\n') {
                        return j < codeFromAssignment.length && codeFromAssignment[j] === ';' ? j + 1 : j;
                    }
                }
            } else if (char === '(') {
                parenCount++;
            } else if (char === ')') {
                parenCount--;
            } else if (char === '[') {
                bracketCount++;
            } else if (char === ']') {
                bracketCount--;
            } else if (char === ';' && braceCount === 0 && parenCount === 0 && bracketCount === 0) {
                // 找到语句结束的分号
                return i + 1;
            } else if (char === '\n' && braceCount === 0 && parenCount === 0 && bracketCount === 0) {
                // 检查是否是简单值的结束
                const restOfCode = codeFromAssignment.substring(i + 1);
                const nextNonWhite = restOfCode.match(/^\s*(.)/);
                if (!nextNonWhite || 
                    (nextNonWhite[1] !== ',' && nextNonWhite[1] !== '.' && nextNonWhite[1] !== '+' && 
                     nextNonWhite[1] !== '-' && nextNonWhite[1] !== '*' && nextNonWhite[1] !== '/' &&
                     nextNonWhite[1] !== '=' && nextNonWhite[1] !== '&' && nextNonWhite[1] !== '|')) {
                    return i + 1;
                }
            }
        }
        i++;
    }
    
    return i;
}

/**
 * 处理 CommonJS 导出的通用方法
 * 用于智能处理多行赋值（如函数定义）
 */
export interface AssignmentInfo {
    name: string;
    start: number;
    pattern: RegExp;
}

/**
 * 转换 exports.xxx = value 为 ES 模块导出
 * @param code 原始代码
 * @param transformedCode 当前转换后的代码
 * @returns 转换后的代码和导出的名称列表
 */
export function transformExportsAssignments(code: string, transformedCode: string): {
    code: string;
    exportedNames: string[];
} {
    const exportedNames: string[] = [];
    
    // 首先找到所有 exports.xxx = 的位置
    const exportsPattern = /(?:^|[^\w$])exports\.([a-zA-Z_$][\w$]*)\s*=/gm;
    let match;
    const exportAssignments: Array<{name: string, start: number}> = [];
    
    while ((match = exportsPattern.exec(code)) !== null) {
        const propName = match[1];
        const assignmentStart = match.index + match[0].indexOf('exports.');
        
        exportAssignments.push({
            name: propName,
            start: assignmentStart
        });
    }
    
    // 从后往前处理，避免位置偏移问题
    exportAssignments.reverse().forEach(assignment => {
        const { name, start } = assignment;
        
        // 找到赋值语句的结束位置
        const remainingCode = transformedCode.substring(start);
        const endPosition = findAssignmentEnd(remainingCode);
        
        if (endPosition > 0) {
            const insertPosition = start + endPosition;
            
            // 在赋值语句结束后插入变量声明和 ES 模块导出
            // 将 exports.xxx = value 转换为 exports.xxx = value; const xxx = exports.xxx; export { xxx };
            transformedCode = transformedCode.substring(0, insertPosition) + 
                            `; const ${name} = exports.${name}; export { ${name} };` + 
                            transformedCode.substring(insertPosition);
            
            exportedNames.push(name);
        }
    });
    
    return { code: transformedCode, exportedNames };
}

/**
 * 转换 module.exports = value 为 ES 模块默认导出
 * @param code 原始代码
 * @param transformedCode 当前转换后的代码
 * @returns 转换后的代码
 */
export function transformModuleExports(code: string, transformedCode: string): string {
    const moduleExportsPattern = /(?:^|[^\w$])module\.exports\s*=/gm;
    let match;
    const moduleExportsAssignments: Array<{start: number}> = [];
    
    // 找到所有 module.exports = 的位置
    while ((match = moduleExportsPattern.exec(code)) !== null) {
        const assignmentStart = match.index + match[0].indexOf('module.exports');
        moduleExportsAssignments.push({ start: assignmentStart });
    }
    
    // 从后往前处理，避免位置偏移问题
    moduleExportsAssignments.reverse().forEach(assignment => {
        const { start } = assignment;
        
        // 找到赋值语句的结束位置
        const remainingCode = transformedCode.substring(start);
        const endPosition = findAssignmentEnd(remainingCode);
        
        if (endPosition > 0) {
            const insertPosition = start + endPosition;
            
            // 提取赋值的值
            const assignmentCode = remainingCode.substring(0, endPosition);
            const equalIndex = assignmentCode.indexOf('=');
            if (equalIndex > -1) {
                const exportValue = assignmentCode.substring(equalIndex + 1).trim();
                
                // 移除末尾的分号
                const cleanExportValue = exportValue.replace(/;$/, '');
                
                // 检查是否是对象字面量
                if (cleanExportValue.startsWith('{')) {
                    // 如果是对象字面量，提取属性并创建命名导出
                    const objMatch = cleanExportValue.match(/\{\s*([^}]+)\s*\}/);
                    if (objMatch) {
                        const properties = objMatch[1].split(',').map(prop => {
                            const trimmedProp = prop.trim();
                            const colonIndex = trimmedProp.indexOf(':');
                            if (colonIndex > -1) {
                                const key = trimmedProp.substring(0, colonIndex).trim();
                                return key;
                            }
                            return trimmedProp;
                        }).filter(Boolean);
                        
                        transformedCode = transformedCode.substring(0, insertPosition) + 
                                        `\nexport default ${cleanExportValue};\nexport { ${properties.join(', ')} };` + 
                                        transformedCode.substring(insertPosition);
                    }
                } else {
                    // 直接默认导出
                    transformedCode = transformedCode.substring(0, insertPosition) + 
                                    `\nexport default ${cleanExportValue};` + 
                                    transformedCode.substring(insertPosition);
                }
            }
        }
    });
    
    return transformedCode;
}

/**
 * 清理代码中的注释和字符串
 */
export function cleanCode(code: string): string {
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
 * 检测是否为 ESM 模块
 * 如果包含 import/export 语句，则认为是 ESM 模块
 */
export function isESMModule(code: string): boolean {
    const cleaned = cleanCode(code);
    
    // 检测 ES 模块的特征
    const hasImport = /(?:^|[^\w$])import\s+/m.test(cleaned);
    const hasExport = /(?:^|[^\w$])export\s+/m.test(cleaned);
    const hasExportDefault = /(?:^|[^\w$])export\s+default\s+/m.test(cleaned);
    
    return hasImport || hasExport || hasExportDefault;
}

/**
 * 检测是否正则匹配
 */
export function hasSpecificSyntax(code: string, pattern: RegExp): boolean {
    const cleaned = cleanCode(code);
    return pattern.test(cleaned);
}
