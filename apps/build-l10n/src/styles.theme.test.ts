// 浅色主题的门禁：① 深色定义过的颜色令牌，浅色必须逐个重新定义（漏一个就会有一块
// 深色残留在浅底上）；② 每一对「文字色 / 底色」实算 ≥4.5，每一处图形边界 ≥3。
// 直接读 CSS 源文件而不是渲染页面：happy-dom 不做级联与自定义属性求值，
// 只有解析源文件才能判「这个令牌到底有没有浅色值」。
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blend, contrastRatio } from './testing/contrast'
import { fsPathFromMetaUrl } from './testing/fsPath'

const here = dirname(fsPathFromMetaUrl(import.meta.url))
const css = readFileSync(resolve(here, 'styles/tokens.css'), 'utf8')

function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`样式里找不到 ${selector} 块`)
  const end = css.indexOf('\n}', start)
  // 先剥注释再按 `;` 切，不能按行解析：--app-wash 的值横跨三行（两个 gradient），
  // 按行的正则永远匹配不到它，于是深浅两个 map 里都没有这个名字——完备性检查与
  // 「浅色值不是深色值搬过来」两条都会静默漏掉它。
  const body = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
  const out = new Map<string, string>()
  for (const chunk of body.split(';')) {
    const match = /(--[a-z0-9-]+):\s*([\s\S]+)$/.exec(chunk)
    if (match !== null) out.set(match[1] ?? '', (match[2] ?? '').trim().replace(/\s+/g, ' '))
  }
  return out
}

// 主题无关的令牌：字体栈、字号、间距、圆角（--r-*）、动效、焦点环，以及有意保持深色的
// ember 按钮。`r` 后面的连字符是关键：写成 `r` 会把 --rule-fade / --rule-fade-short /
// --rarity-unique / --rarity-gem 一并豁免，而后两个是承载文字的稀有度色（传奇名、宝石名），
// 漏进豁免名单等于这条门禁在最需要它的地方失效。
const INVARIANT = /^--(font|fs|sp|r-|dur|ease|focus-ring|cta)/

const dark = block(':root')
const light = block(':root[data-theme="light"]')

describe('浅色令牌完备性', () => {
  it('深色定义过的每一个主题相关令牌，浅色都重新定义过', () => {
    const missing = [...dark.keys()].filter((name) => !INVARIANT.test(name) && !light.has(name))
    expect(missing).toEqual([])
  })

  it('浅色块里不出现深色块里没有的令牌（防手滑造新名字）', () => {
    const extra = [...light.keys()].filter((name) => !dark.has(name))
    expect(extra).toEqual([])
  })

  it('浅色值不是深色值直接搬过来的', () => {
    const same = [...light.entries()].filter(([name, value]) => dark.get(name) === value)
    expect(same).toEqual([])
  })

  it('跨行的令牌也解析到了（--app-wash 的值有三行，按行解析会整个漏掉）', () => {
    expect(dark.has('--app-wash')).toBe(true)
    expect(light.has('--app-wash')).toBe(true)
  })
})

const S0 = () => light.get('--surface-0') ?? ''
const S1 = () => light.get('--surface-1') ?? ''
const S2 = () => light.get('--surface-2') ?? ''
const S3 = () => light.get('--surface-3') ?? ''
const SH = () => light.get('--surface-hover') ?? ''
const tok = (name: string) => light.get(name) ?? ''

// rgba(...) 形态的令牌：先按 alpha 合成到底色上再算对比度，拿原色直接算会高估两三倍
function blendToken(name: string, surface: string): number {
  const parts = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(tok(name))
  if (parts === null) throw new Error(`${name} 不是 rgba() 形态，合成不了`)
  const hex = `#${[1, 2, 3].map((i) => Number(parts[i]).toString(16).padStart(2, '0')).join('')}`
  return contrastRatio(blend(hex, Number(parts[4]), surface), surface)
}

describe('浅色对比度', () => {
  it('正文档的文字色在四档表面上都 ≥4.5:1', () => {
    const texts = ['--text', '--text-2', '--text-3', '--gold-100', '--gold-300', '--gold-500']
    for (const name of texts) {
      for (const surface of [S0(), S1(), S2(), S3(), SH()]) {
        expect(`${name}@${surface}=${contrastRatio(tok(name), surface).toFixed(2)}`).toBe(
          `${name}@${surface}=${Math.max(4.5, contrastRatio(tok(name), surface)).toFixed(2)}`,
        )
      }
    }
  })

  it('语义色与稀有度色在卡片底与控件底上都 ≥4.5:1', () => {
    const names = [
      '--bronze-text',
      '--warn',
      '--danger',
      '--keep',
      '--info',
      '--rarity-unique',
      '--rarity-gem',
    ]
    for (const name of names) {
      for (const surface of [S1(), S2(), S3()]) {
        expect(contrastRatio(tok(name), surface)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('14 个标记语法色在卡片底上都 ≥4.5:1', () => {
    const marks = [
      '--mk-red',
      '--mk-orange',
      '--mk-yellow',
      '--mk-green',
      '--mk-blue',
      '--mk-indigo',
      '--mk-violet',
      '--mk-black',
      '--mk-white',
      '--mk-grey',
      '--mk-bronze',
      '--mk-silver',
      '--mk-gold',
      '--mk-unique',
    ]
    for (const name of marks) {
      expect(`${name}:${contrastRatio(tok(name), S2()) >= 4.5}`).toBe(`${name}:true`)
    }
  })

  it('非文本图形 ≥3:1：轨的命中格与「边框即唯一信号」的控件描边', () => {
    // 命中格只出现在卡片底与侧栏底上
    expect(contrastRatio(tok('--bronze-600'), S2())).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(tok('--bronze-600'), S1())).toBeGreaterThanOrEqual(3)
    // --control-edge 是 rgba(...)，先按 alpha 合成再算
    const edge = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(tok('--control-edge'))
    expect(edge).not.toBeNull()
    const hex = `#${[1, 2, 3].map((i) => Number(edge?.[i]).toString(16).padStart(2, '0')).join('')}`
    const alpha = Number(edge?.[4])
    for (const surface of [S0(), S1(), S2(), S3()]) {
      expect(contrastRatio(blend(hex, alpha, surface), surface)).toBeGreaterThanOrEqual(3)
    }
  })

  // 强调色那一层（3b 审查 I-2）：这些令牌是组件规则里唯一的状态 / 边界信号，
  // 收进 tokens.css 之前没有任何门禁看得见它们，浅色下集体塌到 1.04–1.42:1。
  // 纯装饰的 --gold-wash 与 --info-glow 不在名单里（前者只是底纹，后者是模糊光晕，
  // 信息由 --info 实色的点承担），--cell-hilite 的底不是表面而是命中格自己，另算。
  it('带 alpha 的强调色描边，浅色合成后在它实际所在的表面上都 ≥3:1', () => {
    const edges = ['--gold-line', '--gold-edge', '--warn-edge', '--unique-edge', '--bronze-line']
    for (const name of edges) {
      for (const surface of [S0(), S1(), S2()]) {
        expect(`${name}@${surface}=${blendToken(name, surface) >= 3}`).toBe(
          `${name}@${surface}=true`,
        )
      }
    }
    // 错误卡与错误徽章只落在 s0 / s1 / s2 上，同样逐个算过
    for (const surface of [S0(), S1(), S2()]) {
      expect(blendToken('--danger-edge', surface)).toBeGreaterThanOrEqual(3)
    }
    // 轨的命中格顶高光压在格子自己的 --bronze-600 上，不是压在表面上
    expect(blendToken('--cell-hilite', tok('--bronze-600'))).toBeGreaterThanOrEqual(3)
  })

  it('选区在浅色下看得出选中了哪一段，且选中的字仍然可读（I-3）', () => {
    const bg = tok('--selection-bg')
    for (const surface of [S0(), S1(), S2(), S3(), SH()]) {
      expect(contrastRatio(bg, surface)).toBeGreaterThanOrEqual(3)
    }
    // --selection-fg 写的是 var(--surface-2)，取它指向的那个值来算
    expect(contrastRatio(S2(), bg)).toBeGreaterThanOrEqual(4.5)
    expect(tok('--selection-fg')).toBe('var(--surface-2)')
  })

  it('焦点环在浅色下仍达图形 3:1（它复用 --gold-300）', () => {
    for (const surface of [S0(), S1(), S2(), S3()]) {
      expect(contrastRatio(tok('--gold-300'), surface)).toBeGreaterThanOrEqual(3)
    }
  })
})
