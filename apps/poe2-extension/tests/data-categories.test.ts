import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachStatLayer } from '../src/content/stat-layer'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it('数据类别翻译保留筛选身份、计数和其他区域原文，关闭完整恢复', () => {
  document.body.innerHTML =
    '<main><div id="itemCategorySelector"><ul><li value="70">Omen<span class="count">50</span></li><li value="26">Waystone<span class="count">16</span></li></ul></div><div id="itemClassSelector"><li value="g">Support Gems<span class="count">625</span></li></div><div id="itemTagSelector">Omen</div><p>Waystone</p></main>'
  const original = document.body.innerHTML
  const row = document.querySelector('li') as HTMLLIElement
  const count = row.querySelector('.count')
  stop = attachTextLayer(document, createLexicon([]))
  expect(row.firstChild?.textContent).toBe('预兆')
  expect(row.getAttribute('value')).toBe('70')
  expect(row.querySelector('.count')).toBe(count)
  expect(count?.textContent).toBe('50')
  expect(document.querySelector('[value="26"]')?.textContent).toBe('引路石16')
  expect(document.querySelector('[value="g"]')?.textContent).toBe('辅助宝石625')
  expect(document.querySelector('#itemTagSelector')?.textContent).toBe('Omen')
  expect(document.querySelector('p')?.textContent).toBe('Waystone')
  stop()
  expect(document.body.innerHTML).toBe(original)
})
it('数据类别动态更新与双语显示保留英文身份，未知类别不猜译', async () => {
  document.body.innerHTML =
    '<main><div id="itemCategorySelector"><li>Skill Gem</li><li>Unknown Category</li></div></main>'
  stop = attachTextLayer(document, createLexicon([]), true)
  const row = document.querySelector('li') as HTMLLIElement
  expect(row.textContent).toContain('技能宝石')
  expect(row.textContent).toContain('Skill Gem')
  row.textContent = 'Tablet'
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(row.textContent).toContain('石板')
  expect(row.textContent).toContain('Tablet')
  expect(document.querySelectorAll('li')[1]?.textContent).toBe('Unknown Category')
  stop()
  expect(row.textContent).toBe('Tablet')
})

it('制作类别翻译保留原站筛选值并可恢复', () => {
  document.body.innerHTML =
    '<main><div id="categoriesSelector"><li value="12" search="Tablet">Tablet</li><li value="13">Waystone</li></div><div id="classSelector"><li value="a">Unknown Category</li></div></main>'
  const original = document.body.innerHTML
  const row = document.querySelector('li') as HTMLLIElement
  stop = attachTextLayer(document, createLexicon([]))
  expect(row.textContent).toBe('石板')
  expect(row.getAttribute('search')).toBe('Tablet')
  expect(row.getAttribute('value')).toBe('12')
  expect(document.querySelector('[value="13"]')?.textContent).toBe('引路石')
  expect(document.querySelector('#classSelector li')?.textContent).toBe('Unknown Category')
  stop()
  expect(document.body.innerHTML).toBe(original)
})

it('石板结果卡类别翻译保留节点、数值及用户名称，关闭恢复', () => {
  document.body.innerHTML =
    '<main><div id="searchItemResults"><div class="item"><div class="header"><div class="name">Tablet</div></div><div class="property"><label>Tablet</label></div><div class="property"><label>Item level:</label><div>100</div></div></div></div><p>Tablet</p></main>'
  const original = document.body.innerHTML
  const label = document.querySelector('.property label')
  stop = attachTextLayer(document, createLexicon([]))
  const text = stop
  const stats = attachStatLayer(document, createLexicon([]))
  stop = () => {
    text()
    stats()
  }
  expect(label?.textContent).toBe('Tablet')
  expect(label?.parentElement?.nextElementSibling?.shadowRoot?.textContent).toBe('石板')
  expect(document.querySelector('.property label')).toBe(label)
  expect(document.querySelector('.name')?.textContent).toBe('Tablet')
  expect(document.querySelector('.property div')?.textContent).toBe('100')
  expect(document.querySelector('p')?.textContent).toBe('Tablet')
  stop()
  expect(document.body.innerHTML).toBe(original)
})
