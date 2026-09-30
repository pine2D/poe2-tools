// @vitest-environment node
// 站点 CSS 与入口 HTML 的内联样式不引用外链（spec §8.5）：url() 只能是相对路径或 data:
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { externalUrls } from '@poe2-tools/ui-theme/compliance'
import { expect, it } from 'vitest'

const HTML = [
  'apps/site/index.html',
  'apps/site/build/index.html',
  'apps/site/extension/index.html',
  'apps/site/craft/index.html',
  'apps/site/public/404.html',
]

it('apps/site/src 下全部 CSS 没有外链 url()', () => {
  const dir = 'apps/site/src'
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((name) => join(dir, name))
    .filter((path) => path.endsWith('.css') && statSync(path).isFile())
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) expect(externalUrls(readFileSync(file, 'utf8')), file).toEqual([])
})

it('四个入口 HTML 与 404 的内联样式没有外链 url()', () => {
  // 标签带属性（如 <style media="…">）也要扫到；合计至少一个样式块，防止写法一变就空转通过
  let scanned = 0
  for (const file of HTML) {
    const styles = [
      ...readFileSync(file, 'utf8').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi),
    ].map((match) => match[1] ?? '')
    scanned += styles.length
    for (const css of styles) expect(externalUrls(css), file).toEqual([])
  }
  expect(scanned).toBeGreaterThanOrEqual(1)
})
