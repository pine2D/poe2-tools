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
    expect(finalValue(rules, '.app__error', 'max-width')).toBe('640px')
  })
  it('ErrorCard 的两条宽度规则按特异性升序：(0,3,0) 的限定写法排在 (0,1,0) 的 .app__error 之后', () => {
    // biome lint/style/noDescendingSpecificity 只报警告、不让 verify 失败，这里钉住顺序
    const layout = parseRules(read('apps/site/src/shared/styles/layout.css')).filter(
      (rule) => rule.atRules.length === 0,
    )
    const at = (selector: string): number =>
      layout.findIndex((rule) => rule.selectors.some((item) => flat(item) === flat(selector)))
    expect(at('.app__error')).toBeGreaterThanOrEqual(0)
    expect(at('.app__main:only-child > .app__error')).toBeGreaterThan(at('.app__error'))
  })
})

describe('强制色彩下的按下态（spec §5.6；M2 终审）', () => {
  it('“仅看待核对”等按下态的 Highlight 外框只由 ui-theme btn.css 定义，页面样式不再重复一份', () => {
    const btn = parseRules(read('packages/ui-theme/src/components/btn.css'))
    const forced = 'forced-colors: active'
    expect(finalValue(btn, '.pt-btn[aria-pressed="true"]', 'outline', forced)).toBe(
      '2px solid highlight',
    )
    expect(finalValue(btn, '.pt-btn[aria-pressed="true"]', 'outline-offset', forced)).toBe('-2px')
    const duplicated = buildCss()
      .filter((rule) => rule.atRules.some((at) => flat(at).includes(flat(forced))))
      .flatMap((rule) => rule.selectors)
      .filter((selector) => selector.includes('aria-pressed'))
    expect(duplicated).toEqual([])
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

describe('页面级浮层层级（spec §4.5）', () => {
  const rules = buildCss()
  it('设置弹层 z-index 30；构筑页页头不建层叠上下文，弹层才能压过页签行（2）与角饰（3）', () => {
    expect(finalValue(rules, '.app__settings-panel', 'z-index')).toBe('30')
    expect(finalValue(rules, '.app .pt-header', 'z-index')).toBe('auto')
  })
})

describe('导入后的自动滚动（spec §6.4.2）', () => {
  it('主区 pt-frame 的 scroll-margin-top 取 --main-pad-top', () => {
    expect(finalValue(buildCss(), '.app__build-frame', 'scroll-margin-top')).toBe(
      'var(--main-pad-top)',
    )
  })
})

describe('页头右侧控件组间距（spec §5.2，M2 Ruling 11）', () => {
  const rules = buildCss()
  it('简繁分段与“设置”之间：桌面 20px（同 M0）、≤850px 16px', () => {
    expect(finalValue(rules, '.app__options', 'gap')).toBe('20px')
    expect(finalValue(rules, '.app__options', 'gap', 'max-width: 850px')).toBe('16px')
  })
})

describe('信息行计数与 tabpanel 焦点环（M2 Ruling 13）', () => {
  const rules = buildCss()
  it('统计行计数“8/8”与 M0 相同：字重 600、字色 --ink', () => {
    expect(finalValue(rules, '.stats b', 'font-weight')).toBe('600')
    expect(finalValue(rules, '.stats b', 'color')).toBe('var(--ink)')
  })
  it('tabpanel（tabIndex=0）键盘聚焦时用统一焦点环：--focus-ring，外偏移 3px（spec §5.15）', () => {
    expect(finalValue(rules, '[role="tabpanel"]:focus-visible', 'outline')).toBe(
      'var(--focus-ring)',
    )
    expect(finalValue(rules, '[role="tabpanel"]:focus-visible', 'outline-offset')).toBe('3px')
  })
})

describe('改版前构筑页样式已清理（契约 §2.4、§4.2）', () => {
  const rules = buildCss()
  it('M2 标记行与标记之前的改版前规则都已删除', () => {
    for (const name of BUILD_STYLES) {
      expect(read(`apps/site/src/shared/styles/${name}.css`)).not.toContain('===== M2 改版后')
    }
  })
  it('不再有改版前的类选择器与全局 button 状态规则', () => {
    const old =
      /\.(card|tip|chip|seg|badge|preview|preview-toolbar|preview-controls|preview-columns|build-header|review-summary|section-nav|review-next|sec|errorcard|toast|toast-live|filelist|dropzone|paste|rail-h|batch-download|download-help|empty|example-action|options|export-settings|opt|cta|button|hint|muted|app__header|app__brand|app__mark|app__tool-link|app__live)(__[\w-]+|--[\w-]+)?(?![\w-])/
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        expect(selector, selector).not.toMatch(old)
        expect(selector, selector).not.toMatch(/^button:/)
      }
    }
  })
  // 契约 §2.4、§7.3（v2）：构筑页整页滚动，与 M0 mockup 一致；宽屏导入后页头随页面滚出视口，用户已在 M2 开工时确认
  // 匹配不锚定开头、允许修饰类：≤1099px 抽屉 .app__side--open 与带祖先或属性限定的写法都算；
  // .app__side-note 等子元素不算。偶尔误报（如 .app__main:only-child > .app__error）只会让用例失败，不会放过问题
  it('整页滚动：.app__main 与 .app__side（含修饰类与限定写法）在任何断点都不是滚动容器', () => {
    for (const rule of rules) {
      const target = rule.selectors.some((item) =>
        /\.app__(main|side)(--[\w-]+)?(?![\w-])/.test(flat(item)),
      )
      if (!target) continue
      for (const prop of ['overflow', 'overflow-x', 'overflow-y']) {
        expect(rule.declarations.get(prop) ?? 'visible').not.toMatch(/auto|scroll/)
      }
    }
  })
  it('站点 CSS 中 z-index ≥ 3 只剩设置弹层 30、跳转链接 20、Toast 40', () => {
    const names = [...BUILD_STYLES, 'base', 'site', 'home', 'extension']
    const found = new Map<string, string>()
    for (const name of names) {
      for (const rule of parseRules(read(`apps/site/src/shared/styles/${name}.css`))) {
        const value = rule.declarations.get('z-index')
        if (value === undefined || !/^\d+$/.test(value.trim()) || Number(value) < 3) continue
        for (const selector of rule.selectors) found.set(norm(selector), value.trim())
      }
    }
    expect(Object.fromEntries(found)).toEqual({
      '.app__settings-panel': '30',
      '.skip-link': '20',
      '.app__toast': '40',
    })
    // 契约 C14：页头不建层叠上下文的规则，清理后在九个文件里只剩 controls.css 的一条，最终值仍为 auto
    // （M1 的 SiteHeader.test 按同一拼接顺序取最终值，清理前后都成立）
    const headerRules = BUILD_STYLES.flatMap((name) =>
      parseRules(read(`apps/site/src/shared/styles/${name}.css`))
        .filter((rule) => rule.selectors.some((item) => flat(item) === '.app.pt-header'))
        .map(() => name),
    )
    expect(headerRules).toEqual(['controls'])
    expect(finalValue(rules, '.app .pt-header', 'z-index')).toBe('auto')
  })
  it('“选择 .build 文件”的焦点环只以 label[for="file-input"] 形态出现（a11y.css 不再有旧的 .button 形态）', () => {
    const a11y = parseRules(read('apps/site/src/shared/styles/a11y.css'))
    for (const rule of a11y) {
      const text = flat(rule.selectors.join(','))
      if (text.includes('#file-input')) expect(text).toMatch(/label\[for="file-input"\]$/)
    }
    expect(read('apps/site/src/shared/styles/a11y.css')).not.toContain('.button')
    const controls = parseRules(read('packages/ui-theme/src/components/controls.css'))
    const selector =
      ':is(.pt-dropzone, .pt-droprail):has(#file-input:focus-visible) label[for="file-input"]'
    expect(finalValue(controls, selector, 'outline')).toBe('2px solid var(--focus)')
  })
})
