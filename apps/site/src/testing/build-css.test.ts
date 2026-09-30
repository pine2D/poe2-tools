// @vitest-environment node
// 构筑页页面样式与 ui-theme 组件样式的结构门禁（spec §4.5、§6.4.2、§6.7；契约 §7.3）。
// 页面样式按 main.tsx 的引入顺序拼接后解析，“最终取值”取后写的一条（与层叠顺序一致）。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type CssRule, parseRules } from '../../../../packages/ui-theme/src/testing/css'

const repo = new URL('../../../../', import.meta.url)
const read = (rel: string): string => readFileSync(new URL(rel, repo), 'utf8')
/** 构筑页页面样式，顺序同 features/build-l10n/main.tsx */
const BUILD_STYLES = [
  'controls',
  'layout',
  'sidebar',
  'empty',
  'overview',
  'cards',
  'table',
  'responsive',
  'a11y',
] as const
const buildCss = (): readonly CssRule[] =>
  parseRules(BUILD_STYLES.map((name) => read(`apps/site/src/shared/styles/${name}.css`)).join('\n'))
const norm = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase()
const flat = (value: string): string => value.replace(/\s+/g, '').toLowerCase()

function rulesFor(rules: readonly CssRule[], selector: string, media?: string): CssRule[] {
  const want = flat(selector)
  return rules.filter((rule) => {
    const hit =
      rule.selectors.some((item) => flat(item) === want) || flat(rule.selectors.join(',')) === want
    if (!hit) return false
    if (media === undefined) return rule.atRules.length === 0
    return rule.atRules.some((at) => flat(at).includes(flat(media)))
  })
}
function finalValue(
  rules: readonly CssRule[],
  selector: string,
  prop: string,
  media?: string,
): string {
  const values = rulesFor(rules, selector, media).flatMap((rule) => {
    const value = rule.declarations.get(prop)
    return value === undefined ? [] : [value]
  })
  const last = values.at(-1)
  if (last === undefined) {
    throw new Error(`${selector} 缺少 ${prop}${media === undefined ? '' : `（${media}）`}`)
  }
  return norm(last)
}
/** padding 简写展开为 [上, 右, 下, 左] */
function box(value: string): [string, string, string, string] {
  const parts = value.split(' ')
  const [top = '0', right = top, bottom = top, left = right] = parts
  return [top, right, bottom, left]
}
const px = (value: string): number => {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value)
  if (match === null) throw new Error(`不是 px 值：${value}`)
  return Number(match[1])
}

describe('构筑页主区与侧栏留白（spec §4.5、§6.4.2）', () => {
  const rules = buildCss()
  it('--main-pad-top 三档：桌面 22px、≤1099px 24px、≤600px 20px', () => {
    expect(finalValue(rules, '.app__main', '--main-pad-top')).toBe('22px')
    expect(finalValue(rules, '.app__main', '--main-pad-top', 'max-width: 1099px')).toBe('24px')
    expect(finalValue(rules, '.app__main', '--main-pad-top', 'max-width: 600px')).toBe('20px')
  })
  it('主区上内边距就是 --main-pad-top，左右内边距不小于角饰外伸（桌面 12px，≤620px 9px）', () => {
    for (const [media, least] of [
      [undefined, 12],
      ['max-width: 1099px', 12],
      ['max-width: 600px', 9],
    ] as const) {
      const [top, right, , left] = box(finalValue(rules, '.app__main', 'padding', media))
      expect(top).toBe('var(--main-pad-top)')
      expect(px(right)).toBeGreaterThanOrEqual(least)
      expect(px(left)).toBeGreaterThanOrEqual(least)
    }
  })
  it('侧栏内边距 22px 12px 22px 22px，四边都不小于角饰外伸 12px', () => {
    const sides = box(finalValue(rules, '.app__side', 'padding'))
    expect(sides).toEqual(['22px', '12px', '22px', '22px'])
    for (const side of sides) expect(px(side)).toBeGreaterThanOrEqual(12)
  })
  it('词典失败且没有文件：ErrorCard 与下方“导入 .build”框同宽 820px 居中，左缘对齐', () => {
    expect(finalValue(rules, '.app__import', 'max-width')).toBe('820px')
    expect(finalValue(rules, '.app__main:only-child > .app__error', 'max-width')).toBe('820px')
    expect(finalValue(rules, '.app__main:only-child > .app__error', 'margin-inline')).toBe('auto')
  })
})

describe('吸顶页签行（spec §6.4.2）', () => {
  const tabs = parseRules(read('packages/ui-theme/src/components/tabs.css'))
  it('.pt-tabs-row--sticky：top -1px、z-index 2、底色与遮挡阴影为 --frame-bg', () => {
    expect(finalValue(tabs, '.pt-tabs-row--sticky', 'position')).toBe('sticky')
    expect(finalValue(tabs, '.pt-tabs-row--sticky', 'top')).toBe('-1px')
    expect(finalValue(tabs, '.pt-tabs-row--sticky', 'z-index')).toBe('2')
    expect(finalValue(tabs, '.pt-tabs-row--sticky', 'background')).toBe('var(--frame-bg)')
    expect(finalValue(tabs, '.pt-tabs-row--sticky', 'box-shadow')).toBe('0 12px 0 var(--frame-bg)')
  })
})
