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

it('标题、标签、按钮的静态与动态文案均由独立 popup 字体覆盖', async () => {
  const shard = coverage.shards.find((s) => s.file === 'serif-sc-popup.woff2')
  expect(shard?.group).toBe('sc-popup')
  const chars = new Set(shard?.chars ?? '')
  const serif = [
    ...html.matchAll(
      /<(?:h1|h2|span|button)\b[^>]*class="(?:titlebar__title|popup-heading|setting__label|pt-btn[^"<>]*)"[^>]*>([^<]*)<\/(?:h1|h2|span|button)>/g,
    ),
  ].map((m) => m[1])
  expect(serif).toEqual([
    'PoE2 中文助手',
    'CoE 中文显示',
    '刷新页面',
    '启用简体中文',
    '显示中英对照',
    '重试读取',
    '网页翻译',
    '翻译此页',
    '启用本页划词',
  ])
  const dynamic = ['关闭本页划词', '无法打开侧边栏，请更新 Chrome']
  const controls = await Promise.all(
    ['selection-button.ts', 'guide-button.ts'].map((file) =>
      readFile(new URL(`../src/popup/${file}`, import.meta.url), 'utf8'),
    ),
  )
  for (const text of dynamic) expect(controls.join('\n')).toContain(text)
  const text = [...serif, ...dynamic]
  for (const value of text)
    for (const ch of value.replace(/\s/g, '')) expect(chars.has(ch), ch).toBe(true)
  const popupText = await readFile(
    new URL('../../../packages/ui-theme/scripts/popup-text.txt', import.meta.url),
    'utf8',
  )
  const entries = popupText
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
  expect(entries).toEqual(text)
})

it('衬线限标题、分组、设置标签与按钮；长说明保留无衬线', () => {
  const serifSelectors = parseRules(css)
    .filter((r) =>
      /var\(--pt-serif/.test(r.declarations.get('font') ?? r.declarations.get('font-family') ?? ''),
    )
    .flatMap((r) => r.selectors)
  expect(serifSelectors).toEqual([
    '.titlebar__title',
    '.popup-heading',
    '.setting__label',
    '.pt-btn',
  ])
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

it('根节点给出 360×600 自然尺寸，正文在较矮视口内滚动；不用视口单位决定窗口宽度', () => {
  const body = parseRules(css).findLast((r) => r.selectors.includes('body'))
  const root = parseRules(css).findLast((r) => r.selectors.includes(':root'))
  expect(root?.declarations.get('width')).toBe('360px')
  expect(root?.declarations.get('height')).toBe('600px')
  expect(root?.declarations.has('max-height')).toBe(false)
  expect(root?.declarations.get('overflow')).toBe('hidden')
  expect(root?.declarations.get('scrollbar-width')).toBe('none')
  expect(body?.declarations.get('width')).toBe('100%')
  expect(body?.declarations.get('height')).toBe('100%')
  expect(body?.declarations.get('max-height')).toBe('100vh')
  expect(body?.declarations.get('overflow-y')).toBe('auto')
  for (const rule of parseRules(css))
    for (const prop of ['width', 'min-width', 'max-width'])
      expect(rule.declarations.get(prop) ?? '').not.toMatch(/\d(?:d|s|l)?v(?:w|h|i|b|min|max)\b/)
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

// ---- 0.10.1：网页翻译与 CoE 中文显示分别命名 ----
it('网页翻译与 CoE 中文显示独立分组，状态块和开关归于 CoE', () => {
  const main = html.slice(html.indexOf('<main>') + '<main>'.length, html.indexOf('</main>'))
  expect(main).toContain('<section aria-labelledby="reading-heading">')
  expect(main).toContain('<section aria-labelledby="coe-heading">')
  const groupStyle = parseRules(css).findLast((r) => r.selectors.includes('.popup-heading'))
  expect(groupStyle?.declarations.get('font')).toContain('var(--pt-serif)')
  const order = [
    'id="coe-heading"',
    'id="page"',
    'id="enabled"',
    'id="bilingual"',
    'id="status"',
    'id="retry"',
    'class="pt-divider popup-divider"',
    'id="reading-heading"',
    'id="translate"',
    'id="guide-notice"',
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
  expect(html.match(/<h2\b/g)).toHaveLength(2)
  expect(css.replace(/\s+/g, '')).toContain('.page__action[hidden]{display:none')
})

it('主操作仅翻译此页使用钢蓝，其余保留次操作入口', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*class="([^"]*)"/g)].map((m) => m[1])
  expect(buttons).toHaveLength(4)
  expect(buttons.filter((cls) => cls.includes('pt-btn--primary'))).toHaveLength(1)
  expect(buttons.filter((cls) => cls.includes('pt-btn--quiet'))).toHaveLength(3)
  expect(html).not.toContain('pt-motif--logo')
  expect(html).not.toContain('pt-motif--knot')
})

it('翻译此页按钮与一次性说明默认隐藏；说明出现后仍默认折叠', () => {
  const translate = html.match(/<button[^>]*id="translate"[^>]*>/)?.[0] ?? ''
  expect(translate).toContain('class="pt-btn pt-btn--primary translate"')
  expect(translate).toMatch(/\shidden[\s>]/)
  expect(html).toMatch(/<details id="guide-notice"[^>]*\shidden[\s>]/)
  expect(html.match(/<details id="guide-notice"[^>]*>/)?.[0]).not.toMatch(/\sopen[\s>]/)
  const rules = parseRules(css)
  for (const selector of ['.translate[hidden]', '.guide-notice[hidden]']) {
    const rule = rules.find((r) => r.selectors.includes(selector))
    expect(rule?.declarations.get('display')).toBe('none')
  }
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
