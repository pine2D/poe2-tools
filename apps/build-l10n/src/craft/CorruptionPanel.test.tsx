import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { CORRUPTION_SOURCE, type CraftCatalog } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('瓦尔加孔预览、取消、镶嵌、保存及撤销恢复腐化限制', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ 'Vaal Orb': '瓦尔石' }}
      initialState={{
        baseId: 'Crude Bow',
        itemLevel: 86,
        rarity: 'normal',
        quality: 20,
        sourceText: null,
        affixes: [],
        sockets: [null, null, null],
      }}
    />,
  )
  click('预演腐化：增加一孔')
  expect(screen.getByRole('region', { name: '腐化结果草稿' })).toBeDefined()
  expect((screen.getByLabelText('选择镶嵌符文') as HTMLSelectElement).disabled).toBe(true)
  click('取消腐化结果')
  expect(screen.queryByRole('region', { name: '腐化状态' })).toBeNull()
  click('预演腐化：增加一孔')
  click('应用腐化结果')
  expect(screen.getByRole('region', { name: '腐化状态' })).toBeDefined()
  expect((screen.getByRole('button', { name: '蜕变石' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: '巧匠石：添加一个孔' })).toBeNull()
  fireEvent.change(screen.getByLabelText('目标孔位'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('选择镶嵌符文'), {
    target: { value: 'pob2:augment:["Soul Core of Quipolatl","weapon"]' },
  })
  click('应用镶嵌')
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.operations).toEqual([
    { kind: 'vaal', outcome: 'socket' },
    {
      kind: 'socket',
      socketIndex: 3,
      augmentId: 'pob2:augment:["Soul Core of Quipolatl","weapon"]',
    },
  ])
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v60')
  click('撤销')
  expect(screen.getByRole('region', { name: '腐化状态' })).toBeDefined()
  click('撤销')
  expect(screen.queryByRole('region', { name: '腐化状态' })).toBeNull()
  expect((screen.getByRole('button', { name: '蜕变石' }) as HTMLButtonElement).disabled).toBe(false)
  click('重做')
  expect(screen.getByRole('region', { name: '腐化状态' })).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByRole('heading', { name: /孔位 4 · Soul Core of Quipolatl/ })).toBeDefined()
})

it('指定腐化属性及掷值，预览取消不消耗；应用、撤销、保存恢复独立强化层', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ 'Vaal Orb': '瓦尔石' }}
      initialState={{
        baseId: 'Crude Bow',
        itemLevel: 86,
        rarity: 'normal',
        quality: 20,
        sourceText: null,
        affixes: [],
        sockets: [],
      }}
    />,
  )
  fireEvent.change(screen.getByLabelText('选择腐化强化'), {
    target: { value: 'CorruptionLocalAddedChaosDamage1' },
  })
  fireEvent.change(screen.getByLabelText('腐化强化 · 数值 1'), { target: { value: '10' } })
  fireEvent.change(screen.getByLabelText('腐化强化 · 数值 2'), { target: { value: '16' } })
  click('预演腐化：新增强化属性')
  click('展开前后变化')
  expect(screen.getByRole('heading', { name: '腐化强化变化' })).toBeDefined()
  click('取消腐化结果')
  expect(screen.queryByRole('region', { name: '腐化状态' })).toBeNull()
  click('预演腐化：新增强化属性')
  click('应用腐化结果')
  expect(screen.getByRole('article', { name: '当前腐化强化' }).textContent).toContain(
    'Adds 10(7-11) to 16(12-18) Chaos damage',
  )
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.corruptionSourceHash).toBe(CORRUPTION_SOURCE.sha256)
  expect(saved.operations).toEqual([
    {
      kind: 'vaal',
      outcome: 'enchant',
      modId: 'CorruptionLocalAddedChaosDamage1',
      values: [10, 16],
    },
  ])
  click('撤销')
  expect(screen.queryByRole('article', { name: '当前腐化强化' })).toBeNull()
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').corruptionSourceHash).toBe(
    CORRUPTION_SOURCE.sha256,
  )
  click('恢复本机演练')
  click('重做')
  expect(screen.getByRole('article', { name: '当前腐化强化' })).toBeDefined()
})
