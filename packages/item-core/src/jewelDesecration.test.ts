import { expect, it } from 'vitest'
import { desecrationCandidates, prepareDesecration } from './boneCraft'
import { inspectModPool } from './catalog'
import { parseCraftCatalog } from './catalogFormat'
import { catalog, dictionary } from './catalystTestFixture'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { DESECRATION_SOURCE } from './desecration'
import { JEWEL_SOURCE } from './jewels'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

const must = <T>(r: CraftResult<T>): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
const present = <T>(value: T | undefined): T => {
  if (value === undefined) throw Error('缺少测试数据')
  return value
}
const blank = (baseId = 'Time-Lost Sapphire'): CraftState => ({
  baseId,
  rarity: 'rare',
  itemLevel: 86,
  sourceText: null,
  affixes: [],
})
const bone: CraftStep = { kind: 'desecrate', boneId: 'preserved_cranium', affixKind: 'prefix' }

it.each([
  'Ruby',
  'Emerald',
  'Sapphire',
  'Diamond',
  'Time-Lost Ruby',
  'Time-Lost Emerald',
  'Time-Lost Sapphire',
  'Time-Lost Diamond',
])('%s 颅骨接入普通与专属候选，揭示来源不泄漏普通生成池', (baseId) => {
  expect(parseCraftCatalog(catalog)).toBe(catalog)
  const state = must(applyCraftStep(catalog, blank(baseId), bone))
  const candidates = desecrationCandidates(catalog, state)
  const special = candidates.filter((m) => m.desecratedOnly)
  expect(special).toHaveLength(baseId.startsWith('Time-Lost') ? 6 : 29)
  expect(candidates.some((m) => !m.desecratedOnly)).toBe(true)
  const base = present(catalog.bases.find((b) => b.id === baseId))
  expect(inspectModPool(base, catalog.modifiers, 86).some((m) => m.mod.desecratedOnly)).toBe(false)
  const ids = special.slice(0, 3).map((m) => m.id)
  const offered = must(
    applyCraftStep(catalog, state, {
      kind: 'desecration-offer',
      modIds: ids,
      revealOmen: 'abyssal_echoes',
    }),
  )
  expect(offered.pendingDesecration?.options).toEqual(ids)
  expect(prepareDesecration(catalog, state, 'preserved_cranium').ok).toBe(false)
  expect(
    prepareDesecration(catalog, blank(baseId), 'preserved_cranium', { lichOmen: 'liege' }).ok,
  ).toBe(false)
})

it('失落珠宝揭示可保存、恢复、保留品质，旧版及损坏来源不能借未执行历史绕过', () => {
  const initial = { ...blank(), catalyst: { id: 'Neural', quality: 20, declared: true as const } }
  const ids = [
    'AbyssModRadiusJewelPrefixPercentMaximumMana',
    'AbyssModRadiusJewelPrefixPercentMaximumLife',
    'AbyssModRadiusJewelPrefixGlobalDefences',
  ]
  const steps: CraftStep[] = [
    bone,
    { kind: 'desecration-offer', modIds: ids },
    { kind: 'desecration-reveal', modId: present(ids[0]), values: [] },
  ]
  let state = initial as CraftState
  for (const step of steps) state = must(applyCraftStep(catalog, state, step))
  expect(state).toMatchObject({
    catalyst: initial.catalyst,
    affixes: [
      {
        desecrated: true,
        lines: ['Notable Passive Skills in Radius also grant 1% increased maximum Mana'],
      },
    ],
  })
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: state.affixes.map(({ desecrated: _, ...a }) => a),
    }).ok,
  ).toBe(false)
  const base = present(catalog.bases.find((b) => b.id === 'Time-Lost Sapphire'))
  const ordinary = inspectModPool(base, catalog.modifiers, 86).map((e) => e.mod)
  const project = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    jewelSourceHash: JEWEL_SOURCE.sha256,
    desecrationSourceHash: DESECRATION_SOURCE.sha256,
    initialState: { ...blank(), rarity: 'normal' },
    operations: [
      {
        currency: 'transmutation',
        modIds: [present(ordinary.find((m) => m.kind === 'prefix')).id],
      },
      { currency: 'regal', modIds: [present(ordinary.find((m) => m.kind === 'suffix')).id] },
      ...steps,
    ],
    cursor: 0,
  }
  expect(parseCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
  expect(
    parseCraftProject(
      JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v70' }),
      catalog,
      dictionary,
    ).ok,
  ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({ ...project, desecrationSourceHash: '0'.repeat(64) }),
      catalog,
      dictionary,
    ).ok,
  ).toBe(false)
})

it('四词缀珠宝满容量须移除同侧，三词缀只能填空侧，魔法与装备拒绝颅骨', () => {
  const base = present(catalog.bases.find((b) => b.id === 'Sapphire'))
  const ordinary = inspectModPool(base, catalog.modifiers, 86).map((e) => e.mod)
  const chosen = ['prefix', 'suffix'].flatMap((kind) =>
    ordinary.filter((m) => m.kind === kind).slice(0, 2),
  )
  const full = {
    ...blank('Sapphire'),
    affixes: chosen.map((m) => ({ modId: m.id, lines: m.lines })),
  }
  expect(createCraftState(catalog, full).ok).toBe(true)
  expect(must(prepareDesecration(catalog, full, 'preserved_cranium')).requiresRemoval).toBe(true)
  expect(applyCraftStep(catalog, full, bone).ok).toBe(false)
  expect(applyCraftStep(catalog, full, { ...bone, removeModId: present(chosen[0]).id }).ok).toBe(
    true,
  )
  expect(applyCraftStep(catalog, full, { ...bone, removeModId: present(chosen[2]).id }).ok).toBe(
    false,
  )
  const partial = { ...full, affixes: full.affixes.slice(0, 3) }
  expect(must(prepareDesecration(catalog, partial, 'preserved_cranium')).kinds).toEqual(['suffix'])
  expect(applyCraftStep(catalog, { ...blank(), rarity: 'magic' }, bone).ok).toBe(false)
  expect(applyCraftStep(catalog, blank('Gold Ring'), bone).ok).toBe(false)
})

it('旧版不能把新珠宝亵渎目标藏入条件树，合法旧空白项目继续恢复', () => {
  const project = {
    schemaVersion: 1,
    rulesVersion: 'basic-2026-09-12-v70',
    sourceCommit: catalog._meta.sourceCommit,
    jewelSourceHash: JEWEL_SOURCE.sha256,
    initialState: { ...blank('Ruby'), rarity: 'normal' },
    operations: [],
    cursor: 0,
  }
  expect(parseCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
  const target = 'AbyssModJewelPrefixSpellDamageArmour'
  expect(
    parseCraftProject(JSON.stringify({ ...project, targetModIds: [target] }), catalog, dictionary)
      .ok,
  ).toBe(false)
  const strategy = {
    maxSteps: 10,
    rules: [
      {
        conditions: [
          {
            kind: 'all',
            conditions: [{ kind: 'selected-targets', modIds: [target], min: 1, value: true }],
          },
        ],
        action: { kind: 'stop' },
      },
    ],
  }
  expect(
    parseCraftProject(
      JSON.stringify({ ...project, rulesVersion: CRAFT_RULES_VERSION, strategy }),
      catalog,
      dictionary,
    ).ok,
  ).toBe(true)
  const old = parseCraftProject(JSON.stringify({ ...project, strategy }), catalog, dictionary)
  expect(old.ok).toBe(false)
})

it('历史3/2珠宝移除前缀仍无空位，不列入可选结果；待揭示不能伪造第三条', () => {
  const base = present(catalog.bases.find((b) => b.id === 'Sapphire'))
  const mods = inspectModPool(base, catalog.modifiers, 86).map((e) => e.mod)
  const prefixes = mods.filter((m) => m.kind === 'prefix').slice(0, 3)
  const suffixes = mods.filter((m) => m.kind === 'suffix').slice(0, 2)
  const state = {
    ...blank('Sapphire'),
    affixes: [...prefixes, ...suffixes].map((m) => ({ modId: m.id, lines: m.lines })),
  }
  expect(createCraftState(catalog, state).ok).toBe(true)
  expect(
    must(prepareDesecration(catalog, state, 'preserved_cranium')).removableAffixes.map(
      (a) => a.modId,
    ),
  ).toEqual(suffixes.map((m) => m.id))
  const without = {
    ...state,
    affixes: state.affixes.filter((a) => a.modId !== present(prefixes[0]).id),
  }
  expect(
    createCraftState(catalog, {
      ...without,
      pendingDesecration: { boneId: 'preserved_cranium', kind: 'prefix' },
    }).ok,
  ).toBe(false)
})
