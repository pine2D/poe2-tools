import { exportCraftItemText } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { catalog, state } from '../../../../packages/item-core/src/partialTargetFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
it('祝福草稿只展示固有范围，实际应用计费并可撤销恢复', () => {
  const cat = catalog(undefined, { implicit: '(1-10)% rarity' })
  const initialState = { ...state('rare', ['p1', 's1']), implicitLines: ['2% rarity'] }
  const exported = exportCraftItemText(cat, initialState)
  if (!exported.ok) throw new Error(exported.error)
  initialState.sourceText = exported.value.text
  render(
    <RehearsalPanel
      catalog={cat}
      initialState={initialState}
      translations={{ 'Omen of the Blessed': '祝福预兆' }}
    />,
  )
  fireEvent.change(screen.getByLabelText('本次搭配预兆'), { target: { value: 'blessed' } })
  click('神圣石')
  expect(screen.queryByLabelText('p1 · 数值 1')).toBeNull()
  expect(screen.queryByLabelText('s1 · 数值 1')).toBeNull()
  fireEvent.change(screen.getByLabelText('固有属性 · 数值 1'), { target: { value: '9' } })
  click('应用本次结果')
  expect(screen.getByText('神圣石 × 1')).toBeDefined()
  expect(screen.getByText('祝福预兆 × 1')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v67')
  expect(saved.operations).toEqual([
    { currency: 'divine', omen: 'blessed', modIds: [], rolls: [], implicitValues: [9] },
  ])
  click('撤销')
  click('恢复本机演练')
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations).toEqual(
    saved.operations,
  )
})
