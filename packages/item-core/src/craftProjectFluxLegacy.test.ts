import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { type CraftProject, parseCraftProject } from './craftProject'
import { upgradeCraftProjectIdentity } from './craftProjectIdentity'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, upgradeTargetCraftProject } from './craftProjectTargets'
import type { CraftResult } from './rehearsal'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
const fluxId = 'Metadata/Items/Currency/CurrencyArcaneFluxFire'
const operationError = 'v2–v74 项目不能包含溶剂步骤或指引，包括撤销位置之后的步骤。 '
const pricingError = 'v2–v74 项目不能包含溶剂报价。 '

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

function baseline(version: 72 | 73 | 74) {
  const legacy: CraftProject = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-12-v72',
    initialState: {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    },
    operations: [{ currency: 'transmutation', modIds: ['ColdResist1'] }],
    cursor: 0,
    pricing: { unit: 'divine', prices: {} },
    strategyStartStep: 0,
    strategy: {
      maxSteps: 10,
      flow: {
        entryStageId: 'start',
        stages: [
          { id: 'start', name: '当前阶段' },
          { id: 'later', name: '未进入阶段' },
        ],
      },
      rules: [
        { stageId: 'start', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
        {
          stageId: 'later',
          conditions: [
            { kind: 'all', conditions: [{ kind: 'not', condition: { kind: 'always' } }] },
          ],
          action: { kind: 'stop' },
        },
      ],
    },
  }
  must(parseCraftProject(JSON.stringify(legacy), catalog))
  if (version === 72) return legacy
  const identity = must(upgradeCraftProjectIdentity(JSON.stringify(legacy), catalog)).project
  return version === 73
    ? identity
    : must(upgradeTargetCraftProject(JSON.stringify(identity), catalog)).project
}

function read(version: 72 | 73 | 74, input: unknown): CraftResult<unknown> {
  const parser =
    version === 72
      ? parseCraftProject
      : version === 73
        ? parseIdentityCraftProject
        : parseTargetCraftProject
  return parser(JSON.stringify(input), catalog)
}

describe.each([72, 73, 74] as const)('v%s 合法基线独立注入 Flux', (version) => {
  it('cursor 后的新步骤不能被旧版本当作合法未来历史', () => {
    const source = baseline(version)
    expect(read(version, source).ok).toBe(true)
    expect(source.cursor).toBe(0)
    expect(source).not.toHaveProperty('fluxCatalogSignature')
    const original = structuredClone(source)
    const operation = {
      kind: 'flux' as const,
      fluxId,
      rolls: [{ affixId: 'a1', modId: 'FireResist1', values: [8] }],
    }
    // 完整新操作先被旧原树身份门禁阻止；不允许把该处 aN 当作旧已知位置清洗。
    expect(read(version, { ...source, operations: [...source.operations, operation] })).toEqual({
      ok: false,
      error: 'v2–v72 项目尚不支持词缀实例字段，不能恢复此状态或历史。',
    })
    // 仅从新注入的操作去掉 aN，隔离新增 kind 门禁；旧基线其余字段完全不动。
    const noIdentity = {
      ...operation,
      rolls: operation.rolls.map(({ affixId: _, ...roll }) => roll),
    }
    expect(read(version, { ...source, operations: [...source.operations, noIdentity] })).toEqual({
      ok: false,
      error: operationError,
    })
    expect(source).toEqual(original)
  })

  it('嵌套条件所在的未进入阶段也不能保存新材料动作', () => {
    const source = baseline(version)
    expect(read(version, source).ok).toBe(true)
    const modified = structuredClone(source)
    const later = modified.strategy?.rules[1]
    if (!later) throw new Error('缺少未进入阶段夹具')
    expect(later.stageId).toBe('later')
    expect(modified.strategy?.flow?.entryStageId).toBe('start')
    later.action = { kind: 'flux', fluxId }
    expect(modified.operations).toEqual(source.operations)
    expect(read(version, modified)).toEqual({ ok: false, error: operationError })
  })

  it('只新增合法材料的报价键也必须命中版本门禁', () => {
    const source = baseline(version)
    expect(read(version, source).ok).toBe(true)
    const modified = structuredClone(source)
    if (!modified.pricing) throw new Error('缺少报价夹具')
    modified.pricing.prices[`flux:${fluxId}`] = 2
    expect(modified.operations).toEqual(source.operations)
    expect(modified.strategy).toEqual(source.strategy)
    expect(read(version, modified)).toEqual({ ok: false, error: pricingError })
  })
})
