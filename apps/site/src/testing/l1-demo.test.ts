// @vitest-environment node
// 首页对照带右段与扩展介绍页“确认生效”共用的搜索候选示意（shared/styles/l1-demo.css）。
// 自绘示意：结构同 packages/ui-theme/src/l1.css 的 search 宿主，颜色取站点令牌；页面层只做放大行与排版上的调整。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRules } from '../../../../packages/ui-theme/src/testing/css'

const repo = new URL('../../../../', import.meta.url)
const read = (rel: string): string => readFileSync(new URL(rel, repo), 'utf8')
/** 引入 l1-demo.css 的页面入口与该页自己的样式：都要在 site.css 之后、本页样式之前引入 */
const ENTRIES: readonly (readonly [entry: string, page: string])[] = [
  ['apps/site/src/pages/home/main.tsx', 'home.css'],
  ['apps/site/src/pages/extension/main.tsx', 'extension.css'],
]

describe('l1-demo.css（首页与扩展介绍页共用的搜索候选示意）', () => {
  const css = read('apps/site/src/shared/styles/l1-demo.css')
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = parseRules(css)
  const norm = (value: string | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const forced = (atRules: readonly string[]): boolean =>
    atRules.some((at) => at.replace(/\s+/g, '').includes('forced-colors:active'))
  /** 某选择器在顶层（不在任何 @media 里）的全部声明 */
  function top(selector: string): Map<string, string> {
    const merged = new Map<string, string>()
    for (const rule of rules) {
      if (rule.atRules.length > 0 || !rule.selectors.map(norm).includes(selector)) continue
      for (const [name, value] of rule.declarations) merged.set(name, norm(value))
    }
    return merged
  }

  it('每条选择器都以 .l1demo__ 类开头，不碰页面类与裸元素', () => {
    for (const rule of rules) {
      for (const selector of rule.selectors)
        expect(norm(selector), selector).toMatch(/^\.l1demo__[a-z]/)
    }
  })

  it('候选框取站点令牌：底色 --frame-bg、边框 --metal-line；整框不画投影，只有拆段的框底画', () => {
    const box = top('.l1demo__box')
    expect(box.get('background')).toBe('var(--frame-bg)')
    expect(box.get('border')).toBe('1px solid var(--metal-line)')
    expect(box.has('box-shadow')).toBe(false)
    expect(top('.l1demo__box--bottom').get('box-shadow')).toBe(
      '0 8px 24px color-mix(in srgb, var(--well) 70%, transparent)',
    )
  })

  it('选中项只靠类名 .l1demo__opt--selected 表示外观，不放大字号，也不写 ARIA 状态或 data 属性', () => {
    const selected = top('.l1demo__opt--selected')
    expect(selected.get('outline')).toBe('2px solid var(--focus)')
    expect(selected.has('font-size')).toBe(false)
    expect(bare).not.toMatch(/aria-(selected|expanded)|data-selected/)
  })

  it('字号只用 --fs-* 令牌；margin、padding、gap 不写 px、em、rem', () => {
    for (const rule of rules) {
      for (const [name, value] of rule.declarations) {
        const where = `${rule.selectors.join(', ')} { ${name}: ${value} }`
        if (name === 'font-size') expect(norm(value), where).toMatch(/^var\(--fs-[a-z-]+\)$/)
        if (/^(margin|padding|gap|row-gap|column-gap)(-|$)/.test(name)) {
          expect(value, where).not.toMatch(/\d(px|r?em)\b/)
        }
      }
    }
  })

  it('不写字面颜色、衬线字体栈、z-index 与 url()；搜索框图标在强制色彩下改为 inherit', () => {
    expect(bare).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(bare).not.toMatch(/\b(rgba?|hsla?)\(/)
    expect(bare).not.toMatch(/--pt-(serif|cinzel)|font-family/)
    expect(bare).not.toMatch(/z-index|url\(/)
    const reset = rules.find(
      (rule) => forced(rule.atRules) && rule.selectors.map(norm).includes('.l1demo__field .icon'),
    )
    expect(reset?.declarations.get('color')).toBe('inherit')
  })

  it('页面入口在 site.css 之后、本页样式之前引入 l1-demo.css', () => {
    for (const [entry, page] of ENTRIES) {
      const text = read(entry)
      const site = text.indexOf("import '../../shared/styles/site.css'")
      const demo = text.indexOf("import '../../shared/styles/l1-demo.css'")
      const own = text.indexOf(`import '../../shared/styles/${page}'`)
      expect(site, entry).toBeGreaterThanOrEqual(0)
      expect(demo, entry).toBeGreaterThan(site)
      expect(own, entry).toBeGreaterThan(demo)
    }
  })
})
