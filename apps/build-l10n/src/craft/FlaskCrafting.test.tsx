import { readFileSync } from 'node:fs'
import { type CraftCatalog, parseTargetCraftProject } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const source = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')) as CraftCatalog
const catalog: CraftCatalog = {
  ...source,
  bases: source.bases.filter((base) => base.type === 'Flask'),
  modifiers: source.modifiers.filter((mod) =>
    ['FlaskIncreasedRecoveryAmount1', 'FlaskChargesUsed1'].includes(mod.id),
  ),
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const save = () => {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('药剂起点最多声明20品质，蜕变增幅、撤销及完整未来均按v106恢复', () => {
  const base = catalog.bases[0]
  if (!base) throw Error('药剂基底缺失')
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={86}
      imported={undefined}
      dictionary={undefined}
      translations={{}}
      translateLine={(line) => line}
      onRestore={vi.fn()}
    />,
  )
  const quality = screen.getByLabelText('起点已有品质') as HTMLSelectElement
  expect(quality.querySelector('option[value="21"]')).toBeNull()
  fireEvent.change(quality, { target: { value: '20' } })
  click('从空白基底开始')
  expect(save().initialState.quality).toBe(20)
  expect(screen.getByLabelText('药剂效果估算')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), {
    target: { value: 'FlaskIncreasedRecoveryAmount1' },
  })
  click('加入目标 FlaskIncreasedRecoveryAmount1')
  expect(save().targetDefinitions.targets).toEqual([
    { targetId: 't1', modId: 'FlaskIncreasedRecoveryAmount1' },
  ])
  click('蜕变石')
  click(/^FlaskIncreasedRecoveryAmount1 ·/)
  click('应用本次结果')
  click('增幅石')
  click(/^FlaskChargesUsed1 ·/)
  click('应用本次结果')
  click('撤销')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-17-v106')
  expect(saved.cursor).toBe(1)
  expect(saved.operations).toHaveLength(2)
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  click('恢复本机演练')
  click('重做')
  expect(save().cursor).toBe(2)
  expect((screen.getByRole('button', { name: '富豪石' }) as HTMLButtonElement).disabled).toBe(true)
})
