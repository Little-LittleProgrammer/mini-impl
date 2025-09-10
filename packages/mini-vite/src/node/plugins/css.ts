import { Plugin } from "../plugin";
import { isCssRequest } from "../utils";
import fse from "fs-extra";

export function cssPlugin(): Plugin {
    return {
        name: 'mini-vite:css',
        load(id) {
            if (isCssRequest(id)) {
                return fse.readFile(id, "utf-8");
            }
        },
        async transform(code, id) {
            if (!isCssRequest(id)) return null;
            
            // 转义CSS内容，处理换行和引号
            const escapedCss = code
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
            
            // 生成CSS模块代码，支持HMR
            const cssModule = `
// CSS模块 - 支持HMR
const cssStr = "${escapedCss}";
const moduleId = "${id}";

// 创建或更新样式
function updateStyle(css, id) {
    // 查找已存在的样式标签
    let style = document.querySelector(\`style[data-vite-dev-id="\${id}"]\`);
    
    if (style) {
        // 更新现有样式
        style.innerHTML = css;
    } else {
        // 创建新的样式标签
        style = document.createElement("style");
        style.setAttribute("type", "text/css");
        style.setAttribute("data-vite-dev-id", id);
        style.innerHTML = css;
        document.head.appendChild(style);
    }
    return style;
}

// 应用样式
const styleElement = updateStyle(cssStr, moduleId);

// HMR支持
if (import.meta.hot) {
    import.meta.hot.accept(() => {
        console.log('[HMR] CSS updated:', moduleId);
    });
    
    // 当模块被替换时，清理旧的样式
    import.meta.hot.dispose(() => {
        const existingStyle = document.querySelector(\`style[data-vite-dev-id="\${moduleId}"]\`);
        if (existingStyle) {
            existingStyle.remove();
        }
    });
}

export default cssStr;
            `.trim();
            
            return {
                code: cssModule,
                map: null,
            }
        }
    }
}