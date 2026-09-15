import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  applyCraftStep,
  CRAFT_RULES_VERSION,
  type CraftCatalog,
  type CraftDefinitionRoutes,
  type CraftResult,
  type LiquidEmotionCraftOperation,
  loadWorkbenchProject,
  parseCraftProject,
  parseTargetCraftProject,
  TARGET_CRAFT_RULES_VERSION,
} from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { RehearsalPanel } from './RehearsalPanel'
import { TargetRoutesPanel } from './TargetRoutesPanel'

const pending = vi.hoisted(() => ({
  callback: null as null | ((result: CraftResult<CraftDefinitionRoutes>) => void),
}))
vi.mock('./targetRoutesWorkerClient', () => ({
  requestTargetRoutes: (_args: unknown[], callback: typeof pending.callback) => {
    pending.callback = callback
    return vi.fn()
  },
}))
const catalog: CraftCatalog = JSON.parse(
  readFileSync(
    resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/craft/catalog.json'),
    'utf8',
  ),
)
const effectId = 'CraftedJewelPrefixEffect'
const operation: LiquidEmotionCraftOperation = {
  kind: 'liquid-emotion',
  emotionId: 'Metadata/Items/Currency/EndgameDistilledEmotion2',
  resultKind: 'suffix',
  removeModId: 'JewelBleedingDuration',
  values: [50],
}
function fixture(identified = false) {
  const selectedOperation: LiquidEmotionCraftOperation = {
    ...operation,
    ...(identified ? { removeAffixId: 'a4' } : {}),
  }
  const initialState = {
    baseId: 'Ruby',
    itemLevel: 86,
    rarity: 'normal',
    sourceText: null,
    affixes: [],
  }
  const modIds = [
    'JewelFireDamage',
    'JewelArmour',
    'JewelArmourBreakDuration',
    'JewelBleedingDuration',
  ]
  const source = (path: string) =>
    catalog._meta.sources.find((entry) => entry.path === path)?.sha256
  const restored = (identified ? loadWorkbenchProject : parseCraftProject)(
    JSON.stringify({
      schemaVersion: 1,
      rulesVersion: CRAFT_RULES_VERSION,
      sourceCommit: catalog._meta.sourceCommit,
      jewelSourceHash: source('src/Data/ModJewel.lua'),
      liquidEmotionSourceHash: source('src/Data/LiquidEmotions.lua'),
      scalabilitySourceHash: source('src/Data/ModScalability.lua'),
      initialState,
      targetModIds: [effectId, 'JewelArmour'],
      operations: [
        {
          currency: 'alchemy',
          modIds,
          rolls: modIds.map((modId, i) => ({ modId, values: [i === 3 ? 5 : 10] })),
        },
      ],
      cursor: 1,
    }),
    catalog,
  )
  if (!restored.ok) throw Error(restored.error)
  const state = restored.value.states[1]
  if (!state) throw Error('缺少点金起点')
  const next = applyCraftStep(catalog, state, selectedOperation)
  if (!next.ok) throw Error(next.error)
  const result: CraftResult<CraftDefinitionRoutes> = {
    ok: true,
    value: {
      alreadyMatched: false,
      truncated: false,
      examinedStates: 1,
      candidateApplications: 2,
      routes: [
        {
          finalState: next.value,
          steps: [
            {
              operation: selectedOperation,
              state: next.value,
              matchedTargetIds: ['t1', 't2'],
              gainedTargetIds: ['t1'],
              lostTargetIds: [],
              atRiskTargetIds: ['t2'],
              rerolledTargetIds: [],
              affectedModIds: [],
              atRiskModIds: ['JewelArmour'],
              rerolledModIds: [],
            },
          ],
        },
      ],
    },
  }
  return { state, restored: restored.value, result, selectedOperation }
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
afterEach(() => {
  cleanup()
  localStorage.clear()
  pending.callback = null
})

it('液态路线显示方向、保证数值、整组移除及跨结果池风险', () => {
  const { state, result } = fixture()
  const onPreview = vi.fn()
  render(
    <TargetRoutesPanel
      catalog={catalog}
      state={state}
      definitions={{
        nextTargetId: 3,
        targets: [
          { targetId: 't1', modId: effectId },
          { targetId: 't2', modId: 'JewelArmour' },
        ],
        alternatives: [],
        values: [],
      }}
      busy={false}
      translations={{}}
      onPreview={onPreview}
    />,
  )
  click('生成多步示例路线')
  act(() => pending.callback?.(result))
  expect(screen.getByText('液态保证结果：后缀。方向与移除对象仅为指定演练结果。')).toBeDefined()
  expect(screen.getByText(/保证词缀：CraftedJewelPrefixEffect/)).toBeDefined()
  expect(screen.getByText(/指定移除整组：JewelBleedingDuration/)).toBeDefined()
  expect(screen.getByText(/材料各可演练结果的移除池内目标风险/).textContent).toContain('Armoured')
  click('预览路线第一步')
  expect(onPreview).toHaveBeenCalledExactlyOnceWith(operation)
})

it('路线第一步进入液态草稿，取消不计费，应用后清旧路线且项目可回放', () => {
  const { state, restored, result, selectedOperation } = fixture(true)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={state}
      initialProject={restored}
      translations={{}}
    />,
  )
  click('生成多步示例路线')
  act(() => pending.callback?.(result))
  click('预览路线第一步')
  expect(screen.getByLabelText('液态情感待应用结果')).toBe(document.activeElement)
  click('取消液态情感结果')
  expect(screen.queryByText('强效的液化凶残 × 1')).toBeNull()
  click('预览路线第一步')
  click('应用液态情感结果')
  expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  expect(
    within(screen.getByLabelText('珠宝词缀增效')).getByText('15% increased Armour'),
  ).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(saved.rulesVersion).toBe(TARGET_CRAFT_RULES_VERSION)
  expect(saved.operations.at(-1)).toEqual(selectedOperation)
  expect(parseTargetCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  click('撤销')
  expect(screen.queryByLabelText('珠宝词缀增效')).toBeNull()
  click('重做')
  expect(screen.getByLabelText('珠宝词缀增效')).toBeDefined()
})
