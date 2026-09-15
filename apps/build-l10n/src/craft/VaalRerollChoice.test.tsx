import {
  applyCraftStep,
  type CraftResult,
  type CraftState,
  enableCraftAffixIdentity,
  type VaalCraftOperation,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { VaalRerollChoice } from './VaalRerollChoice'

afterEach(cleanup)
const catalog = boneCatalog()
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function select(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
function replace(remove: string, add: string, value: string) {
  select('腐化重选：移除词缀', remove)
  select('腐化重选：加入词缀', add)
  select('腐化重选 · 数值 1', value)
  fireEvent.click(screen.getByRole('button', { name: '确认本次替换' }))
}

it.each([false, true])(
  '瓦尔顺序替换绑定每轮实例，撤回清选择且不消费游标（身份=%s）',
  (identified) => {
    const legacy = boneState(['prefix1', 'suffix1'])
    const state = identified
      ? { ...must(enableCraftAffixIdentity(catalog, legacy)), nextAffixId: 9 }
      : legacy
    const before = structuredClone(state)
    const onPreview = vi.fn<(step: VaalCraftOperation) => void>()
    render(
      <VaalRerollChoice catalog={catalog} state={state} disabled={false} onPreview={onPreview} />,
    )
    replace(identified ? 'a1' : 'prefix1', 'prefix2', '7')
    replace(identified ? 'a9' : 'prefix2', 'prefix1', '8')
    const rows = within(screen.getByRole('list', { name: '腐化替换顺序' })).getAllByRole('listitem')
    expect(rows[0]?.textContent).toContain('移除：prefix1 5')
    expect(rows[1]?.textContent).toContain('移除：prefix2 7(1-10)')
    fireEvent.click(screen.getByRole('button', { name: '撤回最后一次替换' }))
    expect((screen.getByLabelText('腐化重选：移除词缀') as HTMLSelectElement).value).toBe('')
    expect(screen.queryByLabelText('腐化重选：加入词缀')).toBeNull()
    replace(identified ? 'a9' : 'prefix2', 'prefix3', '6')
    fireEvent.click(screen.getByRole('button', { name: '预演腐化：重选词缀' }))
    const expected: VaalCraftOperation = {
      kind: 'vaal',
      outcome: 'reroll',
      replacements: [
        {
          removeModId: 'prefix1',
          ...(identified ? { removeAffixId: 'a1' } : {}),
          modId: 'prefix2',
          values: [7],
        },
        {
          removeModId: 'prefix2',
          ...(identified ? { removeAffixId: 'a9' } : {}),
          modId: 'prefix3',
          values: [6],
        },
      ],
    }
    expect(onPreview).toHaveBeenCalledWith(expected)
    const after = must(applyCraftStep(catalog, state, expected))
    expect(after.affixes.at(-1)).toMatchObject({
      modId: 'prefix3',
      ...(identified ? { affixId: 'a10' } : {}),
    })
    expect(after.nextAffixId).toBe(identified ? 11 : undefined)
    expect(state).toEqual(before)
  },
)

it('同类型不同实例上下文清除选择和替换顺序，不清同上下文的临时禁用', () => {
  const state = {
    ...must(enableCraftAffixIdentity(catalog, boneState(['prefix1', 'suffix1']))),
    nextAffixId: 9,
  }
  const props = { catalog, state, disabled: false, onPreview: vi.fn() }
  const { rerender } = render(<VaalRerollChoice {...props} />)
  replace('a1', 'prefix2', '7')
  rerender(<VaalRerollChoice {...props} disabled={true} />)
  expect(screen.getByRole('list', { name: '腐化替换顺序' }).children).toHaveLength(1)
  const next: CraftState = {
    ...state,
    affixes: state.affixes.map((affix, index) =>
      index === 0 ? { ...affix, affixId: 'a8' } : affix,
    ),
  }
  rerender(<VaalRerollChoice {...props} state={next} />)
  expect(screen.queryByRole('list', { name: '腐化替换顺序' })).toBeNull()
  expect((screen.getByLabelText('腐化重选：移除词缀') as HTMLSelectElement).value).toBe('')
  expect(
    (screen.getByRole('button', { name: '预演腐化：重选词缀' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  replace('a8', 'prefix3', '6')
  fireEvent.click(screen.getByRole('button', { name: '预演腐化：重选词缀' }))
  expect(props.onPreview).toHaveBeenCalledWith(
    expect.objectContaining({
      replacements: [expect.objectContaining({ removeModId: 'prefix1', removeAffixId: 'a8' })],
    }),
  )
})
