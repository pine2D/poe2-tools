import { CORE_FACETS, EXT_CYAN, gemFacets } from '@poe2-tools/ui-theme/motif'
import { expect, it } from 'vitest'
import { adoptL1, createGem } from '../src/content/l1'

it('同一文档的各 shadow root 共用同一份 L1 样式表，重复调用不重复挂', () => {
  const roots = [0, 1].map(() => document.createElement('div').attachShadow({ mode: 'open' }))
  for (const root of roots) {
    adoptL1(root)
    adoptL1(root)
  }
  expect(roots[0]?.adoptedStyleSheets).toHaveLength(1)
  expect(roots[0]?.adoptedStyleSheets[0]).toBe(roots[1]?.adoptedStyleSheets[0])
})

it('createGem 画核心菱环与扩展青宝石，装饰不读出', () => {
  const gem = createGem(document, 16)
  expect(gem.getAttribute('viewBox')).toBe('-12.5 -12.5 25 25')
  expect(gem.getAttribute('width')).toBe('16')
  expect(gem.getAttribute('aria-hidden')).toBe('true')
  expect(gem.getAttribute('focusable')).toBe('false')
  expect(gem.classList.contains('gem')).toBe(true)
  const paths = [...gem.querySelectorAll('path')].map((p) => [
    p.getAttribute('fill'),
    p.getAttribute('d'),
  ])
  expect(paths).toEqual([...CORE_FACETS, ...gemFacets(EXT_CYAN)].map(([f, d]) => [f, d]))
})
