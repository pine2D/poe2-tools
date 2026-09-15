import {
  type CraftResult,
  createCraftState,
  type ExtractedCraftTargets,
  enableCraftAffixIdentity,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { TargetExtractionPanel } from './TargetExtractionPanel'

afterEach(cleanup)

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

const catalog = boneCatalog()
function fixture() {
  const state = boneState(['prefix1', 'suffix1'])
  state.affixes[1] = { modId: 'suffix1', lines: ['suffix1 8'], fractured: true }
  return value(createCraftState(catalog, state))
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement

describe('TargetExtractionPanel 实例选择', () => {
  it('真实已识别装备默认全选，取消第一实例后只提取第二实例的基础值和破裂要求', () => {
    const state = value(enableCraftAffixIdentity(catalog, fixture()))
    const before = structuredClone(state)
    const applied: ExtractedCraftTargets[] = []
    render(
      <TargetExtractionPanel
        catalog={catalog}
        state={state}
        busy={false}
        onApply={(targets) => applied.push(targets)}
      />,
    )
    click('从当前装备提取目标')
    expect(checkbox('提取词缀 prefix1 · a1').checked).toBe(true)
    expect(checkbox('提取词缀 suffix1 · a2').checked).toBe(true)
    fireEvent.click(checkbox('提取词缀 prefix1 · a1'))
    fireEvent.click(checkbox('复制基础数值为精确条件'))
    fireEvent.click(checkbox('保留所选词缀的破裂要求'))
    click('用所选词缀替换显式目标')
    expect(applied).toEqual([
      {
        targetModIds: ['suffix1'],
        targetValues: [{ modId: 'suffix1', bounds: [{ index: 0, min: 8, max: 8 }] }],
        targetFracturedModId: 'suffix1',
      },
    ])
    expect(screen.queryByRole('group', { name: '提取制作目标' })).toBeNull()
    expect(state).toEqual(before)
  })

  it('同类型换新实例快照关闭草稿，重开恢复全选及默认选项', () => {
    const state = value(enableCraftAffixIdentity(catalog, fixture()))
    const applied: ExtractedCraftTargets[] = []
    const onApply = (targets: ExtractedCraftTargets) => applied.push(targets)
    const view = render(
      <TargetExtractionPanel catalog={catalog} state={state} busy={false} onApply={onApply} />,
    )
    click('从当前装备提取目标')
    fireEvent.click(checkbox('提取词缀 prefix1 · a1'))
    fireEvent.click(checkbox('复制基础数值为精确条件'))
    fireEvent.click(checkbox('保留所选词缀的破裂要求'))
    const next = value(
      createCraftState(catalog, {
        ...state,
        nextAffixId: 4,
        affixes: state.affixes.map((affix) =>
          affix.affixId === 'a1' ? { ...affix, affixId: 'a3' } : affix,
        ),
      }),
    )
    view.rerender(
      <TargetExtractionPanel catalog={catalog} state={next} busy={false} onApply={onApply} />,
    )
    expect(screen.queryByRole('group', { name: '提取制作目标' })).toBeNull()
    expect(applied).toEqual([])
    click('从当前装备提取目标')
    expect(screen.queryByRole('checkbox', { name: '提取词缀 prefix1 · a1' })).toBeNull()
    expect(checkbox('提取词缀 prefix1 · a3').checked).toBe(true)
    expect(checkbox('提取词缀 suffix1 · a2').checked).toBe(true)
    expect(checkbox('复制基础数值为精确条件').checked).toBe(false)
    expect(checkbox('保留所选词缀的破裂要求').checked).toBe(false)
    click('用所选词缀替换显式目标')
    expect(applied).toEqual([{ targetModIds: ['prefix1', 'suffix1'], targetValues: [] }])
  })

  it('legacy 保留标签与输出；取消不应用，未选词缀不能确认', () => {
    const applied: ExtractedCraftTargets[] = []
    render(
      <TargetExtractionPanel
        catalog={catalog}
        state={fixture()}
        busy={false}
        onApply={(targets) => applied.push(targets)}
      />,
    )
    click('从当前装备提取目标')
    fireEvent.click(checkbox('复制基础数值为精确条件'))
    click('取消提取')
    expect(applied).toEqual([])
    click('从当前装备提取目标')
    fireEvent.click(checkbox('提取词缀 prefix1'))
    fireEvent.click(checkbox('提取词缀 suffix1'))
    expect(
      (screen.getByRole('button', { name: '用所选词缀替换显式目标' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    fireEvent.click(checkbox('提取词缀 suffix1'))
    fireEvent.click(checkbox('复制基础数值为精确条件'))
    fireEvent.click(checkbox('保留所选词缀的破裂要求'))
    click('用所选词缀替换显式目标')
    expect(applied).toEqual([
      {
        targetModIds: ['suffix1'],
        targetValues: [{ modId: 'suffix1', bounds: [{ index: 0, min: 8, max: 8 }] }],
        targetFracturedModId: 'suffix1',
      },
    ])
  })
})
