// SERIF_SELECTORS 与组件 CSS 实际使用衬线的选择器逐条一致（spec §7.1；契约 §3.5.6 的判定口径）
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { L1_SERIF_SELECTORS, SERIF_SELECTORS } from './selectors'
import { parseRules } from './testing/css'

const dir = fileURLToPath(new URL('./components/', import.meta.url))

it('SERIF_SELECTORS 等于组件 CSS 中 font / font-family 使用 var(--pt-serif…) 的选择器集合', () => {
  const found = new Set<string>()
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.css'))) {
    for (const rule of parseRules(readFileSync(`${dir}${file}`, 'utf8'))) {
      const font = `${rule.declarations.get('font') ?? ''} ${rule.declarations.get('font-family') ?? ''}`
      if (!font.includes('var(--pt-serif')) continue
      for (const selector of rule.selectors) found.add(selector)
    }
  }
  expect([...found].sort()).toEqual([...SERIF_SELECTORS].sort())
  expect(new Set(SERIF_SELECTORS).size).toBe(SERIF_SELECTORS.length)
})

it('L1_SERIF_SELECTORS 等于 l1.css 中 font / font-family 使用 var(--l1-serif) 的选择器集合，且不与 SERIF_SELECTORS 重叠（扩展 0.4.0）', () => {
  const l1 = fileURLToPath(new URL('./l1.css', import.meta.url))
  const found = new Set<string>()
  for (const rule of parseRules(readFileSync(l1, 'utf8'))) {
    const font = `${rule.declarations.get('font') ?? ''} ${rule.declarations.get('font-family') ?? ''}`
    if (!font.includes('var(--l1-serif')) continue
    for (const selector of rule.selectors) found.add(selector)
  }
  expect([...found].sort()).toEqual([...L1_SERIF_SELECTORS].sort())
  expect(L1_SERIF_SELECTORS).toEqual(['.title', '.body > button', '.result > button'])
  for (const selector of L1_SERIF_SELECTORS) expect(SERIF_SELECTORS).not.toContain(selector)
})
