import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { CORRUPTION_SOURCE, type CraftCatalog, JEWEL_SOURCE } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(
  readFileSync(
    resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/craft/catalog.json'),
    'utf8',
  ),
)
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

it('搜索珠宝可预演强化，撤销消费、保存恢复并继续建筑师制作', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ 'Vaal Orb': '瓦尔石', "Architect's Orb": '建筑师宝珠' }}
      initialState={{
        baseId: 'Sapphire',
        itemLevel: 86,
        rarity: 'normal',
        sourceText: null,
        affixes: [],
      }}
    />,
  )
  const panel = screen.getByRole('region', { name: '瓦尔结果预演' })
  expect(within(panel).queryByRole('button', { name: '预演腐化：增加一孔' })).toBeNull()
  expect(panel.textContent).toContain('随机增加或移除词缀尚未接入')
  fireEvent.change(screen.getByLabelText('选择腐化强化'), {
    target: { value: 'CorruptionJewelStrength1' },
  })
  click('预演腐化：新增强化属性')
  expect(screen.queryByText('瓦尔石 × 1')).toBeNull()
  click('应用腐化结果')
  expect(screen.getByLabelText('当前腐化强化').textContent).toContain('+4(4-6) to Strength')
  expect(screen.getByText('瓦尔石 × 1')).toBeDefined()
  click('撤销')
  expect(screen.queryByText('瓦尔石 × 1')).toBeNull()
  click('重做')
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.jewelSourceHash).toBe(JEWEL_SOURCE.sha256)
  expect(saved.corruptionSourceHash).toBe(CORRUPTION_SOURCE.sha256)
  click('撤销')
  click('恢复本机演练')
  expect(screen.getByLabelText('当前腐化强化')).toBeDefined()
  fireEvent.change(screen.getByLabelText('选择建筑师强化'), {
    target: { value: 'CorruptionJewelDexterity1' },
  })
  click('预演建筑师：新增强化')
  click('应用建筑师强化结果')
  expect(screen.getByRole('heading', { name: '已二重腐化' })).toBeDefined()
  expect(screen.getByText('建筑师宝珠 × 1')).toBeDefined()
})
