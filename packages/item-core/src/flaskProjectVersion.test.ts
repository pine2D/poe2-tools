import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { type CraftProject, parseCraftProject, serializeCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { requiresFlaskProjectVersion } from './flaskProjectVersion'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const dictionary = createCraftItemDictionary(catalog, {})
const version = 'basic-2026-09-17-v106'
const hash = 'd50d074c1b7e0a57c164b7c49add1670d90ba806a25d946467e4ca7af9feb350'
function project(baseId = 'Ultimate Life Flask') {
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
      quality: 20,
      nextAffixId: 1,
    },
    operations: [],
    cursor: 0,
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
    flaskSourceHash: hash,
  }
}

it.each(['Ultimate Life Flask', 'Ultimate Mana Flask'])(
  '%s 的v106起点和来源可完整恢复',
  (baseId) => {
    const input = project(baseId)
    const read = parseTargetCraftProject(JSON.stringify(input), catalog, dictionary)
    expect(read.ok, read.ok ? '' : read.error).toBe(true)
    if (!read.ok) return
    expect(read.value.project.rulesVersion).toBe(version)
    expect(read.value.project.flaskSourceHash).toBe(hash)
    expect(serializeTargetCraftProject(read.value.project, catalog, dictionary).ok).toBe(true)
    expect(loadTargetWorkbenchProject(JSON.stringify(input), catalog, dictionary).ok).toBe(true)
  },
)

it('药剂项目必须声明真实来源，旧入口不能借新目录接收', () => {
  for (const flaskSourceHash of [undefined, '0'.repeat(64)]) {
    expect(
      parseTargetCraftProject(
        JSON.stringify({ ...project(), flaskSourceHash }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  }
  for (const rulesVersion of ['basic-2026-09-17-v105', 'basic-2026-09-17-v104']) {
    expect(
      parseTargetCraftProject(JSON.stringify({ ...project(), rulesVersion }), catalog, dictionary)
        .ok,
    ).toBe(false)
  }
  expect(parseCraftProject(JSON.stringify(project()), catalog, dictionary).ok).toBe(false)
  expect(parseIdentityCraftProject(JSON.stringify(project()), catalog, dictionary).ok).toBe(false)
})

it('v106在无药剂空项目保留版本，普通旧项目不要求新来源', () => {
  const { flaskSourceHash: _hash, ...plain } = project('Gold Ring')
  delete (plain.initialState as { quality?: number }).quality
  const restored = parseTargetCraftProject(JSON.stringify(plain), catalog, dictionary)
  expect(restored.ok, restored.ok ? '' : restored.error).toBe(true)
  if (restored.ok) expect(restored.value.project.rulesVersion).toBe(version)
  expect(
    parseTargetCraftProject(
      JSON.stringify({ ...plain, rulesVersion: 'basic-2026-09-17-v105' }),
      catalog,
      dictionary,
    ).ok,
  ).toBe(true)
})

it('药剂完整未来逐步回放，取消位置不隐藏非法稀有升级', () => {
  const input = project()
  const valid = {
    ...input,
    operations: [
      { currency: 'transmutation', modIds: ['FlaskIncreasedRecoveryAmount1'] },
      { currency: 'augmentation', modIds: ['FlaskChargesUsed1'] },
    ],
  }
  const restored = parseTargetCraftProject(JSON.stringify(valid), catalog, dictionary)
  expect(restored.ok, restored.ok ? '' : restored.error).toBe(true)
  if (restored.ok) {
    expect(restored.value.project.operations).toHaveLength(2)
    expect(restored.value.project.cursor).toBe(0)
  }
  expect(
    parseTargetCraftProject(
      JSON.stringify({
        ...valid,
        operations: [...valid.operations, { currency: 'regal', modIds: [] }],
      }),
      catalog,
      dictionary,
    ).ok,
  ).toBe(false)
})

it('沿用药剂方案不覆盖接收方品质与历史', () => {
  const left = parseTargetCraftProject(
    JSON.stringify({
      ...project(),
      targetDefinitions: {
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: 'FlaskChargesUsed1' }],
        alternatives: [],
        values: [],
      },
    }),
    catalog,
    dictionary,
  )
  const right = parseTargetCraftProject(
    JSON.stringify({
      ...project('Ultimate Mana Flask'),
      initialState: { ...project('Ultimate Mana Flask').initialState, quality: 10 },
    }),
    catalog,
    dictionary,
  )
  expect(left.ok && right.ok).toBe(true)
  if (!left.ok || !right.ok) return
  const reused = reuseTargetCraftPlan(
    JSON.stringify(right.value.project),
    JSON.stringify(left.value.project),
    catalog,
    dictionary,
  )
  expect(reused.ok, reused.ok ? '' : reused.error).toBe(true)
  if (reused.ok) {
    expect(reused.value.project.initialState).toEqual(right.value.project.initialState)
    expect(reused.value.project.operations).toEqual(right.value.project.operations)
    expect(reused.value.project.rulesVersion).toBe(version)
  }
})

it('版本扫描检查未来和失联引用，不执行访问器或读取观察文本', () => {
  const plain = { ...project('Gold Ring'), rulesVersion: 'basic-2026-09-17-v105' }
  delete (plain as { flaskSourceHash?: string }).flaskSourceHash
  const nested = { ...plain, unused: { conditions: [{ modIds: ['FlaskChargesUsed1'] }] } }
  expect(requiresFlaskProjectVersion(nested, catalog)).toBe(true)
  expect(parseTargetCraftProject(JSON.stringify(nested), catalog, dictionary).ok).toBe(false)
  const accessor = Object.defineProperty({}, 'baseId', {
    get() {
      throw Error('不可调用')
    },
  })
  expect(requiresFlaskProjectVersion(accessor, catalog)).toBe(false)
  expect(requiresFlaskProjectVersion({ sourceText: 'FlaskChargesUsed1' }, catalog)).toBe(false)
})

it('旧版序列化器不能产生无法恢复的药剂项目', () => {
  const old = { ...project(), rulesVersion: 'basic-2026-09-12-v72' }
  delete (old as { flaskSourceHash?: string }).flaskSourceHash
  delete (old.initialState as { nextAffixId?: number }).nextAffixId
  expect(() => serializeCraftProject(old as unknown as CraftProject)).toThrow(/v106/)
})

it('旧项目阶段显示名称恰好等于药剂词缀ID仍可恢复', () => {
  const { flaskSourceHash: _hash, ...plain } = project('Gold Ring')
  delete (plain.initialState as { quality?: number }).quality
  const input = {
    ...plain,
    rulesVersion: 'basic-2026-09-17-v105',
    strategyStartStep: 0,
    strategy: {
      maxSteps: 1,
      flow: { stages: [{ id: 's1', name: 'FlaskChargesUsed1' }], entryStageId: 's1' },
      rules: [{ stageId: 's1', conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  const restored = parseTargetCraftProject(JSON.stringify(input), catalog)
  expect(restored.ok, restored.ok ? '' : restored.error).toBe(true)
})
