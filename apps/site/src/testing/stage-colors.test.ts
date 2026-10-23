// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { blend, contrastRatio } from '../../../../packages/ui-theme/src/testing/contrast'
import { parseRules, rootTokens } from '../../../../packages/ui-theme/src/testing/css'

const repo = new URL('../../../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, repo), 'utf8')
const tokens = rootTokens(read('packages/ui-theme/src/tokens.css')).tokens
const token = (name: string) => {
  const value = tokens.get(name)
  if (!value) throw new Error(`缺少令牌 ${name}`)
  return value
}

it('阶段变化文字与新／换标记在展开、悬停和待核对背景上均达到 4.5:1', () => {
  const surfaces = [
    token('--frame-bg'),
    token('--raised-2'),
    blend(token('--raised-2'), 0.7, token('--frame-bg')),
    blend(token('--miss'), 0.1, token('--raised-2')),
  ]
  for (const [file, selectors] of [
    ['stageboard', ['.stageboard__mark', '.stageboard__delta', '.stageboard__supports--modded']],
    ['home', ['.mini-cell__mark']],
  ] as const) {
    const rules = parseRules(read(`apps/site/src/shared/styles/${file}.css`))
    for (const selector of selectors) {
      const rule = [...rules]
        .reverse()
        .find((item) => item.selectors.includes(selector) && item.declarations.has('color'))
      const colorName = rule?.declarations.get('color')?.match(/^var\((--[\w-]+)\)$/)?.[1]
      expect(colorName, selector).toBeDefined()
      const mark = selector.endsWith('__mark')
      if (mark)
        expect(rule?.declarations.get('background')).toBe(
          'color-mix(in srgb, var(--metal-line) 30%, transparent)',
        )
      for (const surface of surfaces) {
        const background = mark ? blend(token('--metal-line'), 0.3, surface) : surface
        expect(
          contrastRatio(token(colorName ?? ''), background),
          `${selector} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  }
})
