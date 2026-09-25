import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
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
