// @vitest-environment node
// 设计规格与首页实际字号的一致性门禁：DESIGN.md 字体表里“首页 hero 标题”“首页场景标题”两行的字号与断点，
// 必须等于 home.css 页面层覆盖经 tokens.css 尺寸阶梯令牌解析后的取值；改其中一边而漏改另一边即失败。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRules, rootTokens } from '../../../../packages/ui-theme/src/testing/css'

const repo = new URL('../../../../', import.meta.url)
const read = (rel: string): string => readFileSync(new URL(rel, repo), 'utf8')

const tokens = rootTokens(read('packages/ui-theme/src/tokens.css')).tokens
const homeRules = parseRules(read('apps/site/src/shared/styles/home.css'))

/** 取某选择器在指定媒体条件下（null 为无媒体条件）的 font-size，并把 var(--fs-*) 解析成令牌取值（rem） */
function fontSize(
  rules: ReturnType<typeof parseRules>,
  selector: string,
  media: string | null,
): string | undefined {
  const rule = rules.find(
    (r) =>
      r.selectors.includes(selector) &&
      r.declarations.has('font-size') &&
      (media === null ? r.atRules.length === 0 : r.atRules.some((at) => at.includes(media))),
  )
  const value = rule?.declarations.get('font-size')
  const token = value?.match(/^var\((--fs-[\w-]+)\)$/)?.[1]
  return token ? tokens.get(token) : value
}

/** DESIGN.md 字体表中以“| <位置> |”开头的一行 */
function designRow(place: string): string {
  const row = read('DESIGN.md')
    .split('\n')
    .find((line) => line.startsWith(`| ${place} |`))
  if (!row) throw new Error(`DESIGN.md 缺少字体表行：${place}`)
  return row
}

describe('DESIGN.md 首页字号与实际流体令牌一致', () => {
  it.each([
    ['首页 hero 标题', '.home-hero .pt-hero-title', 'clamp(2.75rem, 6.4vw, 5.25rem)'],
    ['首页场景标题', '.entry__head .pt-subhead--lg', 'clamp(1.875rem, 3.4vw, 2.625rem)'],
  ])('%s', (place, selector, expected) => {
    expect(fontSize(homeRules, selector, null)).toBe(expected)
    expect(designRow(place)).toContain(expected)
  })
})
