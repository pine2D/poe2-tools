import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  loadWorkbenchProject,
  TARGET_CRAFT_RULES_VERSION,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  catalog as makeCatalog,
  state,
} from '../../../../packages/item-core/src/partialTargetFixture'
import { ProjectControls, REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog = makeCatalog()
function legacy(): CraftProject {
  return {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: state('normal'),
    cursor: 1,
    operations: [
      { currency: 'transmutation', modIds: ['p1'], rolls: [{ modId: 'p1', values: [5] }] },
      { currency: 'augmentation', modIds: ['s1'], rolls: [{ modId: 's1', values: [7] }] },
    ],
  }
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('本机旧项目一次升级全部未来历史，恢复游标保持原位置', () => {
  localStorage.setItem(REHEARSAL_PROJECT_KEY, JSON.stringify(legacy()))
  const onRestore = vi.fn()
  render(<ProjectControls catalog={catalog} onRestore={onRestore} />)
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(onRestore).toHaveBeenCalledWith(
    expect.objectContaining({
      project: expect.objectContaining({ rulesVersion: TARGET_CRAFT_RULES_VERSION, cursor: 1 }),
      states: [
        expect.objectContaining({ nextAffixId: 1 }),
        expect.objectContaining({ nextAffixId: 2 }),
        expect.objectContaining({
          nextAffixId: 3,
          affixes: [
            expect.objectContaining({ affixId: 'a1', modId: 'p1' }),
            expect.objectContaining({ affixId: 'a2', modId: 's1' }),
          ],
        }),
      ],
    }),
  )
})
it('新项目保存完整未来步骤，恢复时错误ID不能降级修复', () => {
  const loaded = loadWorkbenchProject(JSON.stringify(legacy()), catalog)
  if (!loaded.ok) throw Error(loaded.error)
  const onRestore = vi.fn()
  render(<ProjectControls catalog={catalog} project={loaded.value.project} onRestore={onRestore} />)
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const text = localStorage.getItem(REHEARSAL_PROJECT_KEY)
  expect(text).not.toBeNull()
  const saved = JSON.parse(text ?? '{}')
  expect(saved.rulesVersion).toBe(TARGET_CRAFT_RULES_VERSION)
  expect(saved.cursor).toBe(1)
  expect(saved.operations[1].rolls[0].affixId).toBe('a2')
  saved.operations[1].rolls[0].affixId = 'a1'
  localStorage.setItem(REHEARSAL_PROJECT_KEY, JSON.stringify(saved))
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(onRestore).not.toHaveBeenCalled()
  expect(screen.getByText(/不能自动补全或修复/)).toBeTruthy()
})
it('新会话从空白基底启用身份，实际制作后可保存v74再撤销恢复', () => {
  render(<RehearsalPanel catalog={catalog} initialState={state('normal')} translations={{}} />)
  fireEvent.click(screen.getByRole('button', { name: '蜕变石' }))
  fireEvent.click(screen.getByRole('button', { name: /^p1 ·/ }))
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const text = localStorage.getItem(REHEARSAL_PROJECT_KEY)
  expect(text).not.toBeNull()
  const saved = JSON.parse(text ?? '{}')
  expect(saved.rulesVersion).toBe(TARGET_CRAFT_RULES_VERSION)
  expect(saved.initialState.nextAffixId).toBe(1)
  expect(saved.operations[0].rolls[0].affixId).toBe('a1')
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText('演练项目已恢复。')).toBeTruthy()
  expect(screen.getByText('蜕变石 × 1')).toBeTruthy()
})
