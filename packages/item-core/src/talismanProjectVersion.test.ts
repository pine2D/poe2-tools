import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import * as api from './index'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const dictionary = createCraftItemDictionary(catalog, {})
const version = 'basic-2026-09-17-v107'
function project(baseId = 'Changeling Talisman') {
  return {
    schemaVersion: 1,
    rulesVersion: version,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId,
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    operations: [],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}

it.each(
  catalog.bases
    .filter((base) => base.type === 'Talisman' && !base.hidden && !base.runeforged)
    .map((base) => base.id),
)('%s 的 v107 起点可恢复、保存和工作台载入', (baseId) => {
  const input = project(baseId)
  const read = parseTargetCraftProject(JSON.stringify(input), catalog, dictionary)
  expect(read.ok, read.ok ? '' : read.error).toBe(true)
  if (!read.ok) return
  expect(read.value.project.rulesVersion).toBe(version)
  expect(serializeTargetCraftProject(read.value.project, catalog, dictionary).ok).toBe(true)
  expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog, dictionary).ok).toBe(true)
})

it('旧版本和无目录旧 serializer 拒绝起点及嵌套未来中的魔符身份', () => {
  for (const rulesVersion of [
    'basic-2026-09-17-v106',
    'basic-2026-09-17-v105',
    'basic-2026-09-12-v74',
  ]) {
    for (const input of [
      project(),
      { ...project('Gold Ring'), future: { imported: { baseId: 'Changeling Talisman' } } },
    ]) {
      const result = parseTargetCraftProject(
        JSON.stringify({ ...input, rulesVersion }),
        catalog,
        dictionary,
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('v107')
    }
  }
  expect(parseCraftProject(JSON.stringify(project()), catalog, dictionary).ok).toBe(false)
  expect(parseIdentityCraftProject(JSON.stringify(project()), catalog, dictionary).ok).toBe(false)
  expect(() =>
    serializeCraftProject({
      ...project(),
      rulesVersion: 'basic-2026-09-12-v72',
    } as unknown as CraftProject),
  ).toThrow(/v107/)
})

it('新空项目保留 v107，而观察文本和阶段名称不升级普通旧项目', () => {
  const restored = parseTargetCraftProject(
    JSON.stringify(project('Gold Ring')),
    catalog,
    dictionary,
  )
  expect(restored.ok, restored.ok ? '' : restored.error).toBe(true)
  if (restored.ok) expect(restored.value.project.rulesVersion).toBe(version)
  const plain = {
    ...project('Gold Ring'),
    rulesVersion: 'basic-2026-09-17-v106',
    strategyStartStep: 0,
    strategy: {
      maxSteps: 1,
      flow: { stages: [{ id: 's1', name: 'Changeling Talisman' }], entryStageId: 's1' },
      rules: [{ stageId: 's1', conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  expect(parseTargetCraftProject(JSON.stringify(plain), catalog, dictionary).ok).toBe(true)
})

it('完整未来回放和方案复用保留接收方物品与撤销位置', () => {
  const input = {
    ...project(),
    operations: [
      { currency: 'transmutation', modIds: ['LocalIncreasedPhysicalDamagePercent1'] },
      { currency: 'augmentation', modIds: ['LocalIncreasedAttackSpeed1'] },
    ],
  }
  const restored = parseTargetCraftProject(JSON.stringify(input), catalog, dictionary)
  expect(restored.ok, restored.ok ? '' : restored.error).toBe(true)
  const source = {
    ...project('Ashbark Talisman'),
    targetDefinitions: {
      nextTargetId: 2,
      targets: [{ targetId: 't1', modId: 'LocalIncreasedAttackSpeed1' }],
      alternatives: [],
      values: [],
    },
  }
  const reused = reuseTargetCraftPlan(
    JSON.stringify(input),
    JSON.stringify(source),
    catalog,
    dictionary,
  )
  expect(reused.ok, reused.ok ? '' : reused.error).toBe(true)
  if (reused.ok) {
    expect(reused.value.project.rulesVersion).toBe(version)
    expect(reused.value.project.initialState).toEqual(input.initialState)
    expect(reused.value.project.operations).toEqual(input.operations)
    expect(reused.value.project.cursor).toBe(0)
  }
})

it('v107 继承药剂来源要求，不能通过版本升级绕过来源', () => {
  const input = project('Ultimate Life Flask')
  expect(parseTargetCraftProject(JSON.stringify(input), catalog, dictionary).ok).toBe(false)
  const flaskSourceHash = catalog._meta.sources.find(
    (source) => source.path === 'src/Data/ModFlask.lua',
  )?.sha256
  const read = parseTargetCraftProject(
    JSON.stringify({ ...input, flaskSourceHash }),
    catalog,
    dictionary,
  )
  expect(read.ok, read.ok ? '' : read.error).toBe(true)
  if (read.ok) expect(read.value.project.rulesVersion).toBe(version)
})

it('普通旧项目的魔符专属失联目标也必须升级', () => {
  const input = {
    ...project('Gold Ring'),
    rulesVersion: 'basic-2026-09-17-v106',
    orphanedTargets: [{ targetId: 't1', modId: 'AbyssModTalismanUlamanSuffixGainXRageOnMeleeHit' }],
  }
  const result = parseTargetCraftProject(JSON.stringify(input), catalog, dictionary)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toContain('v107')
})

it('能力扫描不执行访问器并只读取身份引用字段', () => {
  const requires = (
    api as unknown as {
      requiresTalismanProjectVersion: (input: unknown, catalog?: CraftCatalog) => boolean
    }
  ).requiresTalismanProjectVersion
  const getter = Object.defineProperty({}, 'baseId', {
    get() {
      throw Error('不能调用访问器')
    },
  })
  expect(requires(getter, catalog)).toBe(false)
  expect(
    requires(
      {
        sourceText: 'Changeling Talisman',
        name: 'AbyssModTalismanUlamanSuffixGainXRageOnMeleeHit',
      },
      catalog,
    ),
  ).toBe(false)
  expect(requires({ future: { declared: { baseId: 'Changeling Talisman' } } }, catalog)).toBe(true)
  expect(requires({ targetModIds: ['AbyssModTalismanUlamanSuffixGainXRageOnMeleeHit'] })).toBe(true)
  const cyclic: { self?: unknown } = {}
  cyclic.self = cyclic
  expect(requires(cyclic, catalog)).toBe(false)
})

it('v107 不授权六种锻造或隐藏魔符，也不生成形态技能身份', () => {
  for (const base of catalog.bases.filter(
    (base) => base.type === 'Talisman' && (base.hidden || base.runeforged),
  )) {
    expect(parseTargetCraftProject(JSON.stringify(project(base.id)), catalog, dictionary).ok).toBe(
      false,
    )
  }
  const input = project()
  for (const declaration of [
    { declaredSkillLevel: 20 },
    { declaredSkillSockets: 5 },
    { implicitLines: ['Grants Skill: Level 20 Werewolf'] },
  ]) {
    expect(
      parseTargetCraftProject(
        JSON.stringify({ ...input, initialState: { ...input.initialState, ...declaration } }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  }
})
