// spec §4.3 令牌与对比度门禁：令牌全集、取值与对比度都由本测试固定
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './testing/contrast'
import { parseRules, rootTokens } from './testing/css'
import { FORGE_COLORS, NAMEPLATE_VARIANTS, TAB_COLORS } from './testing/gate'

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')
const { count, tokens } = rootTokens(css)

// 契约 §6.1 的 71 个令牌
const EXPECTED: Record<string, string> = {
  '--page': '#17130f',
  '--bg': '#100e0c',
  '--bg-2': '#14110e',
  '--surface': '#1a1612',
  '--raised': '#211c16',
  '--raised-2': '#2b241c',
  '--frame-bg': '#15110d',
  '--well': '#0b0908',
  '--card': '#0f0c0a',
  '--bar': '#120f0c',
  '--miss-bg': 'rgba(242,167,102,.07)',
  '--line': '#322a21',
  '--line-2': '#473b2d',
  '--control-edge': '#8a7a62',
  '--metal-line': '#7a5530',
  '--metal-edge': '#5d4229',
  '--metal-bright': '#c89a5e',
  '--ink': '#e9e0cd',
  '--ink-2': '#c0b49d',
  '--ink-3': '#9a8e79',
  '--bronze-lo': '#6d4b27',
  '--bronze': '#b98a50',
  '--bronze-hi': '#e4bb7c',
  '--gold': '#dcb877',
  '--title-gold': '#e9c585',
  '--mod': '#8888ff',
  '--mod-hi': '#a9a9ff',
  '--mod-num-zh': '#dcdcff',
  '--prop': '#8c8c8c',
  '--val': '#ffffff',
  '--unique': '#ef6916',
  '--unique-name': '#f27b2e',
  '--unique-name-2': '#e7a070',
  '--unique-edge': '#af6025',
  '--gem': '#1ba29b',
  '--gem-en': '#8cc5c1',
  '--ok': '#93c47d',
  '--miss': '#f2a766',
  '--danger': '#f28e87',
  '--focus': '#ffd48a',
  '--focus-ring': '2px solid var(--focus)',
  '--selection-bg': '#e4bb7c',
  '--selection-fg': '#100e0c',
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
  '--bronze',
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

  it('令牌集合与取值等于契约 §6.1 的 71 项', () => {
    expect([...tokens.keys()].sort()).toEqual(Object.keys(EXPECTED).sort())
    expect(tokens.size).toBe(71)
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

describe('对比度门禁（spec §4.3）', () => {
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
    for (const edge of ['--control-edge', '--focus', '--metal-bright']) {
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
