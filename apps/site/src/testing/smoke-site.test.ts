// @vitest-environment node
// 部署冒烟脚本（spec §8.7）：用本机 HTTP 服务模拟一次部署，以子进程直接运行 smoke-site.mjs
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'

const run = promisify(execFile)
const SCRIPT = fileURLToPath(new URL('../../scripts/smoke-site.mjs', import.meta.url))

const PAGES = {
  '/': '少查译名',
  '/build/': '构筑汉化',
  '/extension/': '中文助手',
  '/craft/': '装备工坊',
}
const TEXT_FILES = [
  '/fonts/NotoSerifSC-OFL.txt',
  '/fonts/NotoSerifTC-OFL.txt',
  '/fonts/Cinzel-OFL.txt',
  '/NOTICE.txt',
]

const ZIP = Buffer.from('PK fake extension zip')
const RELEASE = {
  version: '9.9.9',
  file: 'poe2-extension-9.9.9.zip',
  bytes: ZIP.length,
  sha256: createHash('sha256').update(ZIP).digest('hex'),
  date: '2026-10-02',
}
let releaseDir = ''
let releaseJson = ''
beforeAll(async () => {
  releaseDir = await mkdtemp(join(tmpdir(), 'poe2-smoke-release-'))
  releaseJson = join(releaseDir, 'release.json')
  await writeFile(releaseJson, JSON.stringify(RELEASE))
})
afterAll(async () => {
  await rm(releaseDir, { recursive: true, force: true })
})
// 以子进程运行冒烟脚本；release.json 指向本测试的临时文件
function smoke(base: string) {
  return run(process.execPath, [SCRIPT, base], {
    env: { ...process.env, EXTENSION_RELEASE_JSON: releaseJson },
  })
}

let server: Server | undefined

afterEach(async () => {
  await new Promise((done) => server?.close(done) ?? done(undefined))
  server = undefined
})

// 四个页面都用 cssLink 引用样式；样式里有一个字体分片；许可文件、NOTICE 与扩展 zip 齐全；其余路径 404
async function serve(cssLink: string, zip: Buffer | null = ZIP): Promise<string> {
  const files = new Map<string, [string, string | Buffer]>()
  for (const [path, text] of Object.entries(PAGES)) {
    files.set(path, ['text/html', `<html><head>${cssLink}</head><body>${text}</body></html>`])
  }
  files.set('/assets/site.css', [
    'text/css',
    '@font-face{src:url(./serif-sc-0-Ab12.woff2) format("woff2")}',
  ])
  files.set('/assets/serif-sc-0-Ab12.woff2', ['font/woff2', 'wOF2'])
  for (const path of TEXT_FILES) files.set(path, ['text/plain', 'x'])
  if (zip) files.set(`/downloads/${RELEASE.file}`, ['application/zip', zip])
  server = createServer((request, response) => {
    const hit = files.get(new URL(request.url ?? '/', 'http://localhost').pathname)
    response.writeHead(hit ? 200 : 404, { 'content-type': hit?.[0] ?? 'text/plain' })
    response.end(hit?.[1] ?? 'not found')
  })
  const listening = server
  await new Promise<void>((done) => listening.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${(listening.address() as AddressInfo).port}/`
}

it('页面 CSS 里的字体分片、许可文件与 404 都能取到时通过', async () => {
  const base = await serve('<link rel="stylesheet" href="/assets/site.css">')
  const { stdout } = await smoke(base)
  expect(stdout).toContain('1 个字体分片')
  expect(stdout).toContain('扩展下载（poe2-extension-9.9.9.zip）')
})

it('没抓到任何字体分片时拒绝，不再输出“0 个字体分片”照样通过', async () => {
  // 样式链接改成相对写法，脚本的 /assets/ 正则抓不到 CSS，字体集合为空
  const base = await serve('<link rel="stylesheet" href="assets/site.css">')
  await expect(smoke(base)).rejects.toMatchObject({
    stderr: expect.stringContaining('页面 CSS 里没有找到任何 .woff2 字体分片'),
  })
})

it('扩展下载缺失或与 release.json 不一致时拒绝', async () => {
  const link = '<link rel="stylesheet" href="/assets/site.css">'
  const missing = await serve(link, null)
  await expect(smoke(missing)).rejects.toMatchObject({
    stderr: expect.stringContaining('静态资源缺失：/downloads/poe2-extension-9.9.9.zip'),
  })
  await new Promise((done) => server?.close(done) ?? done(undefined))
  const changed = await serve(link, Buffer.from('PK fake extension zip!'))
  await expect(smoke(changed)).rejects.toMatchObject({
    stderr: expect.stringContaining('扩展下载与 release.json 不一致'),
  })
})
