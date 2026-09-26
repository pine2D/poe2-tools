import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachStatLayer } from '../src/content/stat-layer'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it.each([false, true])('经典词缀不污染POB原文，保留数字更新和停用清理：%s', async (bilingual) => {
  document.body.innerHTML =
    '<main><div class="item"><div class="mod"><div class="modifier" id="classic">+40 to maximum <span class="keyword" id="EnergyShield">Energy Shield</span></div></div><div class="mod"><div class="modifier"><span class="statSet"><span class="stat">+40 to maximum Energy Shield</span></span></div></div></div></main>'
  const lex = createLexicon([
    {
      id: 'es',
      en: '+# to maximum Energy Shield',
      zh: '+# 能量护盾上限',
      domain: 'stat',
      source: 'test',
      version: 'test',
    },
    {
      id: 'label',
      en: 'Energy Shield',
      zh: '能量护盾',
      domain: 'ui',
      source: 'test',
      version: 'test',
    },
  ])
  const item = document.querySelector('.item') as HTMLElement
  const classic = document.querySelector('#classic') as HTMLElement
  const keyword = document.querySelector('#EnergyShield')
  const original = item.textContent
  const text = attachTextLayer(document, lex, bilingual)
  const stats = attachStatLayer(document, lex)
  stop = () => {
    stats()
    text()
  }
  expect(item.textContent).toBe(original)
  expect(document.querySelector('#EnergyShield')).toBe(keyword)
  expect(classic.nextElementSibling?.shadowRoot?.textContent).toBe('+40 能量护盾上限')
  expect(item.querySelectorAll('[data-poe2-l10n]')).toHaveLength(2)
  const first = classic.firstChild as Text
  first.data = '+45 to maximum '
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(classic.nextElementSibling?.shadowRoot?.textContent).toBe('+45 能量护盾上限')
  expect(classic.textContent).toBe('+45 to maximum Energy Shield')
  const advanced = item.querySelector('.stat') as HTMLElement
  advanced.className = ''
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(item.querySelectorAll('[data-poe2-l10n]')).toHaveLength(2)
  expect(advanced.textContent).toBe('+40 to maximum Energy Shield')
  advanced.className = 'stat'
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(item.querySelectorAll('[data-poe2-l10n]')).toHaveLength(2)
  expect(advanced.nextElementSibling?.shadowRoot?.textContent).toBe('+40 能量护盾上限')
  stop()
  expect(item.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(classic.textContent).toBe('+45 to maximum Energy Shield')
})
