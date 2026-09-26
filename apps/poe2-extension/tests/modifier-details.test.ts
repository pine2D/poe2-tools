import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it.each([false, true])('高级词缀头分段翻译保留名称、身份、更新与恢复：%s', async (bilingual) => {
  document.body.innerHTML =
    '<main><div class="item"><div class="mod" mod="LocalAddedFireDamage1"><div class="modifierDetails">Prefix modifier "Heated" (Tier: 10) — <span class="tags">Damage, Elemental, Fire, Attack</span></div></div></div><p>Prefix modifier "Heated" (Tier: 10) —</p></main>'
  const details = document.querySelector('.modifierDetails') as HTMLElement
  const tags = document.querySelector('.tags') as HTMLElement
  stop = attachTextLayer(document, createLexicon([]), bilingual)
  expect(details.firstChild?.textContent).toContain('前缀属性 "Heated"（等阶：10）—')
  expect(tags.textContent).toContain('伤害、元素、火焰、攻击')
  expect(tags.textContent?.includes('Damage')).toBe(bilingual)
  expect(document.querySelector('[mod]')?.getAttribute('mod')).toBe('LocalAddedFireDamage1')
  expect(document.querySelector('p')?.textContent).toBe('Prefix modifier "Heated" (Tier: 10) —')
  const first = details.firstChild as Text
  first.data = 'Suffix modifier "of Skill" (Tier: 5) — '
  tags.textContent = 'Attack, Speed'
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(first.data).toContain('后缀属性 "of Skill"（等阶：5）—')
  expect(tags.textContent).toContain('攻击、速度')
  stop()
  expect(first.data).toBe('Suffix modifier "of Skill" (Tier: 5) — ')
  expect(tags.textContent).toBe('Attack, Speed')
})
it('未知词缀头和未知标签不猜译，区域类移除后恢复', async () => {
  document.body.innerHTML =
    '<main><div class="item"><div class="modifierDetails">Special modifier "Test" (Tier: ?) — <span class="tags">Damage, FutureTag</span></div></div></main>'
  const details = document.querySelector('.modifierDetails') as HTMLElement
  stop = attachTextLayer(document, createLexicon([]))
  expect(details.textContent).toBe('Special modifier "Test" (Tier: ?) — Damage, FutureTag')
  const first = details.firstChild
  if (!first) throw new Error('缺少词缀头')
  first.textContent = 'Prefix modifier "Test" (Tier: 1) — '
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(details.textContent).toContain('前缀属性')
  details.className = ''
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(details.textContent).toBe('Prefix modifier "Test" (Tier: 1) — Damage, FutureTag')
})
