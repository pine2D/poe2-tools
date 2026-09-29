// ui-theme 的 CSS 不引用任何外链（spec §8.5）：url() 只能是相对路径或 data:
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { externalUrls } from '../scripts/compliance.mjs'

const srcDir = fileURLToPath(new URL('./', import.meta.url))

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.css'))
    .map((name) => `${dir}${name}`)
}

it('src/**/*.css 没有外链 url()', () => {
  const files = cssFiles(srcDir)
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) expect(externalUrls(readFileSync(file, 'utf8')), file).toEqual([])
})
