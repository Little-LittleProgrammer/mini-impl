import { NextHandleFunction } from "connect";
import { ServerContext } from "..";
import path from "path";

import fse from "fs-extra";

/**
 * 注入HMR客户端代码到HTML中
 */
function injectHMRClient(html: string): string {
    const hmrClientScript = `
    <script type="module">
        import "/node_modules/.mini-vite/client.js";
    </script>
    `
    
    // 在head标签结束前插入HMR客户端代码
    if (html.includes('</head>')) {
        return html.replace('</head>', `  ${hmrClientScript}\n</head>`)
    }
    
    // 如果没有head标签，在body开始后插入
    if (html.includes('<body>')) {
        return html.replace('<body>', `<body>\n  ${hmrClientScript}`)
    }
    
    // 如果既没有head也没有body，在html开始后插入
    return html.replace(/<html[^>]*>/, `$&\n  ${hmrClientScript}`)
}

/**
 * 对HTML进行处理转换的中间件
 * @param serverContext 
 * @returns 
 */
export function indexHtmlMiddleware(serverContext: ServerContext): NextHandleFunction {
    return async (req, res, next) => {
        if (req.url === '/') {
            //  取出开发服务器上下文的 root 作为项目根目录
            const {root} = serverContext;
            // Vite创建的项目默认使用项目根目录下的 index.html
            const indexHtmlPath = path.join(root, "index.html");
            // 判断是否存在
            if (await fse.pathExists(indexHtmlPath)) {
                const rawHtml = await fse.readFile(indexHtmlPath, "utf-8");
                let html = rawHtml;
                
                // 注入HMR客户端代码
                html = injectHMRClient(html);
                
                // 执行用户提供 or Vite内置的插件中 transformIndexHtml 方法来对 HTML 进行自定义的修改/替换
                for (const plugin of serverContext.plugins) {
                    if (plugin.transformIndexHtml) {
                        html = await plugin.transformIndexHtml(html);
                    }
                }
                res.statusCode = 200;
                // 将转换后的 HTML 发送给浏览器
                res.setHeader("Content-Type", "text/html");
                return res.end(html);
            }
        }
        return next();
    }
}