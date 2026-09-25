import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
it.each([false, true])('制作菜单标题动态翻译保留业务值与用户文本：双语=%s', async (bilingual) => {
  document.body.innerHTML =
    '<main><div id="CraftingMethod_10" class="hidden"><ul><li value="[10,0]">Normal item</li><li value="[10,1]">Magic item</li><li value="[10,2]">Rare item</li></ul></div><div id="OmensSelector"><label>Available omen(s)</label><ul><li>Available omen(s)</li></ul></div><p>Normal item</p><input value="Rare item"></main>'
  const menu = document.querySelector('#CraftingMethod_10') as HTMLElement
  const normal = menu.querySelector('li') as HTMLElement
  stop = attachTextLayer(document, createLexicon([]), bilingual)
  expect(normal.textContent).toBe('Normal item')
  menu.classList.remove('hidden')
  await settle()
  const expected = (cn: string, en: string) => (bilingual ? `${cn} · ${en}` : cn)
  expect(normal.textContent).toBe(expected('普通物品', 'Normal item'))
  expect(menu.querySelector('[value="[10,1]"]')?.textContent).toBe(
    expected('魔法物品', 'Magic item'),
  )
  expect(menu.querySelector('[value="[10,2]"]')?.textContent).toBe(
    expected('稀有物品', 'Rare item'),
  )
  expect(document.querySelector('#OmensSelector label')?.textContent).toBe(
    expected('可用预兆', 'Available omen(s)'),
  )
  expect(document.querySelector('#OmensSelector li')?.textContent).toBe('Available omen(s)')
  expect(document.querySelector('p')?.textContent).toBe('Normal item')
  expect(document.querySelector('input')?.value).toBe('Rare item')
  expect(normal.getAttribute('value')).toBe('[10,0]')
  menu.id = 'UnrelatedMenu'
  await settle()
  expect(normal.textContent).toBe('Normal item')
  menu.id = 'CraftingMethod_10'
  await settle()
  expect(normal.textContent).toBe(expected('普通物品', 'Normal item'))
  stop()
  expect(normal.textContent).toBe('Normal item')
  expect(document.querySelector('#OmensSelector label')?.textContent).toBe('Available omen(s)')
})
