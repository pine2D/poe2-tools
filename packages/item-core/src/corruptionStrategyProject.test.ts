import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import type { CraftCatalog } from './catalog'
import { CORRUPTION_SOURCE } from './corruptionSource'
import {
  CORRUPTION_STRATEGY_RULES_VERSION,
  requiresCorruptionStrategyProjectVersion,
} from './corruptionStrategyProjectVersion'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import type { CraftResult } from './rehearsal'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const version = 'basic-2026-09-16-v78'
const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function strategy() {
  return {
    maxSteps: 5,
    rules: [
      { conditions: [{ kind: 'corruption-state', value: 'none' }], action: { kind: 'vaal' } },
      { conditions: [{ kind: 'corruption-state', value: 'once' }], action: { kind: 'architect' } },
      { conditions: [{ kind: 'corruption-state', value: 'twice' }], action: { kind: 'stop' } },
    ],
  }
}
function project() {
  return {
    schemaVersion: 1,
    rulesVersion: version,
    sourceCommit: catalog._meta.sourceCommit,
    initialState: {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
    operations: [],
    cursor: 0,
    strategy: strategy(),
  }
}
const read = (input: unknown, source = catalog) =>
  parseTargetCraftProject(JSON.stringify(input), source)

describe('v78 腐化条件指引项目', () => {
  it('仅动作与嵌套条件无须腐化表或抗性表，完整保留配置与未执行阶段', () => {
    const source = boneCatalog()
    const input = {
      ...project(),
      sourceCommit: source._meta.sourceCommit,
      initialState: { ...project().initialState, baseId: 'Synthetic Base' },
      strategyStartStep: 0,
      strategy: {
        ...strategy(),
        flow: {
          entryStageId: 'start',
          stages: [
            { id: 'start', name: '当前' },
            { id: 'later', name: '未进入' },
          ],
        },
        rules: [
          { stageId: 'start', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
          {
            stageId: 'later',
            conditions: [
              {
                kind: 'not',
                condition: {
                  kind: 'all',
                  conditions: [{ kind: 'corruption-state', value: 'once' }],
                },
              },
            ],
            action: { kind: 'architect' },
          },
        ],
      },
    }
    const original = structuredClone(input)
    const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), source))
    expect(restored.project).toEqual(input)
    expect(restored.project).not.toHaveProperty('corruptionSourceHash')
    expect(restored.project).not.toHaveProperty('fluxCatalogSignature')
    expect(JSON.parse(must(serializeTargetCraftProject(restored.project, source)))).toEqual(input)
    expect(input).toEqual(original)
  })

  it('每个游标都回放完整两次真实强化，实际强化仍严格核对来源', () => {
    const input = {
      ...project(),
      corruptionSourceHash: CORRUPTION_SOURCE.sha256,
      operations: [
        { kind: 'vaal', outcome: 'enchant', modId: 'CorruptionChaosResistance1', values: [15] },
        { kind: 'architect', outcome: 'enchant', modId: 'CorruptionAllResistances1', values: [10] },
      ],
    }
    for (const cursor of [0, 1, 2]) {
      const restored = must(read({ ...input, cursor }))
      expect(restored.states).toHaveLength(3)
      expect(restored.states[0]).not.toHaveProperty('corrupted')
      expect(restored.states[1]?.corrupted).toBe(true)
      expect(restored.states[1]).not.toHaveProperty('twiceCorrupted')
      expect(restored.states[2]).toMatchObject({
        twiceCorrupted: true,
        secondCorruption: { modId: 'CorruptionAllResistances1' },
      })
      expect(restored.project).toEqual({ ...input, cursor })
      expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual({
        ...input,
        cursor,
      })
    }
    const { corruptionSourceHash: _hash, ...missing } = input
    expect(read(missing)).toMatchObject({ ok: false, error: expect.stringContaining('来源指纹') })
    expect(read({ ...input, corruptionSourceHash: 'f'.repeat(64) }).ok).toBe(false)
    const changed = structuredClone(catalog)
    const source = changed._meta.sources.find((entry) => entry.path === CORRUPTION_SOURCE.path)
    if (!source) throw Error('缺少腐化来源')
    source.sha256 = 'e'.repeat(64)
    expect(read(input, changed).ok).toBe(false)
    expect(
      read({
        ...input,
        operations: [...input.operations, { kind: 'architect', outcome: 'destroy' }],
      }).ok,
    ).toBe(false)
  })

  it('瓦尔与建筑师旧真实步骤和报价不升级要求，无强化摧毁可不带腐化表', () => {
    const operations = [
      { kind: 'vaal', outcome: 'unchanged' },
      { kind: 'architect', outcome: 'destroy' },
    ]
    for (let n = 62; n <= 77; n++) {
      const input = legacyProject(n)
      const restored = parser(n)(
        JSON.stringify({
          ...input,
          operations,
          cursor: 2,
          pricing: { unit: 'divine', prices: { 'currency:vaal': 1, 'currency:architect': 2 } },
        }),
        catalog,
      )
      if (!restored.ok) throw Error(restored.error)
      expect(restored.value.states[2]?.destroyed).toBe(true)
    }
    const source = boneCatalog()
    const input = {
      ...project(),
      sourceCommit: source._meta.sourceCommit,
      initialState: { ...project().initialState, baseId: 'Synthetic Base' },
      operations,
    }
    expect(must(read(input, source)).states[2]?.destroyed).toBe(true)
  })

  it('旧v2–v77合法基线拒绝深嵌套条件和未执行的新材料动作', () => {
    for (let n = 2; n <= 77; n++) {
      const input = legacyProject(n)
      expect(parser(n)(JSON.stringify(input), catalog).ok, `v${n} baseline`).toBe(true)
      for (const rules of [
        [{ conditions: [{ kind: 'always' }], action: { kind: 'vaal' } }],
        [
          {
            conditions: [{ kind: 'not', condition: { kind: 'always' } }],
            action: { kind: 'architect' },
          },
        ],
        [
          {
            conditions: [
              {
                kind: 'all',
                conditions: [
                  { kind: 'not', condition: { kind: 'corruption-state', value: 'twice' } },
                ],
              },
            ],
            action: { kind: 'stop' },
          },
        ],
      ])
        expect(
          parser(n)(JSON.stringify({ ...input, strategy: { maxSteps: 5, rules } }), catalog),
          `v${n}`,
        ).toMatchObject({ ok: false, error: expect.stringContaining('v78') })
    }
  })

  it('沿用腐化指引升级版本但不搬源强化或消费，当前未来历史保留', () => {
    const source = {
      ...project(),
      operations: [
        { kind: 'vaal', outcome: 'unchanged' },
        { kind: 'architect', outcome: 'destroy' },
      ],
      cursor: 2,
    }
    const receiver = {
      ...legacyProject(74),
      operations: [
        {
          currency: 'transmutation',
          modIds: ['FireResist1'],
          rolls: [{ affixId: 'a1', modId: 'FireResist1', values: [8] }],
        },
      ],
      cursor: 0,
    }
    const restored = must(
      reuseTargetCraftPlan(JSON.stringify(receiver), JSON.stringify(source), catalog),
    )
    expect(restored.project.rulesVersion).toBe(version)
    expect(restored.project.operations).toEqual(receiver.operations)
    expect(restored.project.cursor).toBe(0)
    expect(restored.states).toHaveLength(2)
    expect(restored.states[1]).not.toHaveProperty('corrupted')
    expect(restored.states[1]).not.toHaveProperty('destroyed')
    expect(restored.project.strategy).toEqual(source.strategy)
    const template = {
      ...legacyProject(74),
      targetDefinitions: {
        ...project().targetDefinitions,
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: 'FireResist1' }],
      },
    }
    const kept = must(
      reuseTargetCraftPlan(JSON.stringify(source), JSON.stringify(template), catalog),
    )
    expect(kept.project.operations).toEqual(source.operations)
    expect(kept.states[2]?.destroyed).toBe(true)
    expect(kept.project.rulesVersion).toBe(version)
  })

  it('策略字段不能伪装真实结果，步骤也不能仅写材料，初始终态拒绝', () => {
    const input = project()
    must(read(input))
    for (const invalid of [
      { ...input, operations: [{ kind: 'vaal' }] },
      { ...input, operations: [{ kind: 'architect' }] },
      {
        ...input,
        strategy: {
          maxSteps: 5,
          rules: [
            { conditions: [{ kind: 'always' }], action: { kind: 'vaal', outcome: 'unchanged' } },
          ],
        },
      },
      { ...input, initialState: { ...input.initialState, destroyed: true } },
    ])
      expect(read(invalid).ok).toBe(false)
  })

  it('v78继承完美溶剂与萃取完整历史，保留技能结果与材料而不要求抗性表', () => {
    const { fluxes: _fluxes, ...withoutFlux } = catalog
    const input = {
      ...project(),
      initialState: {
        ...project().initialState,
        baseId: 'Ashen Staff',
        sockets: [null],
        implicitLines: ['Grants Skill: Level (1-20) Firebolt'],
      },
      augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
        ?.sha256,
      operations: [
        { kind: 'perfect-flux', previousMaxLevel: 13 },
        { kind: 'socket', socketIndex: 0, augmentId: 'pob2:augment:["Mind Rune","staff"]' },
        { kind: 'vaal', outcome: 'unchanged' },
        { kind: 'extraction' },
      ],
      pricing: { unit: 'divine', prices: { 'currency:perfect-flux': 1, 'currency:extraction': 2 } },
    }
    for (const cursor of [0, 1, 2, 3, 4]) {
      const restored = must(read({ ...input, cursor }, withoutFlux))
      expect(restored.project).toEqual({ ...input, cursor })
      expect(restored.states).toHaveLength(5)
      expect(restored.states[4]).toMatchObject({
        destroyed: true,
        grantedSkillLevel: 20,
        corrupted: true,
        sockets: ['pob2:augment:["Mind Rune","staff"]'],
        implicitLines: input.initialState.implicitLines,
      })
    }
    expect(must(read(input, withoutFlux)).project).not.toHaveProperty('corruptionSourceHash')
  })

  it('v78继承真实抗性转换与重复目标，已有同类目标也不能丢失签名', () => {
    const input = {
      ...project(),
      fluxCatalogSignature: fluxCatalogSignature(catalog),
      targetDefinitions: {
        ...project().targetDefinitions,
        nextTargetId: 3,
        targets: [
          { targetId: 't1', modId: 'FireResist4' },
          { targetId: 't2', modId: 'FireResist4' },
        ],
      },
      operations: [
        {
          currency: 'transmutation',
          modIds: ['ColdResist4'],
          rolls: [{ affixId: 'a1', modId: 'ColdResist4', values: [21] }],
        },
        {
          currency: 'augmentation',
          modIds: ['IncreasedLife1'],
          rolls: [{ affixId: 'a2', modId: 'IncreasedLife1', values: [10] }],
        },
        {
          currency: 'regal',
          modIds: ['FireResist4'],
          rolls: [{ affixId: 'a3', modId: 'FireResist4', values: [22] }],
        },
        {
          kind: 'flux',
          fluxId: 'Metadata/Items/Currency/CurrencyArcaneFluxFire',
          rolls: [{ affixId: 'a1', modId: 'FireResist4', values: [23] }],
        },
        { kind: 'vaal', outcome: 'unchanged' },
        { kind: 'architect', outcome: 'destroy' },
      ],
    }
    const restored = must(read(input))
    expect(restored.states[6]).toMatchObject({ destroyed: true, nextAffixId: 4 })
    expect(restored.states[6]?.affixes.map((affix) => [affix.affixId, affix.modId])).toEqual([
      ['a1', 'FireResist4'],
      ['a2', 'IncreasedLife1'],
      ['a3', 'FireResist4'],
    ])
    const { fluxCatalogSignature: _signature, ...unsigned } = input
    expect(read(unsigned)).toMatchObject({ ok: false, error: expect.stringContaining('签名') })
    expect(read({ ...input, fluxCatalogSignature: 'wrong' }).ok).toBe(false)
    expect(read({ ...unsigned, operations: [] }).ok).toBe(false)
    must(read({ ...input, operations: [] }))
    const template = { ...legacyProject(75), targetDefinitions: input.targetDefinitions }
    const reused = must(
      reuseTargetCraftPlan(JSON.stringify(input), JSON.stringify(template), catalog),
    )
    expect(reused.project.rulesVersion).toBe(version)
    expect(reused.project.fluxCatalogSignature).toBe(input.fluxCatalogSignature)
    expect(reused.project.operations).toEqual(input.operations)
  })

  it('能力检测区分所有旧结果与报价，不执行访问器，不把文本当动作', () => {
    expect(CORRUPTION_STRATEGY_RULES_VERSION).toBe(version)
    for (const old of [
      { kind: 'vaal', outcome: 'unchanged' },
      { kind: 'vaal', outcome: 'socket' },
      { kind: 'vaal', outcome: 'enchant', modId: 'x', values: [1] },
      { kind: 'vaal', outcome: 'reroll', replacements: [] },
      { kind: 'architect', outcome: 'destroy' },
      { kind: 'architect', outcome: 'enchant', modId: 'x', values: [1] },
      { pricing: { prices: { 'currency:vaal': 1, 'currency:architect': 2 } } },
      { corrupted: true, twiceCorrupted: true },
      { sourceText: '{"kind":"vaal"}' },
    ])
      expect(requiresCorruptionStrategyProjectVersion(old)).toBe(false)
    for (const action of [{ kind: 'vaal' }, { kind: 'architect' }])
      expect(requiresCorruptionStrategyProjectVersion({ strategy: { rules: [{ action }] } })).toBe(
        true,
      )
    expect(
      requiresCorruptionStrategyProjectVersion({
        kind: 'not',
        condition: { kind: 'corruption-state', value: 'none' },
      }),
    ).toBe(true)
    expect(
      requiresCorruptionStrategyProjectVersion(
        Object.defineProperty({}, 'kind', {
          get() {
            throw Error('不能执行getter')
          },
        }),
      ),
    ).toBe(false)
    const loop: { cycle?: unknown; rule: unknown } = { rule: { kind: 'architect' } }
    loop.cycle = loop
    expect(requiresCorruptionStrategyProjectVersion(loop)).toBe(true)
    const restored = must(read(project()))
    const undefinedInput = { ...restored.project, extra: undefined }
    expect(serializeTargetCraftProject(undefinedInput, catalog).ok).toBe(false)
  })
})

function legacyProject(n: number) {
  const { nextAffixId: _identity, ...legacyState } = project().initialState
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: `basic-${n >= 76 ? '2026-09-16' : '2026-09-12'}-v${n}`,
    initialState: n >= 73 ? project().initialState : legacyState,
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
