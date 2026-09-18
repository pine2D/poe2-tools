import { expect, it } from 'vitest'
import { requiresAncientRibEchoesProjectVersion } from './ancientRibEchoesProjectVersion'
import { applyBoneCraft } from './boneCraft'
import type { BoneCraftOperation } from './boneRules'
import { boneCatalog, boneState } from './boneTestFixture'
import { serializeTargetCraftProject } from './craftProjectTargets'
import { DESECRATION_SOURCE } from './desecration'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

function fixture() {
  const catalog = boneCatalog('Body Armour')
  const low = catalog.modifiers.find((m) => m.id === 'prefix1')
  if (!low) throw Error('缺少合成词缀')
  low.level = 20
  catalog.modifiers.push({ ...low, id: 'prefix1High', level: 50 })
  // 其余独立族只有低档，必须沿用最低等级的同族回退。
  const state = boneState()
  delete state.sockets
  return { catalog, state }
}
const operations: BoneCraftOperation[] = [
  {
    kind: 'desecrate',
    boneId: 'ancient_rib',
    affixKind: 'prefix',
    directionOmen: 'sinistral_necromancy',
  },
  {
    kind: 'desecration-offer',
    modIds: ['prefix1High', 'prefix2', 'prefix3'],
    revealOmen: 'abyssal_echoes',
  },
  { kind: 'desecration-reroll', modIds: ['prefix1High', 'prefix3', 'prefix4'] },
  { kind: 'desecration-reveal', modId: 'prefix2', values: [7] },
]

it('远古肋骨两组共用最低等级与方向，第二组后可以选回首组', () => {
  const { catalog, state } = fixture()
  let current = state
  for (const operation of operations) {
    const result = applyBoneCraft(catalog, current, structuredClone(operation))
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) return
    current = result.value
    if (operation.kind === 'desecration-offer') {
      for (const modIds of [
        ['prefix1', 'prefix2', 'prefix4'],
        ['suffix1', 'prefix2', 'prefix4'],
      ]) {
        expect(applyBoneCraft(catalog, current, { kind: 'desecration-reroll', modIds }).ok).toBe(
          false,
        )
      }
    }
  }
  expect(current.affixes).toEqual([expect.objectContaining({ modId: 'prefix2', desecrated: true })])
  expect(current.pendingDesecration).toBeUndefined()
  expect(state.affixes).toEqual([])
})

it('v118 保留全部未来和各游标，旧版拒绝远古肋骨回响但仍能保存无回响路径', () => {
  const { catalog, state } = fixture()
  const input = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-18-v118',
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    initialState: { ...state, rarity: 'normal', nextAffixId: 1 },
    operations: [
      { currency: 'transmutation', modIds: ['suffix1'] },
      { currency: 'regal', modIds: ['suffix2'] },
      ...operations,
    ],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
  for (let cursor = 0; cursor <= input.operations.length; cursor++) {
    const result = loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    if (!result.ok) continue
    expect(result.value.states[5]?.pendingDesecration?.rerollOptions).toEqual([
      'prefix1High',
      'prefix3',
      'prefix4',
    ])
    const saved = serializeTargetCraftProject(result.value.project, catalog)
    expect(saved.ok).toBe(true)
    if (saved.ok) expect(JSON.parse(saved.value).rulesVersion).toBe(input.rulesVersion)
  }
  const old = { ...input, rulesVersion: 'basic-2026-09-18-v117' }
  expect(loadTargetWorkbenchProject(JSON.stringify(old), catalog)).toMatchObject({
    ok: false,
    error: expect.stringContaining('v118'),
  })
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...old, operations: input.operations.slice(0, 3) }),
      catalog,
    ).ok,
  ).toBe(true)
})

it('版本检测按骨骼生命周期关联回响，不执行访问器、不误判独立两次制作', () => {
  expect(requiresAncientRibEchoesProjectVersion({ operations })).toBe(true)
  expect(
    requiresAncientRibEchoesProjectVersion({
      initialState: { pendingDesecration: { boneId: 'ancient_rib' } },
      operations: [operations[1]],
    }),
  ).toBe(true)
  expect(
    requiresAncientRibEchoesProjectVersion({
      operations: [
        operations[0],
        operations[3],
        { kind: 'desecrate', boneId: 'preserved_rib' },
        operations[1],
      ],
    }),
  ).toBe(false)
  expect(
    requiresAncientRibEchoesProjectVersion({
      sourceText: 'ancient_rib abyssal_echoes',
      get operations() {
        throw Error('不能访问')
      },
    }),
  ).toBe(false)
})
