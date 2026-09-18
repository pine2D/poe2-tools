import { loadTargetWorkbenchProject } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const emptyDefinitions = { nextTargetId: 1, targets: [], alternatives: [], values: [] }
const translations = {}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('恢复空 v124 项目后网页保存不降版', () => {
  const catalog = boneCatalog('Ring')
  const { sockets: _, ...initial } = boneState()
  const initialState = { ...initial, rarity: 'normal' as const, nextAffixId: 1 }
  const loaded = loadTargetWorkbenchProject(
    JSON.stringify({
      schemaVersion: 1,
      rulesVersion: 'basic-2026-09-18-v124',
      sourceCommit: catalog._meta.sourceCommit,
      initialState,
      operations: [],
      cursor: 0,
      targetDefinitions: emptyDefinitions,
      orphanedTargets: [],
    }),
    catalog,
  )
  if (!loaded.ok) throw Error(loaded.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initialState}
      initialProject={loaded.value}
      translations={translations}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').rulesVersion).toBe(
    'basic-2026-09-18-v124',
  )
})
