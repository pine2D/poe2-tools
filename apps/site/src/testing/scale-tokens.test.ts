// @vitest-environment node
// 页面层尺寸阶梯门禁（2026-10-03 方案 §3.3、第二期）：apps/site/src/shared/styles 下的字号与间距只取
// @poe2-tools/ui-theme 的 tokens.css 里的 --fs-* / --sp-* 令牌，不写 px/rem 字面值。
// 检查器（受检属性、字面值规则、扫描）与扩展门禁共用 packages/ui-theme/src/testing/size-gate.ts。
// home、l1-demo、extension 三个页面文件走严格档（PAGE_STRICT）：字号整值必须是 --fs-* 令牌，间距属性里 em 也算字面值。
// 几何尺寸（图标宽、标签列宽、内容最大宽、视觉隐藏、移除按钮偏移）逐条列入 ALLOW 并写明理由；
// 默认档里 em、%、无单位行高、0、auto、var() 不算字面值。历史工坊（features/craft）冻结且不得引入 ui-theme，不在范围内。
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PAGE_STRICT,
  SIZE_CHECKED,
  type SizeAllow,
  scanSizes,
  sizeLiterals,
} from '../../../../packages/ui-theme/src/testing/size-gate'

const repo = new URL('../../../../', import.meta.url)
const read = (rel: string): string => readFileSync(new URL(rel, repo), 'utf8')
const STYLES = 'apps/site/src/shared/styles'
const FILES = readdirSync(new URL(`${STYLES}/`, repo))
  .filter((name) => name.endsWith('.css'))
  .sort()

/** 严格档文件。table.css 的 .mk-* 是标记语法的相对字号（em），有意不进严格档 */
const STRICT = new Set(['home.css', 'l1-demo.css', 'extension.css'])

/** 几何尺寸允许清单：键为“文件|选择器|属性”，值为该声明里允许出现的字面值。每条写理由，不用通配 */
const ALLOW: SizeAllow = {
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

function scan(): { violations: string[]; used: Set<string> } {
  const violations: string[] = []
  const used = new Set<string>()
  for (const file of FILES) {
    const result = scanSizes(
      file,
      read(`${STYLES}/${file}`),
      ALLOW,
      STRICT.has(file) ? PAGE_STRICT : {},
    )
    violations.push(...result.violations)
    for (const key of result.used) used.add(key)
  }
  return { violations, used }
}

describe('页面层尺寸阶梯门禁（方案 §3.3）', () => {
  const { violations, used } = scan()

  it('检查器自身：认出 font 简写、calc、负值与小数里的字面值，放过令牌、em、env 回退与 1px 边框补偿', () => {
    expect(sizeLiterals('600 15px / 1.4 var(--font-zh-cn)')).toEqual(['15px'])
    expect(sizeLiterals('calc(100% + 10px)')).toEqual(['10px'])
    expect(sizeLiterals('max(var(--sp-5), calc((100% - 1280px) / 2 + var(--sp-5)))')).toEqual([
      '1280px',
    ])
    expect(sizeLiterals('-1px')).toEqual(['-1px'])
    expect(sizeLiterals('12.5px 1.5rem 0')).toEqual(['12.5px', '1.5rem'])
    expect(sizeLiterals('calc(var(--sp-2) + var(--sp-3) + 1px)')).toEqual([])
    expect(sizeLiterals('calc(var(--sp-2) + 1px) calc(var(--sp-3) + 1px)')).toEqual([])
    expect(sizeLiterals('calc(6px + 1px)')).toEqual(['6px', '1px'])
    expect(sizeLiterals('calc(var(--sp-5) + env(safe-area-inset-bottom, 0px))')).toEqual([])
    expect(sizeLiterals('0.86em')).toEqual([])
    expect(sizeLiterals('var(--main-pad-top) var(--sp-5) var(--sp-7) var(--sp-3)')).toEqual([])
    expect(sizeLiterals('1.5em')).toEqual([])
    expect(sizeLiterals('1.5em', true)).toEqual(['1.5em'])
    const strict = (decl: string): string[] =>
      scanSizes('x.css', `.a { ${decl} }`, {}, PAGE_STRICT).violations
    expect(strict('font-size: 0.86em')).toHaveLength(1)
    expect(strict('font-size: calc(var(--fs-body) * 1.1)')).toHaveLength(1)
    expect(strict('font-size: 15px')).toHaveLength(1)
    expect(strict('font-size:  var(--fs-lead)')).toEqual([])
    expect(strict('margin: 1em')).toHaveLength(1)
    expect(strict('letter-spacing: 0.04em')).toEqual([])
    expect(SIZE_CHECKED.test('padding-inline-start')).toBe(true)
    expect(SIZE_CHECKED.test('--main-pad-top')).toBe(true)
    expect(SIZE_CHECKED.test('min-height')).toBe(false)
    expect(SIZE_CHECKED.test('border-radius')).toBe(false)
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

  it('严格档文件都在 shared/styles 里（改名后严格档不会静默失效）', () => {
    for (const file of STRICT) expect(FILES, file).toContain(file)
  })

  it('shared/styles 的字号与间距不写 px/rem 字面值（几何项见 ALLOW）', () => {
    expect(violations).toEqual([])
  })

  it('ALLOW 没有失效条目：每一条都还能在对应文件里命中', () => {
    expect(Object.keys(ALLOW).filter((key) => !used.has(key))).toEqual([])
  })

  it('三个页面入口都在 base.css 之前引入 ui-theme/index.css（尺寸阶梯随 tokens.css 进入），不再引入 scale.css', () => {
    for (const entry of [
      'apps/site/src/pages/home/main.tsx',
      'apps/site/src/pages/extension/main.tsx',
      'apps/site/src/features/build-l10n/main.tsx',
    ]) {
      const text = read(entry)
      const index = text.indexOf("import '@poe2-tools/ui-theme/index.css'")
      const base = text.indexOf("import '../../shared/styles/base.css'")
      expect(index, entry).toBeGreaterThanOrEqual(0)
      expect(base, entry).toBeGreaterThan(index)
      expect(text, entry).not.toContain('scale.css')
    }
  })
})
