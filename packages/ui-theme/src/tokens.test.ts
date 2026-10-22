// spec §4.3 令牌与对比度门禁：令牌全集、取值与对比度都由本测试固定
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './testing/contrast'
import { parseRules, rootTokens } from './testing/css'
import { FORGE_COLORS, NAMEPLATE_VARIANTS, TAB_COLORS } from './testing/gate'

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')
const { count, tokens } = rootTokens(css)

// v4 兼容接口的 75 个令牌
const EXPECTED: Record<string, string> = {
  '--label': '#fff8e1',
  '--steel': '#0f304d',
  '--steel-hi': '#164a75',
  '--steel-edge': '#4c4c7d',
  '--page': '#0e1115',
  '--bg': '#000000',
  '--bg-2': '#121922',
  '--surface': '#15181c',
  '--raised': '#1e2124',
  '--raised-2': '#262a2e',
  '--frame-bg': '#000000',
  '--well': '#000000',
  '--card': '#000000',
  '--bar': '#0e1115',
  '--miss-bg': 'rgba(239,144,184,.07)',
  '--line': '#1f2429',
  '--line-2': '#2c333b',
  '--control-edge': '#94a1ae',
  '--metal-line': '#465260',
  '--metal-edge': '#2c333b',
  '--metal-bright': '#b08850',
  '--ink': '#f2ead8',
  '--ink-2': '#c9bba0',
  '--ink-3': '#a38d6d',
  '--bronze-lo': '#8a6a3e',
  '--bronze': '#b08850',
  '--bronze-hi': '#b08850',
  '--gold': '#e9cf9f',
  '--title-gold': '#fff8e1',
  '--mod': '#8f8fff',
  '--mod-hi': '#9a9aff',
  '--mod-num-zh': '#dcdcff',
  '--prop': '#9d9282',
  '--val': '#e2e2e2',
  '--unique': '#e28a47',
  '--unique-name': '#e28a47',
  '--unique-name-2': '#e7a070',
  '--unique-edge': '#af6025',
  '--gem': '#43c1b5',
  '--gem-en': '#8cc5c1',
  '--ok': '#82cf90',
  '--miss': '#ef90b8',
  '--danger': '#f3806f',
  '--focus': '#b8cfff',
  '--focus-ring': '2px solid var(--focus)',
  '--selection-bg': '#b8cfff',
  '--selection-fg': '#0e1115',
  '--mk-red': '#e8695c',
  '--mk-orange': '#e0904a',
  '--mk-yellow': '#e6d45a',
  '--mk-green': '#6fcf5e',
  '--mk-blue': '#8888ff',
  '--mk-indigo': '#a79bff',
  '--mk-violet': '#d79be8',
  '--mk-black': '#a1aab7',
  '--mk-white': '#ede6d6',
  '--mk-grey': '#9a9280',
  '--mk-bronze': '#c9a46a',
  '--mk-silver': '#c8c8c8',
  '--mk-gold': '#e6e066',
  '--mk-unique': '#c87b3a',
  '--gem-1': '#fff0c8',
  '--gem-2': '#e3a24a',
  '--gem-3': '#7a3d0c',
  '--gem-4': '#b36a22',
  '--pt-serif': '"PoE2 Serif SC", "Noto Serif SC", "Source Han Serif SC", serif',
  '--pt-serif-tc':
    '"PoE2 Serif TC", "PoE2 Serif SC", "Noto Serif TC", "Source Han Serif TC", serif',
  '--pt-cinzel': '"PoE2 Cinzel", "Cinzel", "PoE2 Serif SC", serif',
  '--font-zh-cn':
    'system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
  '--font-zh-tw':
    'system-ui, "Segoe UI", "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif',
  '--font-code': 'ui-monospace, "Cascadia Mono", Consolas, monospace',
  '--ease-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
  '--dur-enter': '180ms',
  '--dur-exit': '140ms',
  '--dur-fast': '140ms',
}

// 契约 §6.1 的比较口径：去空白、转小写、小数补前导零（Biome 会把 .07 格式化成 0.07）
function norm(value: string): string {
  return value
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/(^|[^0-9])\.(\d)/g, '$10.$2')
}

function token(name: string): string {
  const value = tokens.get(name)
  if (value === undefined) throw new Error(`tokens.css 缺少 ${name}`)
  return value
}

const SURFACES = [
  '--page',
  '--bg',
  '--bg-2',
  '--surface',
  '--raised',
  '--raised-2',
  '--frame-bg',
  '--well',
  '--card',
  '--bar',
]
const TEXT = [
  '--ink',
  '--ink-2',
  '--ink-3',
  '--gold',
  '--title-gold',
  '--label',
  '--ok',
  '--miss',
  '--danger',
  '--mod',
  '--mod-hi',
  '--prop',
  '--unique',
  '--unique-name',
  '--gem',
]

describe('令牌结构（spec §4.3）', () => {
  it('只有一个 :root 块，没有主题变体', () => {
    expect(count).toBe(1)
    expect(css).not.toContain('[data-theme')
    expect(css).not.toContain('prefers-color-scheme')
    const root = parseRules(css).find((rule) => rule.selectors.includes(':root'))
    expect(root?.declarations.get('color-scheme')).toBe('dark')
  })

  it('令牌集合与取值等于v4 兼容接口的 75 项（尺寸阶梯 --fs-* / --sp-* 由 scale.test.ts 核对）', () => {
    const contract = [...tokens.keys()].filter((name) => !/^--(fs|sp)-/.test(name))
    expect([...contract].sort()).toEqual(Object.keys(EXPECTED).sort())
    expect(contract).toHaveLength(75)
    for (const [name, value] of Object.entries(EXPECTED)) {
      expect(norm(token(name)), name).toBe(norm(value))
    }
  })

  it('标记色恰好 14 个；刻面变量只有 --gem-1..4 且为站点琥珀', () => {
    expect([...tokens.keys()].filter((name) => name.startsWith('--mk-'))).toHaveLength(14)
    expect([...tokens.keys()].filter((name) => /^--gem-\d+$/.test(name)).sort()).toEqual([
      '--gem-1',
      '--gem-2',
      '--gem-3',
      '--gem-4',
    ])
    expect(['--gem-1', '--gem-2', '--gem-3', '--gem-4'].map(token)).toEqual([
      '#fff0c8',
      '#e3a24a',
      '#7a3d0c',
      '#b36a22',
    ])
  })

  it('扩展青与传奇橙两组预设只改刻面', () => {
    const rules = parseRules(css)
    const preset = (selector: string) =>
      Object.fromEntries(
        rules.find((rule) => rule.selectors.includes(selector))?.declarations ?? [],
      )
    expect(preset('.pt-attr-ext')).toEqual({
      '--gem-1': '#c9f5f0',
      '--gem-2': '#2fbdb3',
      '--gem-3': '#0b4a46',
      '--gem-4': '#1a8780',
    })
    expect(preset('.pt-attr-unique')).toEqual({
      '--gem-1': '#ffd8b5',
      '--gem-2': '#f07a2c',
      '--gem-3': '#6e2405',
      '--gem-4': '#b44f19',
    })
  })
})

describe('对比度门禁（DESIGN.md v4）', () => {
  it('主按钮文字对普通与悬停底 ≥4.5:1；外边对两侧背景 ≥3:1', () => {
    for (const surface of ['--steel', '--steel-hi']) {
      expect(contrastRatio(token('--label'), token(surface))).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(token('--control-edge'), token(surface))).toBeGreaterThanOrEqual(3)
    }
    // --steel-edge 只作内侧装饰；方形开关的青铜边面对面板，不用于正文。
    expect(contrastRatio(token('--bronze-lo'), token('--bg'))).toBeGreaterThanOrEqual(3)
  })

  it('文字令牌对全部表面 ≥4.5:1', () => {
    for (const text of TEXT) {
      for (const surface of SURFACES) {
        expect(
          contrastRatio(token(text), token(surface)),
          `${text}@${surface}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('控件边界、焦点与亮铜边对全部表面 ≥3:1', () => {
    for (const edge of ['--control-edge', '--focus', '--metal-bright', '--bronze']) {
      for (const surface of SURFACES) {
        expect(
          contrastRatio(token(edge), token(surface)),
          `${edge}@${surface}`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('名称牌各变体的名称与次要文字对三段底 ≥4.5:1；gem 名称对 p1 ≥5:1', () => {
    for (const [variant, colors] of Object.entries(NAMEPLATE_VARIANTS)) {
      for (const stop of colors.p) {
        expect(contrastRatio(colors.name, stop), `${variant} 名称@${stop}`).toBeGreaterThanOrEqual(
          4.5,
        )
        expect(contrastRatio(colors.name2, stop), `${variant} 次要@${stop}`).toBeGreaterThanOrEqual(
          4.5,
        )
      }
    }
    expect(contrastRatio(token('--gem'), NAMEPLATE_VARIANTS.gem.p[0])).toBeGreaterThanOrEqual(5)
  })

  it('collapsed 展开控件的 --gold 与悬停 --ink 对三段底 ≥4.5:1；gem 未命中 --miss 对 p1 ≥4.5:1', () => {
    for (const stop of NAMEPLATE_VARIANTS.collapsed.p) {
      expect(contrastRatio(token('--gold'), stop)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(token('--ink'), stop)).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(token('--miss'), NAMEPLATE_VARIANTS.gem.p[0])).toBeGreaterThanOrEqual(4.5)
  })

  it('标记色对 --raised（markup.ts 的 TIP_BG_DARK）≥4.5:1', () => {
    for (const name of [...tokens.keys()].filter((key) => key.startsWith('--mk-'))) {
      expect(contrastRatio(token(name), token('--raised')), name).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('金属主按钮文字对渐变中段三个色标 ≥4.5:1', () => {
    for (const stop of FORGE_COLORS.midStops) {
      expect(contrastRatio(FORGE_COLORS.text, stop), stop).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('页签计数色：未选中 --ink-2 对两个色标、选中 #fbe4b8 对三个色标都 ≥4.5:1', () => {
    for (const stop of TAB_COLORS.idleStops) {
      expect(contrastRatio(token('--ink-2'), stop), stop).toBeGreaterThanOrEqual(4.5)
    }
    for (const stop of TAB_COLORS.selectedStops) {
      expect(contrastRatio(TAB_COLORS.selectedText, stop), stop).toBeGreaterThanOrEqual(4.5)
    }
  })
})
