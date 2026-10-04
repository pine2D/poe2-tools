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

it('衬线文案只剩标题，全部在弹窗独立子集里，popup-text.txt 只收它（扩展 0.4.0）', async () => {
  const shard = coverage.shards.find((s) => s.file === 'serif-sc-popup.woff2')
  expect(shard?.group).toBe('sc-popup')
  const chars = new Set(shard?.chars ?? '')
  const serif = [...html.matchAll(/<(h1|h2|h3)\b[^>]*>([^<]*)<\/\1>/g)].map((m) => m[2])
  expect(serif).toEqual(['PoE2 中文助手'])
  for (const text of serif)
    for (const ch of text.replace(/\s/g, '')) expect(chars.has(ch), ch).toBe(true)
  const popupText = await readFile(
    new URL('../../../packages/ui-theme/scripts/popup-text.txt', import.meta.url),
    'utf8',
  )
  const entries = popupText
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
  expect(entries).toEqual(serif)
  for (const ch of '使用前') expect(chars.has(ch), ch).toBe(false)
})

it('弹窗样式里用衬线的只有标题：状态块与按钮不用衬线（新增衬线位置须同步 popup-text.txt）', () => {
  const serifSelectors = parseRules(css)
    .filter((r) =>
      /var\(--pt-serif/.test(r.declarations.get('font') ?? r.declarations.get('font-family') ?? ''),
    )
    .flatMap((r) => r.selectors)
  expect(serifSelectors).toEqual(['.titlebar__title'])
})

it('去掉副标题、“使用前”框、左侧色条与 ✓ 字形（第三期 A）', () => {
  expect(html).not.toContain('适用于 Craft of Exile 新版')
  expect(html).not.toContain('使用前')
  expect(html).not.toMatch(/class="(?:subtitle|before)"/)
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  expect(code).not.toMatch(/\.before\b|\.subtitle\b/)
  expect(code).not.toMatch(/content:\s*"[✓!]"/)
  expect(code).not.toMatch(/left\s*\/\s*2px\s+100%/)
})

it('页脚恰为两段：版本与检查更新；宝石母题、完整声明与版权句（第三期 A）', () => {
  const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'))
  expect(footer.match(/<p\b/g)).toHaveLength(2)
  const order = [
    'id="version"',
    'id="check-update"',
    'pt-motif--gem',
    FULL_DISCLAIMER,
    '游戏文本版权归各权利方所有。',
  ]
  const at = order.map((s) => footer.indexOf(s))
  expect(at.every((i) => i >= 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
  expect(footer).toContain(`${FULL_DISCLAIMER}游戏文本版权归各权利方所有。</p>`)
  expect(footer).not.toContain('PoE2 中文助手 · 非官方')
  expect(footer).not.toContain('pt-provenance')
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

// ---- 第三期 A「状态置顶」（方向约定 apps-poe2-extension-src-popup.md） ----
it('标题栏下第一块是状态块 #page，随后依次是菱结分隔、两个开关、设置提示行与“重试读取”', () => {
  const main = html.slice(html.indexOf('<main>') + '<main>'.length, html.indexOf('</main>'))
  expect(main.trimStart().startsWith('<div id="page"')).toBe(true)
  const order = [
    'id="page"',
    'class="pt-divider popup-divider"',
    'id="enabled"',
    'id="bilingual"',
    'id="status"',
    'id="retry"',
  ]
  const at = order.map((s) => main.indexOf(s))
  expect(at.every((i) => i >= 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
})

it('状态块是 polite 的 status 区域；唯一动作是默认隐藏的安静按钮“刷新页面”；图标由脚本插入', () => {
  const page = html.match(/<div id="page"[^>]*>/)?.[0] ?? ''
  expect(page).toContain('role="status"')
  expect(page).toContain('aria-live="polite"')
  const reload = html.match(/<button[^>]*id="reload"[^>]*>([^<]*)<\/button>/)
  expect(reload?.[0]).toContain('class="pt-btn pt-btn--quiet page__action"')
  expect(reload?.[0]).toContain('type="button"')
  expect(reload?.[0]).toMatch(/\shidden[\s>]/)
  expect(reload?.[1]).toBe('刷新页面')
  expect(html).not.toContain('<svg')
  expect(html).not.toMatch(/<h2\b/)
  expect(css.replace(/\s+/g, '')).toContain('.page__action[hidden]{display:none')
})

it('同屏金属重点只有标题栏：弹窗里的按钮都是安静按钮', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*class="([^"]*)"/g)].map((m) => m[1])
  expect(buttons).toHaveLength(2)
  for (const cls of buttons) expect(cls).toMatch(/\bpt-btn pt-btn--quiet\b/)
})

it('状态图标颜色：生效中 --ok、部分生效 --miss、未生效 --danger、已关闭 --ink-2、读取中 --ink-3（形状另行区分）', () => {
  const rules = parseRules(css)
  const color = (selector) =>
    rules.findLast((r) => r.selectors.includes(selector))?.declarations.get('color')
  expect(color('.page[data-kind="ok"] .page__icon')).toBe('var(--ok)')
  expect(color('.page[data-kind="part"] .page__icon')).toBe('var(--miss)')
  expect(color('.page[data-kind="off"] .page__icon')).toBe('var(--danger)')
  expect(color('.page[data-kind="mute"] .page__icon')).toBe('var(--ink-2)')
  expect(color('.page__icon')).toBe('var(--ink-3)')
  expect(color('.page[data-kind="reading"] .page__hint')).toBe('var(--ink-3)')
})

it('设置提示行平时不占高度：不设 min-height，只在有字时留上距；不再有 ok／off 语气', () => {
  const rules = parseRules(css)
  expect(
    rules.findLast((r) => r.selectors.includes('#status'))?.declarations.has('min-height'),
  ).toBe(false)
  expect(rules.some((r) => r.selectors.includes('#status:not(:empty)'))).toBe(true)
  expect(css).not.toMatch(/data-tone="(?:ok|off)"/)
  expect(html).toMatch(/<p id="status"[^>]*data-tone="idle"[^>]*><\/p>/)
})
