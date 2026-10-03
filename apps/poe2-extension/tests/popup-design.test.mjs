// @vitest-environment node
// 弹窗结构与文案（spec §6.8、§5.14、B.12 修订 2–4）
import { readFile } from 'node:fs/promises'
import { FULL_DISCLAIMER } from '@poe2-tools/ui-theme/compliance'
import { expect, it } from 'vitest'
import { parseRules } from '../../../packages/ui-theme/src/testing/css.ts'
import * as provenance from '../src/provenance.ts'

const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/popup/popup.css', import.meta.url), 'utf8')
const coverage = JSON.parse(
  await readFile(
    new URL('../../../packages/ui-theme/fonts/coverage.json', import.meta.url),
    'utf8',
  ),
)

it('署名常量与网站完整声明一字不差', () => {
  expect(provenance.FULL_DISCLAIMER).toBe(FULL_DISCLAIMER)
  expect(provenance.SHORT_PROVENANCE).toBe('PoE2 中文助手 · 非官方')
})

it('衬线文案（标题、使用前）全部在 SC shard0 里', () => {
  const shard0 = new Set(coverage.shards.find((s) => s.file === 'serif-sc-0.woff2').chars)
  const serif = [...html.matchAll(/<(h1|h2)\b[^>]*>([^<]*)<\/\1>/g)].map((m) => m[2])
  expect(serif).toEqual(['PoE2 中文助手', '使用前'])
  for (const text of serif)
    for (const ch of text.replace(/\s/g, '')) expect(shard0.has(ch), ch).toBe(true)
})

it('副标题改写为“适用于 Craft of Exile 新版”', () => {
  expect(html).toContain('>适用于 Craft of Exile 新版<')
})

it('页脚依次是：版本与检查更新、短署名、完整声明、版权句', () => {
  const footer = html.slice(html.indexOf('<footer'))
  const order = [
    'id="version"',
    'id="check-update"',
    'PoE2 中文助手 · 非官方',
    FULL_DISCLAIMER,
    '游戏文本版权归各权利方所有。',
  ]
  const at = order.map((s) => footer.indexOf(s))
  expect(at.every((i) => i >= 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
})

it('两个开关是 role=switch 的 checkbox，右侧状态文字 aria-hidden', () => {
  for (const id of ['enabled', 'bilingual']) {
    expect(html).toMatch(new RegExp(`<input[^>]*id="${id}"[^>]*>`))
    const input = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0]
    expect(input).toContain('role="switch"')
    expect(input).toContain('class="pt-switch"')
    expect(html).toMatch(new RegExp(`<span[^>]*id="${id}-state"[^>]*aria-hidden="true"`))
  }
})

it('弹窗不套 pt-frame、没有 pt-forge-btn（spec §4.2 白名单）', () => {
  expect(html).not.toMatch(/pt-frame|pt-forge-btn/)
})

it('弹窗定宽 340px，不用视口单位限宽（工具栏弹窗的视口随内容变化，用 100vw 会停在初始的 240px）', () => {
  const body = parseRules(css).findLast((r) => r.selectors.includes('body'))
  expect(body?.declarations.get('width')).toBe('340px')
  expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\d(?:d|s|l)?v(?:w|h|i|b|min|max)\b/)
})

it('“重试读取”在 hidden 时不被 pt-btn 的 display 覆盖', () => {
  expect(css.replace(/\s+/g, '')).toContain('.retry[hidden]{display:none')
})

it('弹窗样式只引入 ui-theme 的令牌、母题、所需组件与 popup 字体', () => {
  const imports = [...css.matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1])
  expect(imports).toEqual([
    '@poe2-tools/ui-theme/tokens.css',
    '@poe2-tools/ui-theme/motif.css',
    '@poe2-tools/ui-theme/components/motif.css',
    '@poe2-tools/ui-theme/components/divider.css',
    '@poe2-tools/ui-theme/components/btn.css',
    '@poe2-tools/ui-theme/components/switch.css',
    '@poe2-tools/ui-theme/components/provenance.css',
    '@poe2-tools/ui-theme/popup-fonts.css',
  ])
  expect(css).not.toMatch(/#192330|#223142|#42566d|#a7d7fa/)
})

it('开关禁用时右侧状态文字也降到 --ink-3（B.12 修订 3）', () => {
  const rule = parseRules(css).findLast((r) =>
    r.selectors.includes('.setting:has(.pt-switch:disabled) .pt-switch__state'),
  )
  expect(rule?.declarations.get('color')).toBe('var(--ink-3)')
})
