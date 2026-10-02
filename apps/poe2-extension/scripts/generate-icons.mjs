// 扩展图标生成（spec §6.10）：用本机无头 Chrome 渲染母题 gem 符号（核心菱环 + 扩展青宝石），
// 16、32、48、128 各自渲染，不从大图缩小；图形占画布 88%，居中，透明底。
// 只手动运行，不进 verify；生成的 PNG 入库，SHA-256 登记在 docs/data-sources.md“素材白名单（第 3 类）”。
// 用法：CHROME_PATH=<本机 Chrome> node apps/poe2-extension/scripts/generate-icons.mjs
// 不需要 Python，也不新增依赖：经 Chrome DevTools 协议（Node 内置 WebSocket）截图。
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { renderExtGemSvg } from '../../../packages/ui-theme/src/motif-css.ts'

export const ICON_SIZES = [16, 32, 48, 128]

/** 单个尺寸的渲染页：gem 占 88%，居中，透明底 */
export function iconPage(svg, size) {
  const inner = Number((size * 0.88).toFixed(2))
  const offset = Number(((size - inner) / 2).toFixed(2))
  const sized = svg.replace(
    '<svg ',
    `<svg width="${inner}" height="${inner}" style="position:absolute;left:${offset}px;top:${offset}px" `,
  )
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}</style></head><body>${sized}</body></html>`
}

/** 结束 Chrome 并等它退出后再删临时配置目录，否则 Chrome 退出时仍在写盘，rm 会报 ENOTEMPTY */
async function shutdown(child, profile) {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit')
    child.kill()
    await exited
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

async function launch(chrome) {
  const profile = await mkdtemp(path.join(tmpdir(), 'poe2-icons-'))
  const child = spawn(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  for (let i = 0; i < 100; i += 1) {
    try {
      const [port, wsPath] = (
        await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
      ).split('\n')
      if (port && wsPath) return { child, profile, endpoint: `ws://127.0.0.1:${port}${wsPath}` }
    } catch {
      // 端口文件还没写出，稍后再读
    }
    await delay(100)
  }
  await shutdown(child, profile)
  throw new Error('无头 Chrome 未启动：检查 CHROME_PATH')
}

function connect(endpoint) {
  const socket = new WebSocket(endpoint)
  const pending = new Map()
  let id = 0
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(message.error.message))
    else waiter.resolve(message.result)
  })
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      id += 1
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  return { ready, send, close: () => socket.close() }
}

async function render(cdp, html, size) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const page = (method, params) => cdp.send(method, params, sessionId)
  await page('Emulation.setDeviceMetricsOverride', {
    width: size,
    height: size,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await page('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  await page('Page.navigate', {
    url: `data:text/html;base64,${Buffer.from(html).toString('base64')}`,
  })
  for (let i = 0; i < 50; i += 1) {
    const { result } = await page('Runtime.evaluate', { expression: 'document.readyState' })
    if (result.value === 'complete') break
    await delay(50)
  }
  const { data } = await page('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
  })
  await cdp.send('Target.closeTarget', { targetId })
  return Buffer.from(data, 'base64')
}

async function main() {
  const chrome = process.env.CHROME_PATH
  if (!chrome) throw new Error('请用环境变量 CHROME_PATH 指定本机 Chrome')
  const out = fileURLToPath(new URL('../public/icons/', import.meta.url))
  const { child, profile, endpoint } = await launch(chrome)
  const cdp = connect(endpoint)
  try {
    await cdp.ready
    const svg = renderExtGemSvg()
    for (const size of ICON_SIZES) {
      const png = await render(cdp, iconPage(svg, size), size)
      await writeFile(path.join(out, `icon-${size}.png`), png)
      console.log(`icon-${size}.png\t${png.length}`)
    }
  } finally {
    cdp.close()
    await shutdown(child, profile)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main()
