import {
  type CraftImplicitTargetValues,
  type CraftTargetDefinitionEdit,
  type CraftTargetDefinitions,
  validateStoredCraftImplicitTargets,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { ImplicitTargetEditor } from './ImplicitTargetEditor'
import { TargetValueEditor } from './TargetValueEditor'

afterEach(cleanup)
it('显式值草稿在同类型新快照和定义上下文改变后关闭，保存绑定目标 ID', () => {
  const catalog = boneCatalog(),
    state = boneState(['prefix1']),
    mod = catalog.modifiers[0]
  if (!mod) throw Error('缺少测试词缀')
  const definitions: CraftTargetDefinitions = {
    nextTargetId: 8,
    targets: [{ targetId: 't7', modId: mod.id }],
    alternatives: [],
    values: [{ targetId: 't7', modId: mod.id, bounds: [{ index: 0, min: 3 }] }],
  }
  const edits: CraftTargetDefinitionEdit[] = []
  const props = {
    catalog,
    state,
    mod,
    definitions,
    targetId: 't7',
    onEdit: (edit: CraftTargetDefinitionEdit) => edits.push(edit),
  }
  const view = render(<TargetValueEditor {...props} />)
  fireEvent.click(screen.getByLabelText('设置数值条件 prefix1'))
  fireEvent.change(screen.getByLabelText('prefix1 · 数值 1 最小值'), { target: { value: '8' } })
  view.rerender(<TargetValueEditor {...props} state={{ ...state }} />)
  expect(screen.queryByLabelText('prefix1 · 数值 1 最小值')).toBeNull()
  fireEvent.click(screen.getByLabelText('设置数值条件 prefix1'))
  expect((screen.getByLabelText('prefix1 · 数值 1 最小值') as HTMLInputElement).value).toBe('3')
  fireEvent.click(screen.getByLabelText('保存数值条件 prefix1'))
  expect(edits).toEqual([
    {
      kind: 'values',
      targetId: 't7',
      values: [{ modId: 'prefix1', bounds: [{ index: 0, min: 3 }] }],
    },
  ])
  fireEvent.click(screen.getByLabelText('设置数值条件 prefix1'))
  view.rerender(<TargetValueEditor {...props} definitions={{ ...definitions }} />)
  expect(screen.queryByLabelText('prefix1 · 数值 1 最小值')).toBeNull()
})
it('固有实际行歧义仍显示并可保存有效条件，切换快照清草稿', () => {
  const catalog = boneCatalog()
  const base = catalog.bases[0]
  if (!base) throw Error('缺少测试基底')
  base.implicit = 'Value (1-10)\nValue (1-5)'
  base.implicitTags = [[], []]
  const state = { ...boneState(), implicitLines: ['Value 3', 'Value 4'] }
  const values: CraftImplicitTargetValues[] = [
    { lineIndex: 0, basis: 'effective', bounds: [{ index: 0, min: 7 }] },
  ]
  expect(validateStoredCraftImplicitTargets(catalog, state.baseId, values).ok).toBe(true)
  const updates: CraftImplicitTargetValues[][] = []
  const props = {
    catalog,
    state,
    values,
    onChange: (next: CraftImplicitTargetValues[]) => updates.push(next),
  }
  const view = render(<ImplicitTargetEditor {...props} />)
  const field = () => screen.getByLabelText('固有属性 1 · 数值 1 下限') as HTMLInputElement
  expect(field().value).toBe('7')
  fireEvent.change(field(), { target: { value: '6' } })
  fireEvent.click(screen.getByLabelText('保存固有属性 1 条件'))
  expect(updates).toEqual([[{ lineIndex: 0, basis: 'effective', bounds: [{ index: 0, min: 6 }] }]])
  view.rerender(<ImplicitTargetEditor {...props} state={{ ...state }} />)
  expect(field().value).toBe('7')
  view.rerender(<ImplicitTargetEditor {...props} />)
  fireEvent.change(field(), { target: { value: '8' } })
  view.rerender(<ImplicitTargetEditor {...props} context={{ nextTargetId: 3 }} />)
  expect(field().value).toBe('7')
  fireEvent.click(screen.getByLabelText('清空固有属性 1 条件'))
  expect(updates[1]).toEqual([])
})
