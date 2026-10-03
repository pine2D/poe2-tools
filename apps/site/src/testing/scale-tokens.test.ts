// @vitest-environment node
// 页面层尺寸阶梯门禁（2026-10-03 方案 §3.3、第二期）：apps/site/src/shared/styles 下的字号与间距只取
// @poe2-tools/ui-theme/scale.css 的 --fs-* / --sp-* 令牌，不写 px/rem 字面值。
// 几何尺寸（图标宽、标签列宽、内容最大宽、视觉隐藏、移除按钮偏移）逐条列入 ALLOW 并写明理由；
// em、%、无单位行高、0、auto、var() 不算字面值。历史工坊（features/craft）冻结且不得引入 ui-theme，不在范围内。
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRules } from '../../../../packages/ui-theme/src/testing/css'

const repo = new URL('../../../../', import.meta.url)
const read = (rel: string): string => readFileSync(new URL(rel, repo), 'utf8')
const STYLES = 'apps/site/src/shared/styles'
const FILES = readdirSync(new URL(`${STYLES}/`, repo))
  .filter((name) => name.endsWith('.css'))
  .sort()

/** 受检属性：字号（含 font 简写）、行高、字距、外内边距、间距、定位偏移、滚动边距，以及页面层的间距变量 */
const CHECKED =
  /^(font|font-size|line-height|letter-spacing|text-indent|margin(-[a-z]+)*|padding(-[a-z]+)*|gap|row-gap|column-gap|inset(-[a-z]+)*|top|right|bottom|left|scroll-margin(-[a-z]+)*|scroll-padding(-[a-z]+)*|--main-pad-top)$/
/** px / rem 字面值（含负值与小数）；前面紧跟字母、数字、点或连字符的不算（如 --sp-2 里的 2） */
const LITERAL = /(?<![\w.-])-?(?:\d+\.?\d*|\.\d+)(?:px|rem)\b/g

/** 取出声明值里的 px/rem 字面值：env() 的回退值不算；紧跟间距令牌的 “+ 1px” 是 1px 边框补偿（几何），不算 */
function literals(value: string): string[] {
  const cleaned = value
    .replace(/env\([^)]*\)/g, '')
    .replace(/(var\(--sp-\d\))\s*\+\s*1px(?![\w.])/g, '$1')
  return (cleaned.match(LITERAL) ?? []).filter((hit) => Number.parseFloat(hit) !== 0)
}

/** 几何尺寸允许清单：键为“文件|选择器|属性”，值为该声明里允许出现的字面值。每条写理由，不用通配 */
const ALLOW: Readonly<Record<string, readonly string[]>> = {
  // 视觉隐藏的标准写法（1px 盒子外移 1px），不是间距
  'base.css|.visually-hidden|margin': ['-1px'],
  // 1280px 是内容最大宽（.app__body 的 max-width）：词典条文字与内容区左缘对齐
  'layout.css|.app__dictbar|padding-inline': ['1280px'],
  // 40px 是拖放区图标宽（DropZone.tsx 的 Icon size={40}）：正文左缘 = 图标宽 + 标题行间距
  'empty.css|.app__drop-body|margin': ['40px'],
  // 56px 是示例行标签列宽（.app__ex-line 的 grid-template-columns）：分隔线左缘 = 标签列 + 列距
  'empty.css|.app__ex-divider|margin': ['56px'],
  // ui-theme .pt-file__remove 的 right 6px 与 width 28px：紧凑文件行让出移除按钮（build-css.test 钉住整串）
  'sidebar.css|.app__files--stages .pt-file|padding': ['6px', '28px'],
}

interface Hit {
  key: string
  where: string
  found: string[]
}

function scan(): Hit[] {
  const hits: Hit[] = []
  for (const file of FILES) {
    for (const rule of parseRules(read(`${STYLES}/${file}`))) {
      for (const [prop, value] of rule.declarations) {
        if (!CHECKED.test(prop)) continue
        const found = literals(value)
        if (found.length === 0) continue
        const media = rule.atRules.length === 0 ? '' : `${rule.atRules.join(' ')} `
        for (const selector of rule.selectors) {
          hits.push({
            key: `${file}|${selector}|${prop}`,
            where: `${file} ${media}${selector} { ${prop}: ${value} }`,
            found,
          })
        }
      }
    }
  }
  return hits
}

describe('页面层尺寸阶梯门禁（方案 §3.3）', () => {
  const hits = scan()

  it('检查器自身：认出 font 简写、calc、负值与小数里的字面值，放过令牌、em、env 回退与 1px 边框补偿', () => {
    expect(literals('600 15px / 1.4 var(--font-zh-cn)')).toEqual(['15px'])
    expect(literals('calc(100% + 10px)')).toEqual(['10px'])
    expect(literals('max(var(--sp-5), calc((100% - 1280px) / 2 + var(--sp-5)))')).toEqual([
      '1280px',
    ])
    expect(literals('-1px')).toEqual(['-1px'])
    expect(literals('12.5px 1.5rem 0')).toEqual(['12.5px', '1.5rem'])
    expect(literals('calc(var(--sp-2) + var(--sp-3) + 1px)')).toEqual([])
    expect(literals('calc(var(--sp-2) + 1px) calc(var(--sp-3) + 1px)')).toEqual([])
    expect(literals('calc(6px + 1px)')).toEqual(['6px', '1px'])
    expect(literals('calc(var(--sp-5) + env(safe-area-inset-bottom, 0px))')).toEqual([])
    expect(literals('0.86em')).toEqual([])
    expect(literals('var(--main-pad-top) var(--sp-5) var(--sp-7) var(--sp-3)')).toEqual([])
    expect(CHECKED.test('padding-inline-start')).toBe(true)
    expect(CHECKED.test('--main-pad-top')).toBe(true)
    expect(CHECKED.test('min-height')).toBe(false)
    expect(CHECKED.test('border-radius')).toBe(false)
  })

  it('门禁覆盖构筑页、首页、扩展页与站点外壳的全部页面样式', () => {
    expect(FILES).toEqual(
      expect.arrayContaining([
        'a11y.css',
        'base.css',
        'cards.css',
        'controls.css',
        'empty.css',
        'extension.css',
        'home.css',
        'layout.css',
        'overview.css',
        'responsive.css',
        'sidebar.css',
        'site.css',
        'stageboard.css',
        'table.css',
      ]),
    )
  })

  it('shared/styles 的字号与间距不写 px/rem 字面值（几何项见 ALLOW）', () => {
    const bad = hits
      .filter((hit) => !hit.found.every((value) => (ALLOW[hit.key] ?? []).includes(value)))
      .map((hit) => hit.where)
    expect(bad).toEqual([])
  })

  it('ALLOW 没有失效条目：每一条都还能在对应文件里命中', () => {
    const used = new Set(hits.map((hit) => hit.key))
    expect(Object.keys(ALLOW).filter((key) => !used.has(key))).toEqual([])
  })

  it('三个页面入口都在 base.css 之前引入 scale.css（否则令牌未定义，整条声明失效）', () => {
    for (const entry of [
      'apps/site/src/pages/home/main.tsx',
      'apps/site/src/pages/extension/main.tsx',
      'apps/site/src/features/build-l10n/main.tsx',
    ]) {
      const text = read(entry)
      const scale = text.indexOf("import '@poe2-tools/ui-theme/scale.css'")
      const base = text.indexOf("import '../../shared/styles/base.css'")
      expect(scale, entry).toBeGreaterThanOrEqual(0)
      expect(base, entry).toBeGreaterThan(scale)
    }
  })
})
