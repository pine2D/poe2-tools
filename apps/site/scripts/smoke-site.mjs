// 只验证本次不可变部署地址，避免 DNS 或旧缓存掩盖错误。
// 用法：node apps/site/scripts/smoke-site.mjs <base>，或 --deployment-log <日志文件>
import { readFile } from 'node:fs/promises'
// 部署工作流（.github/workflows/deploy.yml）只下载产物、不装依赖，这里不能经 workspace 包名导入；compliance.mjs 只用 Node 标准库
import { cssUrlTargets } from '../../../packages/ui-theme/scripts/compliance.mjs'

let base = process.argv[2]
if (base === '--deployment-log') {
  const log = await readFile(process.argv[3], 'utf8')
  base = log.match(/https:\/\/[a-z0-9]+\.[a-z0-9-]+\.pages\.dev\b/gi)?.at(-1)
}
if (!base) throw new Error('缺少有效的部署地址')

async function fetchStatic(path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) })
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error(`静态资源缺失：${path}（HTTP ${response.status}）`)
  }
  return response
}

const pages = [
  ['/', '少查译名'],
  ['/build/', '构筑汉化'],
  ['/extension/', '中文助手'],
  ['/craft/', '装备工坊'],
]
const fonts = new Set()
for (const [path, expected] of pages) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) })
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`)
  const html = await response.text()
  if (!html.includes(expected)) throw new Error(`${path}: 页面内容不匹配`)
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
    const asset = await fetchStatic(match[1])
    if (!match[1].endsWith('.css')) continue
    const cssUrl = new URL(match[1], base)
    for (const target of cssUrlTargets(await asset.text())) {
      if (target.endsWith('.woff2')) fonts.add(new URL(target, cssUrl).pathname)
    }
  }
}
// 字体分片、三份字体许可与 NOTICE 都要能取到（spec §8.7）；一个分片都没抓到说明 CSS 链接没识别出来，不能空转通过
if (fonts.size === 0) throw new Error('页面 CSS 里没有找到任何 .woff2 字体分片')
for (const path of fonts) await fetchStatic(path)
for (const path of [
  '/fonts/NotoSerifSC-OFL.txt',
  '/fonts/NotoSerifTC-OFL.txt',
  '/fonts/Cinzel-OFL.txt',
  '/NOTICE.txt',
]) {
  await fetchStatic(path)
}
const missing = await fetch(new URL('/__poe2_missing_page__/', base), {
  signal: AbortSignal.timeout(15000),
})
if (missing.status !== 404) throw new Error(`未知路径应返回 404，实际 ${missing.status}`)
console.log(`页面、资源、${fonts.size} 个字体分片、许可文件及 404 检查通过：${base}`)
