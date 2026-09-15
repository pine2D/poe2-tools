import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isIdentifiedCraftState } from './affixIdentity'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { essenceSourceHash } from './essences'
import { inspectItem } from './export'
import { fluxCatalogSignature } from './fluxes'
import { parseItem } from './parse'
import type { CraftResult } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import {
  RETAINED_CATALYST_RULES_VERSION,
  requiresRetainedCatalystProjectVersion,
} from './retainedCatalystProjectVersion'
import { statScalabilitySourceHash } from './statScalability'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const version = 'basic-2026-09-16-v79'
const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function project(baseId = 'Gold Ring', quality = 40) {
  return {
    schemaVersion: 1,
    rulesVersion: version,
    sourceCommit: catalog._meta.sourceCommit,
    essenceSourceHash: essenceSourceHash(catalog),
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    initialState: {
      baseId,
      itemLevel: 86,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
      nextAffixId: 1,
      catalyst: { id: 'Flesh', quality, declared: true },
    },
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
    operations: [],
    cursor: 0,
  }
}
function operations() {
  return [
    {
      currency: 'transmutation',
      modIds: ['IncreasedLife1'],
      rolls: [{ affixId: 'a1', modId: 'IncreasedLife1', values: [19] }],
    },
    {
      currency: 'augmentation',
      modIds: ['FireResist1'],
      rolls: [{ affixId: 'a2', modId: 'FireResist1', values: [8] }],
    },
    {
      currency: 'regal',
      modIds: ['IncreasedMana1'],
      rolls: [{ affixId: 'a3', modId: 'IncreasedMana1', values: [10] }],
    },
    {
      kind: 'essence',
      essenceId: 'Metadata/Items/Currency/CurrencyCorruptedEssenceBreach',
      removeModId: 'IncreasedLife1',
      removeAffixId: 'a1',
      values: [],
    },
    { currency: 'annulment', modIds: [], removeModId: 'EssenceBreach', removeAffixId: 'a4' },
    {
      currency: 'exalted',
      omen: 'catalysing_exaltation',
      modIds: ['IncreasedLife1'],
      rolls: [{ affixId: 'a5', modId: 'IncreasedLife1', values: [19] }],
    },
  ]
}
const read = (input: unknown, source = catalog) =>
  parseTargetCraftProject(JSON.stringify(input), source)

describe('v79 已有扩展催化项目', () => {
  it.each([
    ['Gold Ring', 40],
    ['Jade Amulet', 40],
    ['Breach Ring', 60],
  ] as const)(
    '%s 保留已有 %i 品质，移除工艺与消费归零后完整来源及所有游标不丢失',
    (baseId, quality) => {
      const input = { ...project(baseId, quality), operations: operations() }
      const original = structuredClone(input)
      for (let cursor = 0; cursor <= input.operations.length; cursor++) {
        const restored = must(
          loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog),
        )
        expect(restored.states).toHaveLength(7)
        expect(restored.states[4]?.affixes.some((affix) => affix.modId === 'EssenceBreach')).toBe(
          true,
        )
        expect(restored.states[5]?.affixes.some((affix) => affix.modId === 'EssenceBreach')).toBe(
          false,
        )
        expect(restored.states[5]?.catalyst).toEqual(input.initialState.catalyst)
        expect(restored.states[6]?.catalyst).toEqual({ ...input.initialState.catalyst, quality: 0 })
        expect(restored.project).toEqual({ ...input, cursor })
        expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual({
          ...input,
          cursor,
        })
      }
      expect(input).toEqual(original)
    },
  )

  it('没有最大品质工艺或已有量已在未来归零，也要求独立精华来源，错缺与目录漂移拒绝', () => {
    const input = { ...project(), operations: operations(), cursor: 6 }
    must(read(input))
    const { essenceSourceHash: _hash, ...missing } = input
    for (const value of [
      missing,
      { ...missing, operations: [], cursor: 0 },
      { ...input, essenceSourceHash: 'f'.repeat(64) },
    ])
      expect(read(value)).toMatchObject({ ok: false, error: expect.stringContaining('精华来源') })
    const changed = structuredClone(catalog)
    const source = changed._meta.sources.find((s) => s.path === 'src/Data/Essence.lua')
    if (!source) throw Error('缺少精华来源')
    source.sha256 = 'f'.repeat(64)
    expect(read(input, changed).ok).toBe(false)
    const { essences: _essences, ...withoutEssences } = catalog
    expect(read(project(), withoutEssences).ok).toBe(false)
  })

  it('v2–v78拒绝初始扩展品质，但合法常规催化保持旧来源契约', () => {
    for (let n = 2; n <= 78; n++) {
      const baseline = legacyProject(n)
      expect(parser(n)(JSON.stringify(baseline), catalog).ok, `v${n} baseline`).toBe(true)
      expect(
        parser(n)(
          JSON.stringify({
            ...baseline,
            initialState: {
              ...baseline.initialState,
              catalyst: { id: 'Flesh', quality: 40, declared: true },
            },
            scalabilitySourceHash: statScalabilitySourceHash(catalog),
          }),
          catalog,
        ),
        `v${n}`,
      ).toMatchObject({ ok: false, error: expect.stringContaining('v79') })
      if (n >= 72) {
        const ordinary = {
          ...baseline,
          initialState: {
            ...baseline.initialState,
            catalyst: { id: 'Flesh', quality: 20, declared: true },
          },
          scalabilitySourceHash: statScalabilitySourceHash(catalog),
        }
        expect(parser(n)(JSON.stringify(ordinary), catalog).ok, `v${n} ordinary`).toBe(true)
      }
    }
  })

  it('旧v72–v78在初始普通品质的未来首次共存时拒绝，不能因cursor0或最后归零绕过', () => {
    const current = { ...project('Gold Ring', 20), operations: operations(), cursor: 0 }
    must(read(current))
    for (let n = 72; n <= 78; n++) {
      const baseline = legacyProject(n)
      const future = {
        ...baseline,
        essenceSourceHash: current.essenceSourceHash,
        scalabilitySourceHash: current.scalabilitySourceHash,
        initialState: { ...baseline.initialState, catalyst: current.initialState.catalyst },
        operations:
          n === 72
            ? operations().map(({ removeAffixId: _id, ...step }) => ({
                ...step,
                ...('rolls' in step && step.rolls
                  ? { rolls: step.rolls.map(({ affixId: _affix, ...roll }) => roll) }
                  : {}),
              }))
            : operations(),
      }
      for (const cursor of [0, 6])
        expect(parser(n)(JSON.stringify({ ...future, cursor }), catalog), `v${n}`).toMatchObject({
          ok: false,
          error: expect.stringContaining('v79'),
        })
    }
  })

  it('沿用不搬高品质起点或品质消费，当前v79历史不因旧方案降级', () => {
    const source = {
      ...project(),
      operations: operations(),
      cursor: 6,
      targetDefinitions: {
        ...project().targetDefinitions,
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: 'IncreasedLife1' }],
      },
    }
    const receiver = legacyProject(74)
    const received = must(
      reuseTargetCraftPlan(JSON.stringify(receiver), JSON.stringify(source), catalog),
    )
    expect(received.project.operations).toEqual([])
    expect(received.states[0]).not.toHaveProperty('catalyst')
    const template = { ...receiver, targetDefinitions: source.targetDefinitions }
    const kept = must(
      reuseTargetCraftPlan(JSON.stringify(source), JSON.stringify(template), catalog),
    )
    expect(kept.project.rulesVersion).toBe(version)
    expect(kept.project.operations).toEqual(source.operations)
    expect(kept.project.essenceSourceHash).toBe(source.essenceSourceHash)
    expect(kept.states[6]?.catalyst?.quality).toBe(0)
  })

  it('真实已有高品质原文和高级基础值重新核对，移除词缀后的观察不补造精华消费', () => {
    const state = must(read({ ...project(), operations: operations().slice(0, 5) })).states[5]
    if (!state) throw Error('缺少移除后的状态')
    const text = must(exportCraftItemText(catalog, state)).text
    const item = parseItem(text)
    if (!item.ok) throw Error(item.error)
    const dictionary = createCraftItemDictionary(catalog, {})
    const imported = must(
      importIdentifiedCraftState(
        catalog,
        state.baseId,
        item.item,
        inspectItem(item.item, dictionary),
      ),
    )
    if (!isIdentifiedCraftState(imported)) throw Error('缺少导入实例')
    const input = { ...project(), initialState: imported, operations: [] }
    const restored = must(read(input))
    expect(restored.project.operations).toEqual([])
    expect(restored.states[0]?.sourceText).toBe(text)
    expect(restored.states[0]?.catalyst?.quality).toBe(40)
    expect(restored.states[0]?.affixes.some((affix) => affix.modId === 'EssenceBreach')).toBe(false)
    expect(
      read({
        ...input,
        initialState: { ...imported, catalyst: { ...imported.catalyst, quality: 20 } },
      }).ok,
    ).toBe(false)
    const { essenceSourceHash: _hash, ...missing } = input
    expect(read(missing).ok).toBe(false)
  })

  it('v79继承抗性转换和腐化指引，保留实例、独立签名与终态', () => {
    const input = {
      ...project(),
      fluxCatalogSignature: fluxCatalogSignature(catalog),
      operations: [
        ...operations(),
        {
          kind: 'flux',
          fluxId: 'Metadata/Items/Currency/CurrencyArcaneFluxCold',
          rolls: [{ affixId: 'a2', modId: 'ColdResist1', values: [8] }],
        },
        { kind: 'vaal', outcome: 'unchanged' },
        { kind: 'architect', outcome: 'destroy' },
      ],
      strategy: {
        maxSteps: 10,
        rules: [
          { conditions: [{ kind: 'corruption-state', value: 'none' }], action: { kind: 'vaal' } },
          {
            conditions: [{ kind: 'corruption-state', value: 'once' }],
            action: { kind: 'architect' },
          },
        ],
      },
    }
    const restored = must(read(input))
    expect(restored.states[9]).toMatchObject({ destroyed: true, catalyst: { quality: 0 } })
    expect(restored.states[9]?.affixes.find((affix) => affix.affixId === 'a2')?.modId).toBe(
      'ColdResist1',
    )
    const { fluxCatalogSignature: _signature, ...unsigned } = input
    expect(read(unsigned)).toMatchObject({ ok: false, error: expect.stringContaining('签名') })
    expect(read({ ...input, fluxCatalogSignature: 'wrong' }).ok).toBe(false)
  })

  it('v79仍支持完美溶剂与萃取但不凭版本要求精华或抗性来源', () => {
    const { essenceSourceHash: _essence, scalabilitySourceHash: _scalability, ...empty } = project()
    const { catalyst: _catalyst, ...initial } = empty.initialState
    const { fluxes: _fluxes, ...withoutFlux } = catalog
    const input = {
      ...empty,
      initialState: {
        ...initial,
        baseId: 'Ashen Staff',
        sockets: [null],
        implicitLines: ['Grants Skill: Level (1-20) Firebolt'],
      },
      augmentSourceHash: catalog._meta.sources.find(
        (source) => source.path === 'src/Data/ModRunes.lua',
      )?.sha256,
      operations: [
        { kind: 'perfect-flux', previousMaxLevel: 13 },
        { kind: 'socket', socketIndex: 0, augmentId: 'pob2:augment:["Mind Rune","staff"]' },
        { kind: 'extraction' },
      ],
    }
    const restored = must(read(input, withoutFlux))
    expect(restored.states[3]).toMatchObject({ grantedSkillLevel: 20, destroyed: true })
    expect(restored.project).not.toHaveProperty('essenceSourceHash')
    expect(restored.project).not.toHaveProperty('fluxCatalogSignature')
  })

  it('检测完整实际状态历史，不猜操作，旧合法催化与未知对象不改变', () => {
    expect(RETAINED_CATALYST_RULES_VERSION).toBe(version)
    expect(requiresRetainedCatalystProjectVersion(project(), catalog)).toBe(true)
    expect(requiresRetainedCatalystProjectVersion(project('Breach Ring', 40), catalog)).toBe(false)
    const ordinary = project('Gold Ring', 20)
    expect(requiresRetainedCatalystProjectVersion(ordinary, catalog)).toBe(false)
    const full = must(read({ ...ordinary, operations: operations() }))
    expect(requiresRetainedCatalystProjectVersion(full.project, catalog)).toBe(false)
    expect(
      requiresRetainedCatalystProjectVersion(
        { history: full.states.map((state) => ({ state })) },
        catalog,
      ),
    ).toBe(true)
    expect(requiresRetainedCatalystProjectVersion(full.states.at(-1), catalog)).toBe(false)
    expect(
      requiresRetainedCatalystProjectVersion(
        {
          ...ordinary.initialState,
          catalyst: { id: 'Flesh', quality: 0 },
          affixes: [{ modId: 'EssenceBreach' }],
        },
        catalog,
      ),
    ).toBe(true)
    expect(
      requiresRetainedCatalystProjectVersion(
        Object.defineProperty({}, 'baseId', {
          get() {
            throw Error('不能执行getter')
          },
        }),
        catalog,
      ),
    ).toBe(false)
    const loop: { state: unknown; cycle?: unknown } = { state: project().initialState }
    loop.cycle = loop
    expect(requiresRetainedCatalystProjectVersion(loop, catalog)).toBe(true)
  })
})

function legacyProject(n: number) {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: `basic-${n >= 76 ? '2026-09-16' : '2026-09-12'}-v${n}`,
    initialState: {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      ...(n >= 73 ? { nextAffixId: 1 } : {}),
    },
    operations: [],
    cursor: 0,
    ...(n >= 74 ? { targetDefinitions: project().targetDefinitions, orphanedTargets: [] } : {}),
    ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(catalog) } : {}),
  }
}
function parser(n: number) {
  return n <= 72
    ? parseCraftProject
    : n === 73
      ? parseIdentityCraftProject
      : parseTargetCraftProject
}
