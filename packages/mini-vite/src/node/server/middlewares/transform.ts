import { NextHandleFunction } from "connect";
import { ServerContext } from "..";
import { isImportRequest, isJsRequest } from "../../utils";
import { transformRequest } from "../../transformRequest";

/**
 * 处理非HTML请求的中间件
 */
export function transformMiddleware(serverContext: ServerContext): NextHandleFunction {
    return async (req,res, next) => {
        if (req.method !== 'GET' || !req.url) {
            return next();
        }
        const url = req.url;
        console.debug("transformMiddleware: %s", url);
        // 如果是js模块资源，则执行以下逻辑
        if (isJsRequest(url) || isImportRequest(url)) {
            // 编译转化
            let result = await transformRequest(url, serverContext, {
                html: req.headers.accept?.includes('text/html'),
            });
            if (!result) {
                return next();
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/javascript");
            return res.end(result.code);
        }
        return next();
    }
}