import {
  applyCraftStep,
  type BoneCraftOperation,
  type CraftResult,
  type CraftState,
  enableCraftAffixIdentity,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { BoneOperationDetails } from './BoneAdvicePanel'
import { BoneCraftPanel } from './BoneCraftPanel'

const emptyDefinitions = { nextTargetId: 1, targets: [], alternatives: [], values: [] }

afterEach(cleanup)
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const catalog = boneCatalog()
const full = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

it.each([false, true])('骨骼移除保留完整实例选择，预演不修改输入（身份=%s）', (identified) => {
  const state = identified ? must(enableCraftAffixIdentity(catalog, full)) : full
  const before = structuredClone(state)
  const onPreview = vi.fn<(step: BoneCraftOperation) => void>()
  render(
    <BoneCraftPanel
      definitions={emptyDefinitions}
      catalog={catalog}
      state={state}
      translations={{}}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  fireEvent.click(screen.getByLabelText('骨骼移除 suffix2'))
  expect((screen.getByLabelText('占用后缀') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('占用前缀') as HTMLInputElement).disabled).toBe(true)
  click('预览骨骼结果')
  const expected: BoneCraftOperation = {
    kind: 'desecrate',
    boneId: 'preserved_rib',
    affixKind: 'suffix',
    removeModId: 'suffix2',
    ...(identified ? { removeAffixId: 'a5' } : {}),
  }
  expect(onPreview).toHaveBeenCalledWith(expected)
  const after = must(applyCraftStep(catalog, state, expected))
  expect(after.affixes).toEqual(state.affixes.filter((_, index) => index !== 4))
  expect(after.nextAffixId).toBe(state.nextAffixId)
  expect(state).toEqual(before)
})

it('同类型不同实例的上下文清除旧骨骼移除选择', () => {
  const state = must(enableCraftAffixIdentity(catalog, full))
  const props = { catalog, state, translations: {}, disabled: false, onPreview: vi.fn() }
  const { rerender } = render(<BoneCraftPanel definitions={emptyDefinitions} {...props} />)
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  fireEvent.click(screen.getByLabelText('骨骼移除 suffix2'))
  const replacement: CraftState = {
    ...state,
    nextAffixId: 10,
    affixes: state.affixes.map((affix, index) =>
      index === 4 ? { ...affix, affixId: 'a9' } : affix,
    ),
  }
  rerender(<BoneCraftPanel definitions={emptyDefinitions} {...props} state={replacement} />)
  expect((screen.getByRole('button', { name: '预览骨骼结果' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  expect((screen.getByLabelText('骨骼移除 suffix2') as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByLabelText('骨骼移除 suffix2'))
  click('预览骨骼结果')
  expect(props.onPreview).toHaveBeenCalledWith(
    expect.objectContaining({ removeModId: 'suffix2', removeAffixId: 'a9' }),
  )
})

it.each([false, true])(
  '占位、候选、重选、揭示使用目录 ID，状态切换清除旧草稿（身份=%s）',
  (identified) => {
    let state = identified
      ? must(enableCraftAffixIdentity(catalog, boneState(['prefix1'])))
      : boneState(['prefix1'])
    const onPreview = vi.fn<(step: BoneCraftOperation) => void>()
    const props = { catalog, translations: {}, disabled: false, onPreview }
    const { rerender } = render(
      <BoneCraftPanel definitions={emptyDefinitions} {...props} state={state} />,
    )
    const apply = () => {
      const operation = onPreview.mock.calls.at(-1)?.[0]
      if (!operation) throw Error('缺少预演操作')
      expect(JSON.stringify(operation)).not.toMatch(/affixId|removeAffixId/)
      state = must(applyCraftStep(catalog, state, operation))
      rerender(<BoneCraftPanel definitions={emptyDefinitions} {...props} state={state} />)
    }
    fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
    fireEvent.click(screen.getByLabelText('占用后缀'))
    click('预览骨骼结果')
    apply()
    fireEvent.click(screen.getByLabelText('首次揭示使用深渊回响'))
    for (const modId of ['suffix1', 'suffix2', 'exclusive1'])
      fireEvent.click(screen.getByLabelText(`候选 ${modId}`))
    click('预览三项候选')
    apply()
    expect(state.nextAffixId).toBe(identified ? 2 : undefined)
    click('指定第二组三项')
    for (const modId of ['exclusive1', 'exclusive2', 'exclusive3'])
      fireEvent.click(screen.getByLabelText(`第二组候选 ${modId}`))
    click('预览第二组三项')
    expect(onPreview).toHaveBeenLastCalledWith({
      kind: 'desecration-reroll',
      modIds: ['exclusive1', 'exclusive2', 'exclusive3'],
    })
    apply()
    expect(state.nextAffixId).toBe(identified ? 2 : undefined)
    click('第二组：选择揭示 exclusive1')
    fireEvent.change(screen.getByLabelText('exclusive1 · 数值 1'), { target: { value: '7' } })
    click('预览揭示结果')
    expect(onPreview).toHaveBeenLastCalledWith({
      kind: 'desecration-reveal',
      modId: 'exclusive1',
      values: [7],
    })
    apply()
    expect(state.affixes.at(-1)).toMatchObject({
      modId: 'exclusive1',
      desecrated: true,
      ...(identified ? { affixId: 'a2' } : {}),
    })
  },
)

it('骨骼移除详情按实例显示实际行，不退回错误类型选择', () => {
  const state = must(enableCraftAffixIdentity(catalog, full))
  const operation: BoneCraftOperation = {
    kind: 'desecrate',
    boneId: 'preserved_rib',
    affixKind: 'suffix',
    removeModId: 'suffix2',
    removeAffixId: 'a5',
  }
  const { rerender } = render(
    <BoneOperationDetails catalog={catalog} state={state} operation={operation} />,
  )
  expect(screen.getByLabelText('本次骨骼移除词缀').textContent).toContain('suffix2 5')
  rerender(
    <BoneOperationDetails
      catalog={catalog}
      state={state}
      operation={{ ...operation, removeAffixId: 'a4' }}
    />,
  )
  expect(screen.queryByLabelText('本次骨骼移除词缀')).toBeNull()
})
