import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { collectCraftCosts } from './craftCosts'
import { parseCraftProject } from './craftProject'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { requiresPutrefactionProjectVersion } from './putrefactionProjectVersion'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog = boneCatalog()
const version = 'basic-2026-09-16-v91'
function project(operations: unknown[] = [], cursor = operations.length) {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: version,
    initialState: {
      baseId: 'Synthetic Base',
      itemLevel: 64,
      rarity: 'normal',
      affixes: [],
      sourceText: null,
      nextAffixId: 1,
    },
    operations,
    cursor,
    desecrationSourceHash: catalog._meta.sources[0]?.sha256,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
  }
}
it('v91 空项目保持版本并可保存恢复', () => {
  const input = project()
  const restored = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  expect(restored.ok).toBe(true)
  if (!restored.ok) return
  expect(restored.value.project).toEqual(input)
  const saved = serializeTargetCraftProject(restored.value.project, catalog)
  expect(saved.ok).toBe(true)
  if (saved.ok) expect(JSON.parse(saved.value)).toEqual(input)
})
it.each([0, 1])('v90 拒绝完整历史中的腐烂预兆，游标 %s', (cursor) => {
  const input = {
    ...project([{ kind: 'putrefy', boneId: 'preserved_rib' }], cursor),
    rulesVersion: 'basic-2026-09-16-v90',
  }
  expect(parseTargetCraftProject(JSON.stringify(input), catalog)).toMatchObject({
    ok: false,
    error: expect.stringContaining('v91'),
  })
})
it('v90 拒绝起始多槽占位', () => {
  const input = project()
  Object.assign(input.initialState, {
    pendingDesecration: {
      boneId: 'preserved_rib',
      kind: 'prefix',
      putrefaction: { prefix: 3, suffix: 3 },
    },
  })
  input.rulesVersion = 'basic-2026-09-16-v90'
  expect(parseTargetCraftProject(JSON.stringify(input), catalog)).toMatchObject({
    ok: false,
    error: expect.stringContaining('v91'),
  })
})
it('腐烂预兆收费骨骼及预兆各一份，每槽回响单独收费', () => {
  const steps: CraftStep[] = [
    { kind: 'putrefy', boneId: 'preserved_rib' },
    {
      kind: 'desecration-offer',
      modIds: ['prefix1', 'prefix2', 'prefix3'],
      revealOmen: 'abyssal_echoes',
    },
    { kind: 'desecration-reroll', modIds: ['prefix2', 'prefix3', 'prefix4'] },
    { kind: 'desecration-reveal', modId: 'prefix1', values: [5] },
    {
      kind: 'desecration-offer',
      modIds: ['prefix2', 'prefix3', 'prefix4'],
      revealOmen: 'abyssal_echoes',
    },
    { kind: 'desecration-reroll', modIds: ['prefix4', 'prefix3', 'prefix2'] },
    { kind: 'desecration-reveal', modId: 'prefix2', values: [6] },
  ]
  let state = boneState()
  for (const [index, step] of steps.entries()) {
    const applied = applyCraftStep(catalog, state, step)
    if (!applied.ok) throw new Error(applied.error)
    state = applied.value
    if (
      'kind' in step &&
      (step.kind === 'desecration-reroll' || step.kind === 'desecration-reveal')
    )
      expect(collectCraftCosts(catalog, steps.slice(0, index + 1))).toEqual(
        collectCraftCosts(catalog, steps.slice(0, index)),
      )
  }
  expect(state.affixes.map((affix) => affix.modId)).toEqual(['prefix1', 'prefix2'])
  expect(state.pendingDesecration).toEqual({
    boneId: 'preserved_rib',
    kind: 'prefix',
    putrefaction: { prefix: 1, suffix: 3 },
  })
  const result = collectCraftCosts(catalog, steps)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'bone:preserved_rib', count: 1 }),
      expect.objectContaining({ id: 'omen:Omen of Putrefaction', count: 1 }),
      expect.objectContaining({ id: 'omen:Omen of Abyssal Echoes', count: 2 }),
    ]),
  )
  expect(result.value).toHaveLength(3)
})

it('旧版单骨骼历史保持单槽语义', () => {
  const input = project([
    { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
    { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
    { kind: 'desecration-offer', modIds: ['suffix3', 'exclusive1', 'exclusive2'] },
    { kind: 'desecration-reveal', modId: 'exclusive1', values: [5] },
  ])
  input.rulesVersion = 'basic-2026-09-16-v90'
  const result = parseTargetCraftProject(JSON.stringify(input), catalog)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.states.at(-1)).not.toHaveProperty('pendingDesecration')
  expect(result.value.states.at(-1)?.affixes.at(-1)).toMatchObject({ desecrated: true })
})

it('完整六槽历史在每个游标保存恢复，并验证未来选项与来源', () => {
  const expanded = { ...catalog, modifiers: [...catalog.modifiers] }
  for (const kind of ['prefix', 'suffix']) {
    const template = catalog.modifiers.find((m) => m.id === `${kind}4`)
    if (!template) throw new Error('缺少合成模板')
    expanded.modifiers.push({
      ...template,
      id: `${kind}5`,
      name: `${kind}5`,
      group: `${kind}5`,
      lines: [`${kind}5 (1-10)`],
    })
  }
  const operations: unknown[] = [
    { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
    { kind: 'putrefy', boneId: 'preserved_rib' },
  ]
  for (const kind of ['prefix', 'suffix']) {
    for (let n = 1; n <= 3; n++) {
      operations.push({
        kind: 'desecration-offer',
        modIds: [`${kind}${n}`, `${kind}4`, `${kind}5`],
      })
      operations.push({ kind: 'desecration-reveal', modId: `${kind}${n}`, values: [5] })
    }
  }
  for (let cursor = 0; cursor <= operations.length; cursor++) {
    const input = project(operations, cursor)
    const restored = loadTargetWorkbenchProject(JSON.stringify(input), expanded)
    if (!restored.ok) throw new Error(restored.error)
    expect(restored.value.project.cursor).toBe(cursor)
    expect(restored.value.project.rulesVersion).toBe(version)
    const saved = serializeTargetCraftProject(restored.value.project, expanded)
    if (!saved.ok) throw new Error(saved.error)
    const reloaded = loadTargetWorkbenchProject(saved.value, expanded)
    expect(reloaded).toEqual(restored)
    expect(restored.value.states.at(-1)?.affixes).toHaveLength(6)
    expect(restored.value.states.at(-1)).not.toHaveProperty('pendingDesecration')
    expect(restored.value.states[2]?.pendingDesecration).toMatchObject({
      putrefaction: { prefix: 3, suffix: 3 },
    })
  }
  const bad = project(structuredClone(operations), 0)
  bad.operations[4] = { kind: 'desecration-reveal', modId: 'prefix1', values: [100] }
  expect(loadTargetWorkbenchProject(JSON.stringify(bad), expanded).ok).toBe(false)
  bad.operations = structuredClone(operations)
  bad.operations[3] = { kind: 'desecration-offer', modIds: ['prefix1', 'prefix1', 'prefix2'] }
  expect(loadTargetWorkbenchProject(JSON.stringify(bad), expanded).ok).toBe(false)
  const missingHash = { ...project(operations, 0), desecrationSourceHash: undefined }
  expect(loadTargetWorkbenchProject(JSON.stringify(missingHash), expanded).ok).toBe(false)
})

it('旧投影入口无法绕过腐烂版本门禁', () => {
  const input = project([{ kind: 'putrefy', boneId: 'preserved_rib' }], 0)
  expect(
    parseCraftProject(JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-12-v72' }), catalog),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v91') })
})
it('能力判别不调用 getter 或未知字段的字符串转换', () => {
  const crash = () => {
    throw new Error('不应执行用户代码')
  }
  expect(
    requiresPutrefactionProjectVersion({
      get initialState() {
        return crash()
      },
      operations: [
        {
          get kind() {
            return crash()
          },
        },
        { kind: { toString: crash } },
      ],
    }),
  ).toBe(false)
  expect(
    requiresPutrefactionProjectVersion({
      operations: [{ kind: 'putrefy' }],
      cursor: 0,
    }),
  ).toBe(true)
  expect(
    requiresPutrefactionProjectVersion({
      initialState: { pendingDesecration: { putrefaction: null } },
    }),
  ).toBe(true)
})
it('v91 起始损坏多槽仍需拒绝，版本不能授权不可信状态', () => {
  for (const putrefaction of [
    { prefix: -1, suffix: 3 },
    { prefix: 3, suffix: 3, extra: true },
    null,
  ]) {
    const input = project()
    Object.assign(input.initialState, {
      pendingDesecration: { boneId: 'preserved_rib', kind: 'prefix', putrefaction },
    })
    expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog).ok).toBe(false)
  }
})
it('沿用旧项目目标不会让空 v91 降版', () => {
  const template = {
    ...project(),
    rulesVersion: 'basic-2026-09-16-v90',
    targetDefinitions: {
      nextTargetId: 2,
      targets: [{ targetId: 't1', modId: 'prefix1' }],
      alternatives: [],
      values: [],
    },
  }
  const reused = reuseTargetCraftPlan(JSON.stringify(project()), JSON.stringify(template), catalog)
  if (!reused.ok) throw new Error(reused.error)
  expect(reused.value.project.rulesVersion).toBe(version)
})

it('v91 继承 v90 的单槽未揭示崇高能力', () => {
  const input = project([
    { currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'suffix1', 'suffix2'] },
    { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
    { currency: 'exalted', modIds: ['prefix3'] },
  ])
  const restored = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  if (!restored.ok) throw new Error(restored.error)
  expect(restored.value.project.rulesVersion).toBe(version)
  expect(restored.value.states.at(-1)?.affixes).toHaveLength(5)
  expect(restored.value.states.at(-1)?.pendingDesecration).not.toHaveProperty('putrefaction')
})
