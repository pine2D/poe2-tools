import { readFileSync } from 'node:fs'
import type { CraftCatalog } from '@poe2-tools/item-core'
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
it('恢复空 v126 项目后网页保存不降版', () => {
  const catalog = boneCatalog('Ring')
  const { sockets: _, ...initial } = boneState()
  const initialState = { ...initial, rarity: 'normal' as const, nextAffixId: 1 }
  const loaded = loadTargetWorkbenchProject(
    JSON.stringify({
      schemaVersion: 1,
      rulesVersion: 'basic-2026-09-18-v126',
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
    'basic-2026-09-18-v126',
  )
})

it('普通长杖镶入专属符文后保存双来源指纹并可恢复', () => {
  const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
  const initialState = {
    baseId: 'Ashen Staff',
    itemLevel: 86,
    rarity: 'normal' as const,
    sourceText: null,
    affixes: [],
    sockets: [null, null],
    implicitLines: ['Grants Skill: Level 12 Firebolt'],
    nextAffixId: 1,
  }
  render(
    <RehearsalPanel catalog={catalog} initialState={initialState} translations={translations} />,
  )
  fireEvent.change(screen.getByRole('combobox', { name: '选择镶嵌符文' }), {
    target: { value: 'pob2:augment:["Ancient Rune of Discovery","staff"]' },
  })
  fireEvent.click(screen.getByRole('button', { name: '应用镶嵌' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const raw = localStorage.getItem(REHEARSAL_PROJECT_KEY)
  expect(raw).not.toBeNull()
  const saved = JSON.parse(raw ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-18-v126')
  expect(saved.scalabilitySourceHash).toBe(
    catalog._meta.sources.find((s) => s.path === 'src/Data/ModScalability.lua')?.sha256,
  )
  expect(loadTargetWorkbenchProject(raw ?? '', catalog).ok).toBe(true)
})
