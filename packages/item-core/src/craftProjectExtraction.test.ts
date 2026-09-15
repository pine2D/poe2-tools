import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { prepareExtractionCraft } from './extraction'
import {
  EXTRACTION_CRAFT_RULES_VERSION,
  requiresExtractionProjectVersion,
} from './extractionProjectVersion'
import { fluxCatalogSignature } from './fluxes'
import type { CraftResult } from './rehearsal'
import { socketHash, socketStrategyCatalog } from './socketStrategyFixture'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const version = 'basic-2026-09-16-v77'
const catalog = socketStrategyCatalog()
const base = catalog.bases[0]
if (!base) throw Error('缺少基底')
base.socketLimit = 3
const real: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: version,
    augmentSourceHash: socketHash,
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 64,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
      sockets: [null, null, null],
    },
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
    operations: [
      { kind: 'socket', socketIndex: 0, augmentId: 'fire' },
      { kind: 'socket', socketIndex: 1, augmentId: 'fire' },
      { kind: 'socket', socketIndex: 2, augmentId: 'cold' },
      { kind: 'extraction' },
    ],
    cursor: 0,
  }
}
const read = (input: unknown, source = catalog) =>
  parseTargetCraftProject(JSON.stringify(input), source)

describe('v77 萃取石严格项目', () => {
  it('所有游标均完整回放未来萃取，保留逐孔快照且不持久化返还清单', () => {
    const input = project(),
      original = structuredClone(input)
    for (const cursor of [0, 1, 2, 3, 4]) {
      const restored = must(
        loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), catalog),
      )
      expect(restored.states).toHaveLength(5)
      expect(restored.states[3]?.sockets).toEqual(['fire', 'fire', 'cold'])
      expect(restored.states[4]).toEqual({ ...restored.states[3], destroyed: true })
      expect(restored.states[4]).not.toHaveProperty('returns')
      const before = restored.states[3]
      if (!before) throw Error('缺少萃取前态')
      expect(must(prepareExtractionCraft(catalog, before)).returns).toEqual([
        { augmentId: 'fire', name: 'Desert Rune', count: 2, socketIndices: [0, 1] },
        { augmentId: 'cold', name: 'Glacial Rune', count: 1, socketIndices: [2] },
      ])
      expect(restored.project).toEqual({ ...input, cursor })
      expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual({
        ...input,
        cursor,
      })
    }
    expect(input).toEqual(original)
  })

  it('拒绝预装终态、派生字段、空孔萃取与销毁后的未来步骤', () => {
    must(read(project()))
    const input = project()
    for (const invalid of [
      { ...input, initialState: { ...input.initialState, destroyed: true } },
      { ...input, operations: [...input.operations, { kind: 'extraction' }] },
      { ...input, operations: [{ kind: 'extraction' }] },
      {
        ...input,
        operations: [...input.operations.slice(0, 3), { kind: 'extraction', returns: [] }],
      },
      { ...input, returns: [] },
      {
        ...input,
        operations: [...input.operations, { kind: 'socket', socketIndex: 0, augmentId: 'cold' }],
      },
    ])
      expect(read(invalid).ok).toBe(false)
  })

  it('镶嵌来源缺失、错误、目录漂移与绑定状态漂移均不能恢复', () => {
    const input = project()
    must(read(input))
    const { augmentSourceHash: _hash, ...missing } = input
    expect(read(missing)).toMatchObject({ ok: false, error: expect.stringContaining('镶嵌物来源') })
    expect(read({ ...input, augmentSourceHash: 'f'.repeat(64) }).ok).toBe(false)
    const changed = structuredClone(catalog)
    const source = changed._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
    if (!source) throw Error('缺少来源')
    source.sha256 = 'f'.repeat(64)
    expect(read(input, changed).ok).toBe(false)
    const bound = structuredClone(catalog)
    const augment = bound.augments?.[0]
    if (!augment) throw Error('缺少镶嵌物')
    augment.isSocketBound = true
    expect(read(input, bound).ok).toBe(false)
  })

  it('已核对孔位的原始文本重新验证，萃取不改写观察或伪造镶嵌历史', () => {
    const sourceText =
      'Item Class: Body Armours\nRarity: Normal\nSynthetic Base\n--------\nItem Level: 64'
    const input = {
      ...project(),
      importedSockets: ['fire', 'fire', 'cold'],
      initialState: { ...project().initialState, sourceText, sockets: ['fire', 'fire', 'cold'] },
      operations: [{ kind: 'extraction' }],
      cursor: 1,
    }
    const restored = must(read(input))
    expect(restored.states).toHaveLength(2)
    expect(restored.states[1]?.sourceText).toBe(sourceText)
    expect(restored.project.operations).toEqual([{ kind: 'extraction' }])
    expect(restored.project.importedSockets).toEqual(input.importedSockets)
    expect(read({ ...input, importedSockets: ['fire', null, 'cold'] }).ok).toBe(false)
    expect(read({ ...input, initialState: { ...input.initialState, itemLevel: 65 } }).ok).toBe(
      false,
    )
    const withUndefined = { ...restored.project, unused: undefined }
    expect(serializeTargetCraftProject(withUndefined, catalog).ok).toBe(false)
  })

  it('沿用萃取指引提升版本但不搬历史，沿用旧目标保留接收方完整终态历史', () => {
    const input = project()
    const source = {
      ...input,
      strategy: {
        maxSteps: 5,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'extraction' } }],
      },
    }
    const receiver = { ...input, rulesVersion: 'basic-2026-09-12-v74', operations: [] }
    const received = must(
      reuseTargetCraftPlan(JSON.stringify(receiver), JSON.stringify(source), catalog),
    )
    expect(received.project.rulesVersion).toBe(version)
    expect(received.project.operations).toEqual([])
    expect(received.states).toHaveLength(1)
    expect(received.states[0]).not.toHaveProperty('destroyed')
    expect(received.project).not.toHaveProperty('returns')
    const template = {
      ...receiver,
      targetDefinitions: {
        ...receiver.targetDefinitions,
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: 'prefix1' }],
      },
    }
    const kept = must(
      reuseTargetCraftPlan(
        JSON.stringify({ ...input, cursor: 4 }),
        JSON.stringify(template),
        catalog,
      ),
    )
    expect(kept.project.rulesVersion).toBe(version)
    expect(kept.project.operations).toEqual(input.operations)
    expect(kept.states[4]?.destroyed).toBe(true)
  })

  it('仅报价也要求v77，合法v2–v76基线分别拒绝未来操作、嵌套阶段动作和报价', () => {
    must(
      read({
        ...project(),
        operations: [],
        pricing: { unit: 'divine', prices: { 'currency:extraction': 2 } },
      }),
    )
    for (let n = 2; n <= 76; n++) {
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
        rulesVersion: n === 76 ? 'basic-2026-09-16-v76' : `basic-2026-09-12-v${n}`,
        initialState: n >= 73 ? { ...initial, nextAffixId: 1 } : initial,
        operations: [],
        cursor: 0,
        ...(n >= 74 ? { targetDefinitions: project().targetDefinitions, orphanedTargets: [] } : {}),
        ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(real) } : {}),
      }
      const parse =
        n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
      expect(parse(JSON.stringify(input), real).ok, `v${n} baseline`).toBe(true)
      for (const injected of [
        { ...input, operations: [{ kind: 'extraction' }] },
        {
          ...input,
          strategy: {
            maxSteps: 2,
            flow: {
              entryStageId: 'start',
              stages: [
                { id: 'start', name: '起点' },
                { id: 'later', name: '未进入' },
              ],
            },
            rules: [
              {
                stageId: 'later',
                conditions: [{ kind: 'not', condition: { kind: 'always' } }],
                action: { kind: 'extraction' },
              },
            ],
          },
        },
        { ...input, pricing: { unit: 'divine', prices: { 'currency:extraction': 1 } } },
      ])
        expect(parse(JSON.stringify(injected), real), `v${n}`).toMatchObject({
          ok: false,
          error: expect.stringContaining('v77'),
        })
    }
  })

  it('继承完美溶剂结果与原观察，未加载抗性表也可萃取', () => {
    const { fluxes: _fluxes, ...withoutFlux } = real
    const input = {
      ...project(),
      sourceCommit: real._meta.sourceCommit,
      augmentSourceHash: real._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')?.sha256,
      initialState: {
        ...project().initialState,
        baseId: 'Ashen Staff',
        itemLevel: 86,
        sockets: [null],
        implicitLines: ['Grants Skill: Level (1-20) Firebolt'],
      },
      operations: [
        { kind: 'perfect-flux', previousMaxLevel: 13 },
        { kind: 'socket', socketIndex: 0, augmentId: 'pob2:augment:["Mind Rune","staff"]' },
        { kind: 'extraction' },
      ],
    }
    const restored = must(read(input, withoutFlux))
    expect(restored.states[3]).toMatchObject({
      grantedSkillLevel: 20,
      destroyed: true,
      implicitLines: input.initialState.implicitLines,
    })
    expect(restored.states[0]).not.toHaveProperty('grantedSkillLevel')
    expect(restored.project).not.toHaveProperty('fluxCatalogSignature')
    expect(JSON.parse(must(serializeTargetCraftProject(restored.project, withoutFlux)))).toEqual(
      input,
    )
  })

  it('继承真实抗性转换与同类目标仍要求精确签名，不能借已加载表放宽无签名资格', () => {
    const input = {
      ...project(),
      sourceCommit: real._meta.sourceCommit,
      augmentSourceHash: real._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')?.sha256,
      fluxCatalogSignature: fluxCatalogSignature(real),
      initialState: {
        ...project().initialState,
        baseId: "Adherent's Raiment",
        itemLevel: 86,
        sockets: [null],
      },
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
        { kind: 'socket', socketIndex: 0, augmentId: 'pob2:augment:["Desert Rune","armour"]' },
        { kind: 'extraction' },
      ],
    }
    const restored = must(read(input, real))
    expect(restored.states[6]).toMatchObject({ destroyed: true, nextAffixId: 4 })
    expect(restored.states[6]?.affixes.map((a) => [a.affixId, a.modId])).toEqual([
      ['a1', 'FireResist4'],
      ['a2', 'IncreasedLife1'],
      ['a3', 'FireResist4'],
    ])
    const { fluxCatalogSignature: _signature, ...unsigned } = input
    expect(read(unsigned, real)).toMatchObject({
      ok: false,
      error: expect.stringContaining('签名'),
    })
    expect(read({ ...input, fluxCatalogSignature: 'wrong' }, real).ok).toBe(false)
    const noHistory = { ...unsigned, operations: [] }
    expect(read(noHistory, real).ok).toBe(false)
    must(read({ ...noHistory, fluxCatalogSignature: input.fluxCatalogSignature }, real))
  })

  it('只检测结构能力，不推断销毁原因或观察文字，并安全扫描全部未来与共享结构', () => {
    expect(EXTRACTION_CRAFT_RULES_VERSION).toBe(version)
    for (const input of [
      project(),
      { pricing: { prices: { 'currency:extraction': 0 } } },
      { strategy: { flow: { stages: [{ action: { kind: 'extraction' } }] } } },
    ])
      expect(requiresExtractionProjectVersion(input)).toBe(true)
    for (const input of [
      { destroyed: true },
      { kind: 'architect', outcome: 'destroy' },
      { sourceText: 'currency:extraction' },
      { kind: 'perfect-flux', previousMaxLevel: 13 },
    ])
      expect(requiresExtractionProjectVersion(input)).toBe(false)
    const cyclic: { cycle?: unknown; operations: unknown[] } = {
      operations: [{ kind: 'extraction' }],
    }
    cyclic.cycle = cyclic
    expect(requiresExtractionProjectVersion(cyclic)).toBe(true)
    expect(
      requiresExtractionProjectVersion(
        Object.defineProperty({}, 'kind', {
          get() {
            throw Error('不能执行getter')
          },
        }),
      ),
    ).toBe(false)
    expect(read({ ...project(), operations: Array(150_000).fill(null) }).ok).toBe(false)
  })

  it('未执行萃取指引要求镶嵌来源，而仅报价不凭空要求镶嵌或抗性表', () => {
    const { augmentSourceHash: _hash, ...withoutHash } = project()
    const { sockets: _sockets, ...unknownSockets } = withoutHash.initialState
    const blank = { ...withoutHash, initialState: unknownSockets, operations: [] }
    must(read({ ...blank, pricing: { unit: 'divine', prices: { 'currency:extraction': 2 } } }))
    const configured = {
      ...blank,
      strategy: {
        maxSteps: 2,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'extraction' } }],
      },
    }
    expect(read(configured)).toMatchObject({
      ok: false,
      error: expect.stringContaining('镶嵌物来源'),
    })
    must(read({ ...configured, augmentSourceHash: socketHash }))
  })
})
