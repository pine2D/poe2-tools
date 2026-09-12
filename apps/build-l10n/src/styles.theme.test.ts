// happy-dom 不计算 CSS 自定义属性；直接读取最终主题，检查语义色及真实表面组合。
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './testing/contrast'
import { fsPathFromMetaUrl } from './testing/fsPath'

const here = dirname(fsPathFromMetaUrl(import.meta.url))
const css = readFileSync(resolve(here, 'styles/tokens.css'), 'utf8')

function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`样式里找不到 ${selector}`)
  const body = css.slice(start, css.indexOf('\n}', start)).replace(/\/\*[\s\S]*?\*\//g, '')
  const values = new Map<string, string>()
  for (const chunk of body.split(';')) {
    const match = /(--[a-z0-9-]+):\s*([\s\S]+)$/.exec(chunk)
    if (match !== null) values.set(match[1] ?? '', (match[2] ?? '').trim())
  }
  return values
}

const dark = block(':root')
const light = block(':root[data-theme="light"]')
const invariant = /^--(font-|dur-|focus-ring$)/

describe('灰阶主题令牌', () => {
  it('每个主题相关令牌都提供独立深浅值', () => {
    expect([...dark.keys()].filter((name) => !invariant.test(name) && !light.has(name))).toEqual([])
    expect([...light.keys()].filter((name) => !dark.has(name))).toEqual([])
    expect([...light.entries()].filter(([name, value]) => dark.get(name) === value)).toEqual([])
  })

  for (const [theme, tokens] of [
    ['深色', dark],
    ['浅色', light],
  ] as const) {
    const value = (name: string) => tokens.get(name) ?? ''
    const surfaces = ['--surface-0', '--surface-1', '--surface-2', '--surface-3', '--surface-hover']
    it(`${theme}正文和语义文字在各档表面均达到 4.5:1`, () => {
      for (const text of [
        '--text',
        '--text-muted',
        '--accent',
        '--success',
        '--warn',
        '--danger',
        '--rarity-unique',
        '--rarity-gem',
      ]) {
        for (const surface of surfaces) {
          expect(
            contrastRatio(value(text), value(surface)),
            `${text}@${surface}`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    })
    it(`${theme}命名标记在实际内容底上均达到 4.5:1`, () => {
      const marks = [...tokens.keys()].filter((name) => name.startsWith('--mk-'))
      expect(marks).toHaveLength(14)
      for (const mark of marks) {
        expect(contrastRatio(value(mark), value('--surface-2')), mark).toBeGreaterThanOrEqual(4.5)
      }
    })
    it(`${theme}控件、选中轮廓与焦点在相邻表面达到 3:1`, () => {
      for (const edge of ['--control-edge', '--accent']) {
        for (const surface of [...surfaces, '--accent-bg']) {
          expect(
            contrastRatio(value(edge), value(surface)),
            `${edge}@${surface}`,
          ).toBeGreaterThanOrEqual(3)
        }
      }
    })
    it(`${theme}主按钮、选区和带底状态文字达到 4.5:1`, () => {
      for (const [text, surface] of [
        ['--action-text', '--action-bg'],
        ['--selection-fg', '--selection-bg'],
        ['--accent', '--accent-bg'],
        ['--warn', '--warn-bg'],
      ]) {
        expect(contrastRatio(value(text ?? ''), value(surface ?? ''))).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
