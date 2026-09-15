import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isIdentifiedCraftState } from './affixIdentity'
import { boneCatalog } from './boneTestFixture'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import {
  PERFECT_FLUX_CRAFT_RULES_VERSION,
  parseTargetCraftProject,
  requiresPerfectFluxProjectVersion,
  serializeTargetCraftProject,
  type TargetCraftProject,
} from './craftProjectTargets'
import { inspectItem } from './export'
import { fluxCatalogSignature } from './fluxes'
import { parseItem } from './parse'
import { type CraftResult, createCraftState } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog = boneCatalog('Sceptre')
const base = catalog.bases[0]
if (!base) throw Error('缺少基底')
base.implicit = 'Grants Skill: Level (1-20) Test Minion'
const real: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function project(): TargetCraftProject {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: PERFECT_FLUX_CRAFT_RULES_VERSION,
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 70,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
      implicitLines: ['Grants Skill: Level (1-20) Test Minion'],
    },
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
    operations: [
      { kind: 'perfect-flux', previousMaxLevel: 13 },
      {
        currency: 'transmutation',
        modIds: ['prefix1'],
        rolls: [{ affixId: 'a1', modId: 'prefix1', values: [5] }],
      },
    ],
    cursor: 0,
  }
}

describe('v76 完美溶剂严格项目', () => {
  it('限制内的大型非法历史返回校验错误，不因能力扫描参数展开而抛异常', () => {
    const text = JSON.stringify({ ...project(), operations: Array(150_000).fill(null) })
    expect(parseTargetCraftProject(text, catalog).ok).toBe(false)
  })
  it('没有抗性表也回放完整未来历史，保留原观察、结果及后续实例', () => {
    const input = project(),
      original = structuredClone(input)
    const saved = must(serializeTargetCraftProject(input, catalog))
    for (const cursor of [0, 1, 2]) {
      const restored = must(
        loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog),
      )
      expect(restored.states).toHaveLength(3)
      expect(restored.states[0]).not.toHaveProperty('grantedSkillLevel')
      expect(restored.states[1]).toMatchObject({ grantedSkillLevel: 20, nextAffixId: 1 })
      expect(restored.states[2]).toMatchObject({ grantedSkillLevel: 20, nextAffixId: 2 })
      expect(restored.states[2]?.affixes[0]?.affixId).toBe('a1')
      expect(restored.states[2]?.implicitLines).toEqual(input.initialState.implicitLines)
      expect(restored.project).toEqual({ ...input, cursor })
      expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual({
        ...input,
        cursor,
      })
    }
    expect(JSON.parse(saved)).not.toHaveProperty('fluxCatalogSignature')
    expect(input).toEqual(original)
  })

  it('来源最高级声明必须精确回放，原观察20不补造消费', () => {
    const imported = (line: string) => {
      const raw = `Item Class: Sceptres\nRarity: Normal\nSynthetic Base\n--------\nItem Level: 70\n--------\n${line}`
      const parsed = parseItem(raw)
      if (!parsed.ok) throw Error(parsed.error)
      const state = must(
        importIdentifiedCraftState(
          catalog,
          'Synthetic Base',
          parsed.item,
          inspectItem(parsed.item, createCraftItemDictionary(catalog, {})),
        ),
      )
      if (!isIdentifiedCraftState(state)) throw Error('缺少导入身份')
      return state
    }
    const input = project()
    input.initialState = imported('Grants Skill: Level 12 Test Minion (Max Level 13)')
    const restored = must(parseTargetCraftProject(JSON.stringify(input), catalog))
    expect(restored.states[1]?.sourceText).toBe(input.initialState.sourceText)
    expect(
      parseTargetCraftProject(
        JSON.stringify({ ...input, operations: [{ kind: 'perfect-flux', previousMaxLevel: 12 }] }),
        catalog,
      ).ok,
    ).toBe(false)
    input.initialState = imported('Grants Skill: Level 20 Test Minion')
    input.operations = []
    const observed = must(parseTargetCraftProject(JSON.stringify(input), catalog))
    expect(observed.states[0]).not.toHaveProperty('grantedSkillLevel')
    expect(requiresPerfectFluxProjectVersion(observed.project)).toBe(false)
    expect(
      parseTargetCraftProject(
        JSON.stringify({ ...input, operations: [{ kind: 'perfect-flux', previousMaxLevel: 19 }] }),
        catalog,
      ).ok,
    ).toBe(false)
  })

  it('v76抗性能力仍需精确签名，转换后的目标和观察实例不能借已加载目录绕过', () => {
    const input: TargetCraftProject = {
      ...project(),
      sourceCommit: real._meta.sourceCommit,
      initialState: {
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        nextAffixId: 1,
        sourceText: null,
      },
      operations: [],
      fluxCatalogSignature: fluxCatalogSignature(real) ?? '',
      targetDefinitions: {
        nextTargetId: 3,
        targets: [
          { targetId: 't1', modId: 'FireResist1' },
          { targetId: 't2', modId: 'FireResist1' },
        ],
        alternatives: [],
        values: [],
      },
    }
    const candidate = must(parseTargetCraftProject(JSON.stringify(input), real))
    expect(candidate.project.targetDefinitions.targets).toHaveLength(2)
    const { fluxCatalogSignature: _, ...unsigned } = input
    expect(parseTargetCraftProject(JSON.stringify(unsigned), real).ok).toBe(false)
    const state = must(
      createCraftState(real, {
        ...input.initialState,
        rarity: 'rare',
        nextAffixId: 3,
        affixes: [
          { affixId: 'a1', modId: 'FireResist1', lines: ['+8% to Fire Resistance'] },
          { affixId: 'a2', modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
        ],
      }),
    )
    const text = must(exportCraftItemText(real, state)).text
    const parsed = parseItem(text)
    if (!parsed.ok) throw Error(parsed.error)
    const observed = must(
      importIdentifiedCraftState(
        real,
        'Gold Ring',
        parsed.item,
        inspectItem(parsed.item, createCraftItemDictionary(real, {})),
      ),
    )
    if (!isIdentifiedCraftState(observed)) throw Error('缺少导入身份')
    input.initialState = observed
    must(parseTargetCraftProject(JSON.stringify(input), real))
    const noTargets = { ...input, targetDefinitions: project().targetDefinitions }
    const { fluxCatalogSignature: _signature, ...noSignature } = noTargets
    expect(parseTargetCraftProject(JSON.stringify(noSignature), real).ok).toBe(false)
    const future = {
      ...noTargets,
      operations: [
        {
          kind: 'flux',
          fluxId: 'Metadata/Items/Currency/CurrencyArcaneFluxCold',
          rolls: [
            { affixId: 'a1', modId: 'ColdResist1', values: [8] },
            { affixId: 'a2', modId: 'ColdResist1', values: [9] },
          ],
        },
      ],
    }
    expect(
      must(parseTargetCraftProject(JSON.stringify(future), real)).states[1]?.affixes.map(
        (affix) => affix.modId,
      ),
    ).toEqual(['ColdResist1', 'ColdResist1'])
    const { fluxCatalogSignature: _futureSignature, ...unsignedFuture } = future
    expect(parseTargetCraftProject(JSON.stringify(unsignedFuture), real)).toMatchObject({
      ok: false,
      error: expect.stringContaining('签名'),
    })
    expect(
      parseTargetCraftProject(JSON.stringify({ ...input, fluxCatalogSignature: 'wrong' }), real).ok,
    ).toBe(false)
    const { fluxes: _table, ...primary } = real
    expect(parseTargetCraftProject(JSON.stringify(input), primary).ok).toBe(false)
    const quoted = {
      ...unsigned,
      targetDefinitions: project().targetDefinitions,
      pricing: {
        unit: 'divine',
        prices: { 'flux:Metadata/Items/Currency/CurrencyArcaneFluxFire': 1 },
      },
    }
    expect(parseTargetCraftProject(JSON.stringify(quoted), real)).toMatchObject({
      ok: false,
      error: expect.stringContaining('签名'),
    })
  })

  it('拒绝初始结果伪造、非法声明、重复消费和未来步骤漏身份', () => {
    const input = project()
    must(parseTargetCraftProject(JSON.stringify(input), catalog))
    for (const bad of [
      { ...input, initialState: { ...input.initialState, grantedSkillLevel: 20 } },
      { ...input, operations: [{ kind: 'perfect-flux', previousMaxLevel: 20 }] },
      { ...input, operations: [{ kind: 'perfect-flux', previousMaxLevel: 13, extra: true }] },
      { ...input, operations: [input.operations[0], input.operations[0]] },
      {
        ...input,
        operations: [
          input.operations[0],
          {
            currency: 'transmutation',
            modIds: ['prefix1'],
            rolls: [{ modId: 'prefix1', values: [5] }],
          },
        ],
      },
    ])
      expect(parseTargetCraftProject(JSON.stringify(bad), catalog).ok).toBe(false)
  })

  it('新报价和禁用嵌套技能条件需要v76，保存与沿用保留版本但不搬历史', () => {
    const input = project()
    input.pricing = { unit: 'divine', prices: { 'currency:perfect-flux': 2 } }
    input.strategy = {
      maxSteps: 5,
      rules: [
        {
          conditions: [{ kind: 'not', condition: { kind: 'granted-skill-level', min: 20 } }],
          action: { kind: 'perfect-flux', previousMaxLevel: 13 },
        },
      ],
    }
    const text = must(serializeTargetCraftProject(input, catalog))
    const receiver = { ...project(), rulesVersion: 'basic-2026-09-12-v74' as const, operations: [] }
    const received = must(
      reuseTargetCraftPlan(must(serializeTargetCraftProject(receiver, catalog)), text, catalog),
    )
    expect(received.project.rulesVersion).toBe(PERFECT_FLUX_CRAFT_RULES_VERSION)
    expect(received.project.operations).toEqual([])
    expect(received.states[0]).not.toHaveProperty('grantedSkillLevel')
    expect(received.project.strategy).toEqual(input.strategy)
  })

  it('能力检测覆盖未来操作、嵌套条件、结果与报价，不将普通Level20观察当历史', () => {
    for (const input of [
      project(),
      { states: [{ grantedSkillLevel: 20 }] },
      {
        strategy: {
          rules: [
            { conditions: [{ kind: 'not', condition: { kind: 'granted-skill-level', min: 20 } }] },
          ],
        },
      },
      { pricing: { prices: { 'currency:perfect-flux': 1 } } },
    ])
      expect(requiresPerfectFluxProjectVersion(input)).toBe(true)
    expect(
      requiresPerfectFluxProjectVersion({ implicitLines: ['Grants Skill: Level 20 Test Minion'] }),
    ).toBe(false)
    expect(requiresPerfectFluxProjectVersion({ kind: 'flux', fluxId: 'x' })).toBe(false)
  })

  it('沿用旧目标方案保留接收方v76完整历史与报价，不降级或移除技能结果', () => {
    const current = project()
    current.cursor = 1
    current.pricing = { unit: 'divine', prices: { 'currency:perfect-flux': 3 } }
    const template: TargetCraftProject = {
      ...project(),
      rulesVersion: 'basic-2026-09-12-v74',
      operations: [],
      targetDefinitions: {
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: 'prefix1' }],
        alternatives: [],
        values: [],
      },
    }
    const restored = must(
      reuseTargetCraftPlan(
        must(serializeTargetCraftProject(current, catalog)),
        must(serializeTargetCraftProject(template, catalog)),
        catalog,
      ),
    )
    expect(restored.project.rulesVersion).toBe(PERFECT_FLUX_CRAFT_RULES_VERSION)
    expect(restored.project.operations).toEqual(current.operations)
    expect(restored.project.cursor).toBe(1)
    expect(restored.project.pricing).toEqual(current.pricing)
    expect(restored.states[2]?.grantedSkillLevel).toBe(20)
    expect(restored.project.targetDefinitions).toEqual(template.targetDefinitions)
  })

  it('v2–v75合法基线分别拒绝未来新操作、未使用条件、报价和结果字段', () => {
    for (let version = 2; version <= 75; version++) {
      const initial = {
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
      }
      const input = {
        schemaVersion: 1,
        sourceCommit: real._meta.sourceCommit,
        rulesVersion: `basic-2026-09-12-v${version}`,
        initialState: version >= 73 ? { ...initial, nextAffixId: 1 } : initial,
        operations: [],
        cursor: 0,
        ...(version >= 74
          ? {
              targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
              orphanedTargets: [],
            }
          : {}),
        ...(version === 75 ? { fluxCatalogSignature: fluxCatalogSignature(real) } : {}),
      }
      const parse =
        version <= 72
          ? parseCraftProject
          : version === 73
            ? parseIdentityCraftProject
            : parseTargetCraftProject
      expect(parse(JSON.stringify(input), real).ok, `v${version} baseline`).toBe(true)
      for (const bad of [
        { ...input, operations: [{ kind: 'perfect-flux', previousMaxLevel: 13 }] },
        {
          ...input,
          strategy: {
            maxSteps: 2,
            rules: [
              {
                conditions: [{ kind: 'not', condition: { kind: 'granted-skill-level', min: 20 } }],
                action: { kind: 'stop' },
              },
            ],
          },
        },
        { ...input, pricing: { unit: 'divine', prices: { 'currency:perfect-flux': 1 } } },
        { ...input, initialState: { ...input.initialState, grantedSkillLevel: 20 } },
      ]) {
        const rejected = parse(JSON.stringify(bad), real)
        expect(rejected.ok, `v${version}`).toBe(false)
        if (!rejected.ok) expect(rejected.error).toContain('v76')
      }
    }
  })
})
