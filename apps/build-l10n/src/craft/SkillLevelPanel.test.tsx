import type { CraftState } from '@poe2-tools/item-core'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { catalog, mod } from '../../../../packages/item-core/src/partialTargetFixture'
import { SkillLevelPanel } from './SkillLevelPanel'

afterEach(cleanup)
const source = catalog([
  mod('minion', 'suffix', { lines: ['+(1-4) to Level of all Minion Skills'] }),
])
const state: CraftState = {
  baseId: 'Focus',
  rarity: 'rare',
  itemLevel: 86,
  sourceText: null,
  affixes: [{ modId: 'minion', lines: ['+1 to Level of all Minion Skills'] }],
}
it('移除预览显示 +1 到 0，保存后仍保留本步变化；无相关词缀时隐藏面板', () => {
  const after = { ...state, affixes: [] }
  const { rerender } = render(
    <SkillLevelPanel catalog={source} current={state} before={state} after={after} preview />,
  )
  const panel = screen.getByRole('region', { name: '技能等级词缀贡献' })
  expect(within(panel).getByText('所有召唤生物技能')).toBeDefined()
  expect(within(panel).getByText(/应用后预计：\+1 → 0/)).toBeDefined()
  rerender(
    <SkillLevelPanel
      catalog={source}
      current={after}
      before={state}
      after={after}
      preview={false}
    />,
  )
  expect(screen.getByText(/本步变化：\+1 → 0/)).toBeDefined()
  rerender(<SkillLevelPanel catalog={source} current={after} preview={false} />)
  expect(screen.queryByRole('region', { name: '技能等级词缀贡献' })).toBeNull()
})
it('未掷范围显示未知，不显示 +1 或 +4', () => {
  render(
    <SkillLevelPanel
      catalog={source}
      current={{
        ...state,
        affixes: [{ modId: 'minion', lines: ['+(1-4) to Level of all Minion Skills'] }],
      }}
      preview={false}
    />,
  )
  expect(screen.getByText('未知')).toBeDefined()
  expect(screen.queryByText('+1')).toBeNull()
  expect(screen.queryByText('+4')).toBeNull()
})
