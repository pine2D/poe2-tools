import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { CORRUPTION_SOURCE } from './corruptionSource'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  MAX_CRAFT_PROJECT_BYTES,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { upgradeCraftProjectIdentity } from './craftProjectIdentity'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { serializeIdentityCraftProject } from './craftProjectIdentitySerializer'
import { DESECRATION_SOURCE } from './desecration'
import type { ItemDictionary } from './export'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { catalog as makeCatalog } from './partialTargetFixture'
import { reuseCraftPlan, reuseIdentityCraftPlan } from './projectPlan'
import type { CraftResult } from './rehearsal'
import { socketStrategyCatalog } from './socketStrategyFixture'
import { STAT_SCALABILITY_SOURCE } from './statScalability'
import { loadWorkbenchProject } from './workbenchProject'

const catalog = makeCatalog()
const must = <T>(result: CraftResult<T>): T => {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function project(): CraftProject {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: {
      baseId: 'Focus',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
    },
    operations: [
      { currency: 'transmutation', modIds: ['p1'], rolls: [{ modId: 'p1', values: [5] }] },
      { currency: 'augmentation', modIds: ['s1'], rolls: [{ modId: 's1', values: [6] }] },
      { currency: 'regal', modIds: ['p2'], rolls: [{ modId: 'p2', values: [7] }] },
      { currency: 'exalted', modIds: ['s2'], rolls: [{ modId: 's2', values: [8] }] },
      {
        currency: 'chaos',
        removeModId: 'p1',
        modIds: ['p1'],
        rolls: [{ modId: 'p1', values: [9] }],
      },
      { kind: 'fracture', modId: 'p1' },
    ],
    cursor: 2,
    pricing: { unit: 'divine', prices: {}, baseCost: 2 },
    targetModIds: ['p1'],
    targetValues: [{ modId: 'p1', bounds: [{ index: 0, min: 7 }] }],
    targetAlternatives: [{ targetModId: 'p1', modIds: ['high'] }],
    targetFracturedModId: 'p1',
    minimumTargetCount: 1,
    strategy: {
      maxSteps: 20,
      flow: { entryStageId: 'first', stages: [{ id: 'first', name: '第一阶段' }] },
      rules: [{ stageId: 'first', conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
    strategyStartStep: 1,
  }
}
function template(): CraftProject {
  return {
    ...project(),
    initialState: { ...project().initialState, itemLevel: 90 },
    operations: [],
    cursor: 0,
    strategyStartStep: 0,
    targetModIds: ['s1'],
    targetValues: [{ modId: 's1', bounds: [{ index: 0, min: 8 }] }],
    targetAlternatives: [],
    targetFracturedModId: 's1',
    pricing: { unit: 'divine', prices: {}, baseCost: 99 },
  }
}
const identity = (input: CraftProject, source = catalog) =>
  must(upgradeCraftProjectIdentity(JSON.stringify(input), source))
const text = (input: CraftProject, identified: boolean, source = catalog) =>
  identified ? JSON.stringify(identity(input, source).project) : JSON.stringify(input)

describe('工作台项目加载', () => {
  it('v72 自动升级全部未来历史，v73 严格恢复保持完整结果', () => {
    const original = project()
    const expected = identity(original)
    expect(loadWorkbenchProject(JSON.stringify(original), catalog)).toEqual({
      ok: true,
      value: expected,
    })
    expect(loadWorkbenchProject(JSON.stringify(expected.project), catalog)).toEqual({
      ok: true,
      value: expected,
    })
    expect(expected.states).toHaveLength(7)
    expect(expected.project.operations[4]).toMatchObject({
      removeAffixId: 'a1',
      rolls: [{ affixId: 'a5' }],
    })
    expect(expected.project.operations[5]).toMatchObject({ affixId: 'a5' })
    const { initialState: _, operations: __, rulesVersion: ___, ...metadata } = expected.project
    const {
      initialState: a,
      operations: b,
      rulesVersion: c,
      ...originalMetadata
    } = must(parseCraftProject(JSON.stringify(original), catalog)).project
    expect(metadata).toEqual(originalMetadata)
  })

  it('v73 缺失 ID 不修复，旧版本不能借分派绕过历史门槛', () => {
    const upgraded = identity(project()).project
    const broken = {
      ...upgraded,
      initialState: { ...upgraded.initialState, nextAffixId: undefined },
    }
    expect(loadWorkbenchProject(JSON.stringify(broken), catalog)).toEqual(
      parseIdentityCraftProject(JSON.stringify(broken), catalog),
    )
    expect(loadWorkbenchProject(JSON.stringify(broken), catalog).ok).toBe(false)
    const old = { ...project(), rulesVersion: 'basic-2026-09-12-v2' }
    expect(loadWorkbenchProject(JSON.stringify(old), catalog).ok).toBe(false)
    expect(
      loadWorkbenchProject(
        JSON.stringify({ ...old, rulesVersion: 'basic-2026-09-12-v74' }),
        catalog,
      ).ok,
    ).toBe(false)
  })

  it.each([false, true])('游标后的坏操作仍拒绝：identified=%s', (identified) => {
    const value = JSON.parse(text(project(), identified))
    value.operations[5].modId = 'missing'
    expect(loadWorkbenchProject(JSON.stringify(value), catalog).ok).toBe(false)
  })

  it('先检查原始 UTF-8 大小，再解析或分派', () => {
    for (const input of [
      ' '.repeat(MAX_CRAFT_PROJECT_BYTES + 1),
      `{${'中'.repeat(MAX_CRAFT_PROJECT_BYTES / 2)}`,
    ])
      expect(loadWorkbenchProject(input, catalog)).toEqual({
        ok: false,
        error: '演练项目超过 2 MB 限制。',
      })
    expect(loadWorkbenchProject('{bad', catalog).ok).toBe(false)
    expect(loadWorkbenchProject('null', catalog).ok).toBe(false)
  })
})

describe('实例工作台沿用方案', () => {
  it('新方案首次引入镶嵌流程时携带已验证指纹，未执行步骤不改装备', () => {
    const hash = 'b'.repeat(64)
    const source: CraftCatalog = {
      ...catalog,
      _meta: {
        ...catalog._meta,
        sources: [
          { path: 'src/Data/ModRunes.lua', url: 'https://example.test/runes', sha256: hash },
        ],
      },
    }
    const plan: CraftProject = {
      ...template(),
      augmentSourceHash: hash,
      strategy: {
        maxSteps: 20,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'artificer' } }],
      },
    }
    delete plan.strategyStartStep
    const current = identity(project(), source)
    const result = must(
      reuseIdentityCraftPlan(JSON.stringify(current.project), text(plan, false, source), source),
    )
    expect(result.project.augmentSourceHash).toBe(hash)
    expect(result.states).toEqual(current.states)
    expect(result.project.operations).toEqual(current.project.operations)
    expect(
      reuseIdentityCraftPlan(
        JSON.stringify(current.project),
        JSON.stringify({ ...plan, augmentSourceHash: 'c'.repeat(64) }),
        source,
      ).ok,
    ).toBe(false)
  })

  it('导入声明、原文、报价和各既有来源指纹不被模板缺省字段覆盖', () => {
    const hash = 'b'.repeat(64)
    const source: CraftCatalog = {
      ...catalog,
      augments: socketStrategyCatalog().augments ?? [],
      _meta: {
        ...catalog._meta,
        sourceCommit: CORRUPTION_SOURCE.commit,
        sources: [
          CORRUPTION_SOURCE,
          DESECRATION_SOURCE,
          LIQUID_EMOTION_SOURCE,
          STAT_SCALABILITY_SOURCE,
          { path: 'src/Data/ModRunes.lua', url: 'https://example.test/runes', sha256: hash },
          { path: 'src/Data/Essence.lua', url: 'https://example.test/essences', sha256: hash },
        ],
      },
    }
    const dictionary: ItemDictionary = { items: { bases: { Focus: '测试法器' }, uniques: {} } }
    const current: CraftProject = {
      ...project(),
      sourceCommit: source._meta.sourceCommit,
      initialState: {
        ...project().initialState,
        sockets: [null],
        quality: 25,
        sourceText: '物品类别: 法器\n稀有度: 普通\n测试法器\n--------\n物品等级: 86',
      },
      operations: [...project().operations, { kind: 'vaal', outcome: 'unchanged' }],
      importedSockets: [null],
      importedQuality: 25,
      augmentSourceHash: hash,
      essenceSourceHash: hash,
      corruptionSourceHash: CORRUPTION_SOURCE.sha256,
      desecrationSourceHash: DESECRATION_SOURCE.sha256,
      liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
      scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
    }
    const plan = { ...template(), sourceCommit: source._meta.sourceCommit }
    const old = must(
      reuseCraftPlan(JSON.stringify(current), JSON.stringify(plan), source, dictionary),
    )
    const expected = must(
      upgradeCraftProjectIdentity(JSON.stringify(old.project), source, dictionary),
    )
    const loaded = must(loadWorkbenchProject(JSON.stringify(current), source, dictionary))
    const result = must(
      reuseIdentityCraftPlan(
        JSON.stringify(loaded.project),
        JSON.stringify(plan),
        source,
        dictionary,
      ),
    )
    expect(result).toEqual(expected)
    expect(result.states).toEqual(loaded.states)
    expect(result.project).toMatchObject({
      importedSockets: [null],
      importedQuality: 25,
      pricing: current.pricing,
      augmentSourceHash: hash,
      essenceSourceHash: hash,
      corruptionSourceHash: CORRUPTION_SOURCE.sha256,
      desecrationSourceHash: DESECRATION_SOURCE.sha256,
      liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
      scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
    })
    expect(loadWorkbenchProject(JSON.stringify(current), source).ok).toBe(false)
    expect(
      reuseIdentityCraftPlan(JSON.stringify(loaded.project), JSON.stringify(plan), source).ok,
    ).toBe(false)
  })

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('旧新当前与模板组合保持接收方全部历史与元数据：%s/%s', (currentIdentity, templateIdentity) => {
    const current = text(project(), currentIdentity)
    const source = text(template(), templateIdentity)
    const expectedLegacy = must(
      reuseCraftPlan(serializeCraftProject(project()), serializeCraftProject(template()), catalog),
    )
    const expected = identity(expectedLegacy.project)
    const result = must(reuseIdentityCraftPlan(current, source, catalog))
    expect(result).toEqual(expected)
    expect(result.states).toEqual(identity(project()).states)
    expect(result.project.operations).toEqual(identity(project()).project.operations)
    expect(result.project.cursor).toBe(2)
    expect(result.project.strategyStartStep).toBe(2)
    expect(result.project.pricing).toEqual(project().pricing)
    expect(
      parseIdentityCraftProject(
        must(serializeIdentityCraftProject(result.project, catalog)),
        catalog,
      ),
    ).toEqual({ ok: true, value: result })
  })

  it('纯条件模板清除旧目标及流程起点，缺省字段不写 undefined', () => {
    const source: CraftProject = {
      ...template(),
      strategy: {
        maxSteps: 10,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
      },
    }
    delete source.strategyStartStep
    delete source.targetModIds
    delete source.targetValues
    delete source.targetAlternatives
    delete source.targetFracturedModId
    delete source.minimumTargetCount
    const result = must(reuseIdentityCraftPlan(text(project(), true), text(source, false), catalog))
    for (const key of [
      'targetModIds',
      'targetValues',
      'targetAlternatives',
      'targetFracturedModId',
      'minimumTargetCount',
      'strategyStartStep',
    ])
      expect(Object.hasOwn(result.project, key)).toBe(false)
    expect(result.states).toEqual(identity(project()).states)
  })

  it.each([false, true])('空模板和深层失联条件被拒绝：identified=%s', (identified) => {
    const empty: CraftProject = {
      ...project(),
      targetModIds: [],
      targetValues: [],
      targetAlternatives: [],
    }
    delete empty.targetFracturedModId
    delete empty.minimumTargetCount
    delete empty.strategy
    delete empty.strategyStartStep
    expect(reuseIdentityCraftPlan(text(project(), true), text(empty, identified), catalog).ok).toBe(
      false,
    )
    empty.strategy = {
      maxSteps: 10,
      rules: [
        {
          conditions: [
            {
              kind: 'not',
              condition: { kind: 'selected-targets', modIds: ['p1'], min: 1, value: true },
            },
          ],
          action: { kind: 'stop' },
        },
      ],
    }
    const result = reuseIdentityCraftPlan(text(project(), true), text(empty, identified), catalog)
    expect(result.ok ? '' : result.error).toContain('引用了已移除的目标')
  })

  it('跨类型共享合法显式目标可沿用，固有不同或目标不适用时拒绝', () => {
    const base = catalog.bases[0]
    if (!base) throw new Error('缺少基底')
    const source: CraftCatalog = {
      ...catalog,
      bases: [
        { ...base, implicit: '+(10-20)% to Fire Resistance', implicitTags: [[]] },
        {
          ...base,
          id: 'Other',
          name: 'Other',
          type: 'Shield',
          implicit: '+(10-20)% to Cold Resistance',
          implicitTags: [[]],
        },
        { ...base, id: 'Unsupported', name: 'Unsupported', tags: ['default'] },
      ],
    }
    const receiving = { ...project(), initialState: { ...project().initialState, baseId: 'Other' } }
    const plan = template()
    expect(
      reuseIdentityCraftPlan(text(receiving, true, source), text(plan, false, source), source).ok,
    ).toBe(true)
    plan.targetImplicitValues = [{ lineIndex: 0, bounds: [{ index: 0, min: 15 }] }]
    const mismatch = reuseIdentityCraftPlan(
      text(receiving, true, source),
      text(plan, true, source),
      source,
    )
    expect(mismatch.ok ? '' : mismatch.error).toContain('固有属性不同')
    const unsupported = {
      ...receiving,
      initialState: { ...receiving.initialState, baseId: 'Unsupported' },
      operations: [],
      cursor: 0,
      strategyStartStep: 0,
      targetModIds: [],
      targetValues: [],
      targetAlternatives: [],
    }
    delete unsupported.targetFracturedModId
    delete unsupported.minimumTargetCount
    const rejected = reuseIdentityCraftPlan(
      text(unsupported, true, source),
      text(template(), false, source),
      source,
    )
    expect(rejected.ok ? '' : rejected.error).toContain('不兼容')
  })

  it.each([false, true])(
    '两份输入都完整验证，游标后的坏操作不能借方案替换洗掉：%s',
    (identified) => {
      const broken = JSON.parse(text(project(), identified))
      broken.operations[5].modId = 'missing'
      expect(
        reuseIdentityCraftPlan(JSON.stringify(broken), text(template(), true), catalog).ok,
      ).toBe(false)
      expect(
        reuseIdentityCraftPlan(text(project(), true), JSON.stringify(broken), catalog).ok,
      ).toBe(false)
    },
  )
})
