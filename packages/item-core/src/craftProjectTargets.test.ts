import { describe, expect, it } from 'vitest'
import { CRAFT_RULES_VERSION, type CraftProject, MAX_CRAFT_PROJECT_BYTES } from './craftProject'
import { upgradeCraftProjectIdentity } from './craftProjectIdentity'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import {
  parseTargetCraftProject,
  serializeTargetCraftProject,
  TARGET_CRAFT_RULES_VERSION,
  type TargetCraftProject,
  upgradeTargetCraftProject,
} from './craftProjectTargets'
import { evaluateDefinitionCraftStrategy } from './definitionStrategy'
import { catalog as makeCatalog } from './partialTargetFixture'
import type { CraftResult } from './rehearsal'
import { STAT_SCALABILITY_SOURCE } from './statScalability'
import { analyzeTargetDefinitions } from './targetDefinitionAdvice'
import { createTargetDefinitions } from './targetDefinitions'

const catalog = makeCatalog(undefined, { socketLimit: null })
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function legacy(): CraftProject {
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
    targetModIds: ['p1'],
    targetValues: [{ modId: 'p1', bounds: [{ index: 0, min: 7 }] }],
    targetAlternatives: [{ targetModId: 'p1', modIds: ['high'] }],
    targetFracturedModId: 'p1',
    minimumTargetCount: 1,
    strategy: {
      maxSteps: 20,
      flow: {
        entryStageId: 'first',
        stages: [
          { id: 'first', name: '起步' },
          { id: 'later', name: '后续' },
        ],
      },
      rules: [
        {
          stageId: 'first',
          conditions: [{ kind: 'selected-targets', modIds: ['p1'], min: 1, value: true }],
          action: { kind: 'stop' },
        },
        {
          stageId: 'later',
          conditions: [
            {
              kind: 'not',
              condition: { kind: 'selected-targets', modIds: ['s3'], min: 1, value: false },
            },
          ],
          action: { kind: 'stop' },
        },
      ],
    },
    strategyStartStep: 1,
    pricing: { unit: 'divine', prices: {}, baseCost: 2 },
  }
}
function identity(input = legacy()) {
  return must(upgradeCraftProjectIdentity(JSON.stringify(input), catalog))
}
function upgraded() {
  const source = identity()
  return must(upgradeTargetCraftProject(JSON.stringify(source.project), catalog))
}

describe('v74 独立目标项目', () => {
  it.each([2, 3, 42, 72])('合法v%s空项目保留原版本门禁后升级，不凭换版本洗成新项目', (version) => {
    const input = {
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: `basic-2026-09-12-v${version}`,
      initialState: legacy().initialState,
      operations: [],
      cursor: 0,
    }
    const baseline = must(upgradeCraftProjectIdentity(JSON.stringify(input), catalog))
    const restored = must(upgradeTargetCraftProject(JSON.stringify(input), catalog))
    expect(restored.states).toEqual(baseline.states)
    expect(restored.project.targetDefinitions).toEqual({
      nextTargetId: 1,
      targets: [],
      alternatives: [],
      values: [],
    })
    expect(restored.project.orphanedTargets).toEqual([])
    expect(Object.hasOwn(restored.project, 'strategy')).toBe(false)
    if (version === 2)
      expect(
        upgradeTargetCraftProject(
          JSON.stringify({ ...input, operations: [{ currency: 'divine', modIds: [] }] }),
          catalog,
        ).ok,
      ).toBe(false)
  })

  it.each([false, true])('旧项目先完整验证再升级，未来历史和所有实例不变：v73=%s', (identified) => {
    const old = legacy()
    const baseline = identity(old)
    const input = identified ? baseline.project : old
    const before = structuredClone(input)
    const restored = must(upgradeTargetCraftProject(JSON.stringify(input), catalog))
    expect(restored.states).toEqual(baseline.states)
    expect(restored.project.operations).toEqual(baseline.project.operations)
    expect(restored.project).toMatchObject({
      rulesVersion: TARGET_CRAFT_RULES_VERSION,
      cursor: 2,
      pricing: old.pricing,
      strategyStartStep: 1,
    })
    expect(restored.states).toHaveLength(7)
    expect(restored.project.operations[4]).toMatchObject({
      removeAffixId: 'a1',
      rolls: [{ affixId: 'a5' }],
    })
    expect(restored.project.operations[5]).toEqual({ kind: 'fracture', modId: 'p1', affixId: 'a5' })
    expect(restored.project.targetDefinitions).toEqual({
      nextTargetId: 3,
      targets: [{ targetId: 't1', modId: 'p1' }],
      alternatives: [{ targetId: 't1', modIds: ['high'] }],
      values: [{ targetId: 't1', modId: 'p1', bounds: [{ index: 0, min: 7 }] }],
      fracturedTargetId: 't1',
      minimumTargetCount: 1,
    })
    expect(restored.project.orphanedTargets).toEqual([{ targetId: 't2', modId: 's3' }])
    expect(restored.project.strategy?.rules[1]?.conditions).toEqual([
      {
        kind: 'not',
        condition: { kind: 'selected-targets', targetIds: ['t2'], min: 1, value: false },
      },
    ])
    for (const key of [
      'targetModIds',
      'targetValues',
      'targetAlternatives',
      'targetFracturedModId',
      'minimumTargetCount',
    ])
      expect(Object.hasOwn(restored.project, key)).toBe(false)
    expect(
      parseTargetCraftProject(
        must(serializeTargetCraftProject(restored.project, catalog)),
        catalog,
      ),
    ).toEqual({ ok: true, value: restored })
    expect(input).toEqual(before)
  })

  it.each([0, 2, 6])('cursor=%s 不截断未来，不重编号已有空洞目标', (cursor) => {
    const baseline = upgraded()
    const project: TargetCraftProject = {
      ...baseline.project,
      cursor,
      targetDefinitions: {
        nextTargetId: 80,
        targets: [{ targetId: 't27', modId: 'p1' }],
        alternatives: [],
        values: [],
      },
      orphanedTargets: [],
    }
    delete project.strategy
    delete project.strategyStartStep
    const result = must(
      parseTargetCraftProject(must(serializeTargetCraftProject(project, catalog)), catalog),
    )
    expect(result.project.targetDefinitions).toEqual(project.targetDefinitions)
    expect(result.project.cursor).toBe(cursor)
    expect(result.states).toEqual(baseline.states)
  })

  it('严格 reader 不降级，upgrade 不能接收 v74；缺身份和未来坏操作均拒绝', () => {
    const baseline = upgraded()
    expect(upgradeTargetCraftProject(JSON.stringify(baseline.project), catalog).ok).toBe(false)
    expect(parseTargetCraftProject(JSON.stringify(identity().project), catalog).ok).toBe(false)
    const broken = structuredClone(baseline.project)
    broken.operations[5] = { kind: 'fracture', modId: 'missing', affixId: 'a5' }
    expect(parseTargetCraftProject(JSON.stringify(broken), catalog).ok).toBe(false)
    expect(serializeTargetCraftProject(broken, catalog).ok).toBe(false)
    const noIdentity = JSON.parse(JSON.stringify(baseline.project))
    delete noIdentity.initialState.nextAffixId
    expect(parseTargetCraftProject(JSON.stringify(noIdentity), catalog).ok).toBe(false)
    const bad73 = JSON.parse(JSON.stringify(identity().project))
    delete bad73.operations[4].removeAffixId
    expect(upgradeTargetCraftProject(JSON.stringify(bad73), catalog).ok).toBe(false)
    const old = legacy()
    old.operations[5] = { kind: 'fracture', modId: 'missing' }
    expect(upgradeTargetCraftProject(JSON.stringify(old), catalog).ok).toBe(false)
  })

  it('active/orphan 表精确覆盖所有阶段引用，不接受漏项、重复、重叠或游标外编号', () => {
    const baseline = upgraded().project
    for (const orphanedTargets of [
      [],
      [
        { targetId: 't2', modId: 's3' },
        { targetId: 't2', modId: 's3' },
      ],
      [
        { targetId: 't1', modId: 'p1' },
        { targetId: 't2', modId: 's3' },
      ],
      [{ targetId: 't2', modId: 'missing' }],
      [{ targetId: 't3', modId: 's3' }],
      [
        { targetId: 't2', modId: 's3' },
        { targetId: 't9', modId: 's4' },
      ],
    ])
      expect(
        parseTargetCraftProject(JSON.stringify({ ...baseline, orphanedTargets }), catalog).ok,
      ).toBe(false)
    const missing = JSON.parse(JSON.stringify(baseline))
    delete missing.orphanedTargets
    expect(parseTargetCraftProject(JSON.stringify(missing), catalog).ok).toBe(false)
    expect(
      parseTargetCraftProject(
        JSON.stringify({
          ...baseline,
          targetDefinitions: { ...baseline.targetDefinitions, nextTargetId: 2 },
        }),
        catalog,
      ).ok,
    ).toBe(false)
    expect(
      serializeTargetCraftProject(
        { ...baseline, orphanedTargets: undefined } as unknown as TargetCraftProject,
        catalog,
      ).ok,
    ).toBe(false)
  })

  it('active和orphan可有相同modId但不能共享targetId，重加同类型不会修复旧引用', () => {
    const baseline = upgraded()
    const project = {
      ...baseline.project,
      targetDefinitions: {
        ...baseline.project.targetDefinitions,
        nextTargetId: 4,
        targets: [...baseline.project.targetDefinitions.targets, { targetId: 't3', modId: 's3' }],
      },
    }
    const result = must(
      parseTargetCraftProject(must(serializeTargetCraftProject(project, catalog)), catalog),
    )
    expect(result.project.orphanedTargets).toEqual([{ targetId: 't2', modId: 's3' }])
    expect(result.project.targetDefinitions.targets).toContainEqual({ targetId: 't3', modId: 's3' })
    const current = result.states[result.project.cursor]
    const strategy = result.project.strategy
    if (!current || !strategy) throw new Error('缺少恢复结果')
    expect(
      evaluateDefinitionCraftStrategy(
        catalog,
        current,
        strategy,
        result.project.cursor,
        { definitions: result.project.targetDefinitions },
        'later',
      ),
    ).toMatchObject({ ok: true, value: { kind: 'blocked' } })
  })

  it('同一条件引用同类型两代orphan时保留两个targetId和min，不经modId去重', () => {
    const baseline = upgraded().project
    const project: TargetCraftProject = {
      ...baseline,
      targetDefinitions: { ...baseline.targetDefinitions, nextTargetId: 4 },
      orphanedTargets: [
        { targetId: 't2', modId: 's3' },
        { targetId: 't3', modId: 's3' },
      ],
      strategy: {
        maxSteps: 10,
        rules: [
          {
            conditions: [
              { kind: 'selected-targets', targetIds: ['t2', 't3'], min: 2, value: false },
            ],
            action: { kind: 'stop' },
          },
        ],
      },
    }
    delete project.strategyStartStep
    const result = must(
      parseTargetCraftProject(must(serializeTargetCraftProject(project, catalog)), catalog),
    )
    expect(result.project.orphanedTargets).toEqual(project.orphanedTargets)
    expect(result.project.strategy).toEqual(project.strategy)
    expect(result.project.targetDefinitions).toEqual(project.targetDefinitions)
  })

  it('不能混入旧目标字段，序列化先拒绝 undefined 和嵌套未知字段', () => {
    const baseline = upgraded().project
    for (const patch of [
      { targetModIds: [] },
      { targetValues: [] },
      { minimumTargetCount: 1 },
      { targetDefinitions: { ...baseline.targetDefinitions, extra: true } },
      { orphanedTargets: [{ targetId: 't2', modId: 's3', extra: 1 }] },
      { states: [] },
    ])
      expect(parseTargetCraftProject(JSON.stringify({ ...baseline, ...patch }), catalog).ok).toBe(
        false,
      )
    expect(
      serializeTargetCraftProject(
        { ...baseline, pricing: undefined } as unknown as TargetCraftProject,
        catalog,
      ).ok,
    ).toBe(false)
    for (const text of [
      '{bad',
      'null',
      '[]',
      ' '.repeat(MAX_CRAFT_PROJECT_BYTES + 1),
      `{${'中'.repeat(MAX_CRAFT_PROJECT_BYTES / 2)}`,
    ])
      expect(parseTargetCraftProject(text, catalog).ok).toBe(false)
  })

  it('旧 unknown orphan 仍被原 reader 拒绝，不能借迁移清洗', () => {
    const input = legacy()
    input.strategy = {
      maxSteps: 10,
      rules: [
        {
          conditions: [{ kind: 'selected-targets', modIds: ['missing'], min: 1, value: false }],
          action: { kind: 'stop' },
        },
      ],
    }
    delete input.strategyStartStep
    expect(upgradeTargetCraftProject(JSON.stringify(input), catalog)).toMatchObject({
      ok: false,
      error: expect.stringContaining('不在当前制作目录'),
    })
  })

  it('真实 chaos 后配置有效目标，起点歧义不阻止 v74 保存、撤销和截断', () => {
    const source = makeCatalog(undefined, { socketLimit: null })
    source._meta.sourceCommit = STAT_SCALABILITY_SOURCE.commit
    source._meta.sources.push(STAT_SCALABILITY_SOURCE)
    source.modifiers = source.modifiers.map((mod) =>
      mod.id === 'p1' ? { ...mod, lines: ['Value (1-10)', 'Value (1-5)'] } : mod,
    )
    const input: CraftProject = {
      schemaVersion: 1,
      rulesVersion: CRAFT_RULES_VERSION,
      sourceCommit: source._meta.sourceCommit,
      initialState: {
        baseId: 'Focus',
        itemLevel: 86,
        rarity: 'rare',
        affixes: [{ modId: 'p1', lines: ['Value 3', 'Value 4'] }],
        sourceText:
          'Item Class: Foci\nRarity: Rare\nTest\nFocus\n--------\nItem Level: 86\n--------\n{ Prefix Modifier "p1" }\nValue 3\nValue 4',
      },
      operations: [
        {
          currency: 'chaos',
          removeModId: 'p1',
          modIds: ['p1'],
          rolls: [{ modId: 'p1', values: [8, 4] }],
        },
      ],
      cursor: 1,
      scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
    }
    const old = must(upgradeCraftProjectIdentity(JSON.stringify(input), source))
    const baseline = must(upgradeTargetCraftProject(JSON.stringify(old.project), source))
    const current = baseline.states[1]
    const initial = old.states[0]
    if (!current || !initial) throw new Error('缺少 chaos 前后状态')
    const goals = {
      targetModIds: ['p1'],
      targetValues: [{ modId: 'p1', basis: 'effective' as const, bounds: [{ index: 0, min: 7 }] }],
    }
    expect(createTargetDefinitions(source, initial, goals).ok).toBe(false)
    const targetDefinitions = must(createTargetDefinitions(source, current, goals))
    expect(parseIdentityCraftProject(JSON.stringify({ ...old.project, ...goals }), source).ok).toBe(
      false,
    )
    const configured = { ...baseline.project, targetDefinitions }
    for (const project of [
      configured,
      { ...configured, cursor: 0 },
      { ...configured, cursor: 0, operations: [] },
    ]) {
      const result = must(
        parseTargetCraftProject(must(serializeTargetCraftProject(project, source)), source),
      )
      expect(result.project.targetDefinitions).toEqual(targetDefinitions)
      expect(result.project.operations).toEqual(project.operations)
      expect(result.states).toHaveLength(project.operations.length + 1)
      expect(result.project.initialState).toEqual(old.project.initialState)
    }
    expect(analyzeTargetDefinitions(source, current, targetDefinitions)).toMatchObject({
      ok: true,
      value: { progress: { satisfied: true } },
    })
    expect(analyzeTargetDefinitions(source, initial, targetDefinitions).ok).toBe(false)
  })

  it.each([0, 1, 2])('建筑师摧毁完整终止状态在cursor=%s保留，不能追加后续操作', (cursor) => {
    const original = legacy()
    original.operations = [
      { kind: 'vaal', outcome: 'unchanged' },
      { kind: 'architect', outcome: 'destroy' },
    ]
    original.cursor = cursor
    original.strategyStartStep = 0
    const baseline = identity(original)
    const result = must(upgradeTargetCraftProject(JSON.stringify(baseline.project), catalog))
    expect(result.states).toEqual(baseline.states)
    expect(result.states[2]?.destroyed).toBe(true)
    expect(
      parseTargetCraftProject(must(serializeTargetCraftProject(result.project, catalog)), catalog),
    ).toEqual({ ok: true, value: result })
    expect(
      parseTargetCraftProject(
        JSON.stringify({
          ...result.project,
          operations: [...result.project.operations, { currency: 'transmutation', modIds: ['p1'] }],
        }),
        catalog,
      ).ok,
    ).toBe(false)
  })
})
