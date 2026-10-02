import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it('六条操作说明保留键鼠图标与按住语义，关闭后逐字恢复', () => {
  document.body.innerHTML = `<main><div id="instructions">
  <p><b>Hover</b> over an item and <img src="left.webp"> to <strong>apply</strong> the currently selected crafting method to it.</p>
  <p>Hold <img src="alt.webp"> to toggle between <b>advanced</b> and <b>classic</b> modifier descriptions for items.</p>
  <p>Hold <img src="shift.webp"> to force <b>tooltips</b> to stay visible and enable the ability to drill-down.</p>
  <p>Hit <img src="ctrl.webp"> + <b>Z</b> to <strong>revert</strong> emulator actions.</p>
  <p>Left <img src="left.webp"> to <b>add</b> or <b>remove</b> modifiers from the modpool to the current item.</p>
  <p>Right <img src="right.webp"> to access the context menu <b>options</b> for elements.</p>
  </div><p id="outside">Hold</p></main>`
  const root = document.querySelector('#instructions') as HTMLElement
  const original = root.innerHTML
  const images = [...root.querySelectorAll('img')]
  stop = attachTextLayer(document, createLexicon([]))
  const rows = [...root.querySelectorAll('p')].map((e) =>
    e.textContent?.replace(/\s+/g, ' ').trim(),
  )
  expect(rows).toEqual([
    '悬停 在物品上并点击 即可 应用 当前选中的制作方式。',
    '按住 可切换 高级 与 经典 物品词缀说明。',
    '按住 可固定显示 提示框 并允许查看更深层的详情。',
    '按下 + Z 即可 撤销 制作演练操作。',
    '在词缀池中左键点击 即可 添加 或 移除 当前物品的词缀。',
    '右键点击 可打开元素的右键菜单 选项 。',
  ])
  expect([...root.querySelectorAll('img')]).toEqual(images)
  expect(document.querySelector('#outside')?.textContent).toBe('Hold')
  stop()
  expect(root.innerHTML).toBe(original)
})
