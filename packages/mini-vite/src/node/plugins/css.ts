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
            // 将css样式代码转成style标签并塞到页面的head下，达成样式引入的目的
            const cssModule = `
const cssStr = "${code.replace(/\n/g, "")}";
const style = document.createElement("style");
style.setAttribute("type", "text/css");
style.setAttribute("data-vite-dev-id", "${id}");
style.innerHTML = cssStr;
document.head.appendChild(style);
export default cssStr;
            `.trim();
            return {
                code: cssModule,
                map: null,
            }
        }
    }
}