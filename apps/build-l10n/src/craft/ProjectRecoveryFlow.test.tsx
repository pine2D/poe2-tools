import { CRAFT_RULES_VERSION, loadTargetWorkbenchProject } from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { catalog as makeCatalog } from '../../../../packages/item-core/src/partialTargetFixture'
import { ProjectControls, REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RECOVERY_KEY, readRecovery } from './projectRecovery'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'locks')
})
it('自动保存撤销位置后的完整未来、目标与报价，空白入口严格恢复且不触碰手动存档', async () => {
  vi.useFakeTimers()
  localStorage.clear()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_key: string, action: () => unknown) => action(),
    },
  })
  const catalog = makeCatalog(undefined, { socketLimit: null })
  const loaded = loadTargetWorkbenchProject(
    JSON.stringify({
      schemaVersion: 1,
      rulesVersion: CRAFT_RULES_VERSION,
      sourceCommit: catalog._meta.sourceCommit,
      initialState: {
        baseId: 'Focus',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
      },
      operations: [{ currency: 'transmutation', modIds: ['p1'] }],
      cursor: 0,
      targetModIds: ['p1'],
      pricing: { unit: 'divine', prices: {}, baseCost: 2 },
    }),
    catalog,
  )
  if (!loaded.ok) throw Error(loaded.error)
  localStorage.setItem(REHEARSAL_PROJECT_KEY, 'manual backup')
  const onRestore = vi.fn()
  const first = render(
    <ProjectControls catalog={catalog} project={loaded.value.project} onRestore={onRestore} />,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
  const saved = readRecovery(localStorage.getItem(RECOVERY_KEY))
  expect(saved).not.toBeNull()
  expect(JSON.parse(saved?.text ?? '')).toEqual(loaded.value.project)
  first.unmount()
  render(<ProjectControls catalog={catalog} onRestore={onRestore} />)
  fireEvent.click(screen.getByRole('button', { name: '恢复自动保存的演练' }))
  expect(onRestore).toHaveBeenCalledWith(loaded.value)
  expect(onRestore.mock.calls[0]?.[0].states).toHaveLength(2)
  expect(onRestore.mock.calls[0]?.[0].project.cursor).toBe(0)
  expect(localStorage.getItem(REHEARSAL_PROJECT_KEY)).toBe('manual backup')
})
