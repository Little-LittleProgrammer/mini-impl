// node.js 中简单的 HTTP 服务器框架，koa\express 也是基于这个开发的
import connect from 'connect'
// [控制台输出]提供美观且可定义的颜色方案
import colors from 'picocolors'
// 用于读取文件
import { readFileSync } from 'node:fs'
import { optimizeDeps } from '../optimizer'

const { version } = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url)).toString()
)

const port = 3001

export async function startDevServer() {
    const app = connect()
    const startTime = Date.now()

    app.listen(port, async () => {
        await optimizeDeps({
            root: process.cwd()
        })
        console.log(colors.green(`[vite] 🚀 Hello，vite 开发服务器启动成功 🚀`))
        console.log(
            colors.cyan(`[vite] 本地访问地址: http://localhost:${port}`)
        )

        const startupDurationString = startTime
            ? colors.dim(
                  `ready in ${colors.reset(
                      colors.bold(Math.ceil(Date.now() - startTime))
                  )} ms`
              )
            : ''

        console.log(
            `\n  ${colors.green(`${colors.bold('MINI-VITE')} v${version}`)}  ${startupDurationString}\n`
        )
        console.log(
            `  ${colors.green('➜')}  ${colors.bold('Local')}:   ${colors.blue(
                `http://localhost:${port}`
            )}`
        )
    })
}
