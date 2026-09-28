// 只验证本次不可变部署地址，避免 DNS 或旧缓存掩盖错误。
import { readFile } from 'node:fs/promises'

let base = process.argv[2]
if (base === '--deployment-log') {
  const log = await readFile(process.argv[3], 'utf8')
  base = log.match(/https:\/\/[a-z0-9]+\.[a-z0-9-]+\.pages\.dev\b/gi)?.at(-1)
}
if (!base) throw new Error('缺少有效的部署地址')
const pages = [
  ['/', '少查译名'],
  ['/build/', '构筑汉化'],
  ['/extension/', '中文助手'],
  ['/craft/', '装备工坊'],
]
for (const [path, expected] of pages) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) })
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`)
  const html = await response.text()
  if (!html.includes(expected)) throw new Error(`${path}: 页面内容不匹配`)
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
    const asset = await fetch(new URL(match[1], base), { signal: AbortSignal.timeout(15000) })
    if (!asset.ok || asset.headers.get('content-type')?.includes('text/html')) {
      throw new Error(`静态资源缺失：${match[1]}`)
    }
  }
}
const missing = await fetch(new URL('/__poe2_missing_page__/', base), {
  signal: AbortSignal.timeout(15000),
})
if (missing.status !== 404) throw new Error(`未知路径应返回 404，实际 ${missing.status}`)
console.log(`页面、资源及 404 检查通过：${base}`)
