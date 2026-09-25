import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it.each([false, true])('武器属性分段翻译保留关键词、数值和恢复，双语=%s', async (bilingual) => {
  document.body.innerHTML =
    '<main><div class="item"><div class="header"><div class="name">Physical</div></div><div class="property"><div id="range">10 <span class="label">to</span> 17</div><label><span class="keyword keyworded" id="Physical">Physical</span> Damage</label></div><div class="property"><label><span class="keyword keyworded" id="Critical">Critical Hit</span> Chance:</label><div>5.00%</div></div><div class="property"><label>Attacks per Second:</label><div id="speed">1.28</div></div></div><p>Physical Damage</p></main>'
  const keyword = document.querySelector('#Physical') as HTMLElement
  const speed = document.querySelector('#speed') as HTMLElement
  const range = document.querySelector('#range') as HTMLElement
  stop = attachTextLayer(document, createLexicon([]), bilingual)
  expect(keyword.textContent).toContain('物理')
  expect(keyword.parentElement?.textContent).toContain('伤害')
  expect(document.querySelector('#Critical')?.textContent).toContain('暴击')
  expect(document.querySelector('#Critical')?.parentElement?.textContent).toContain('几率')
  expect(speed.previousElementSibling?.textContent).toContain('每秒攻击次数')
  expect(range.textContent).toContain('至')
  expect(keyword.textContent?.includes('Physical')).toBe(bilingual)
  expect(document.querySelector('#Physical')).toBe(keyword)
  expect(keyword.className).toBe('keyword keyworded')
  expect(document.querySelector('.name')?.textContent).toBe('Physical')
  expect(document.querySelector('p')?.textContent).toBe('Physical Damage')
  speed.textContent = '1.35'
  const upper = range.lastChild
  if (!upper) throw new Error('缺少范围上界文本节点')
  upper.textContent = ' 19'
  await new Promise((resolve) => setTimeout(resolve, 0))
  stop()
  expect(keyword.parentElement?.textContent).toBe('Physical Damage')
  expect(document.querySelector('#Critical')?.parentElement?.textContent).toBe(
    'Critical Hit Chance:',
  )
  expect(speed.previousElementSibling?.textContent).toBe('Attacks per Second:')
  expect(speed.textContent).toBe('1.35')
  expect(range.textContent).toBe('10 to 19')
})
