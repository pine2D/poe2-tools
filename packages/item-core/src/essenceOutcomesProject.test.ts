import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const essenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceAttribute'
const results = [
  'EssencePercentStrength1',
  'EssencePercentDexterity1',
  'EssencePercentIntelligence1',
]
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-16-v89',
    initialState: {
      baseId: 'Amber Amulet',
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
it('v89 空白项目完整保存恢复', () => {
  const input = project()
  const restored = loadTargetWorkbenchProject(JSON.stringify(input), catalog)
  expect(restored.ok).toBe(true)
  if (!restored.ok) return
  expect(restored.value.project).toEqual(input)
  expect(JSON.parse(must(serializeTargetCraftProject(restored.value.project, catalog)))).toEqual(
    input,
  )
})
it('v2–v88 拒绝起点、完整未来、目标与未执行精华指引的新能力声明', () => {
  const real = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  for (let n = 2; n <= 88; n++) {
    const { targetDefinitions, orphanedTargets, ...base } = project()
    const { nextAffixId: _, ...legacy } = base.initialState
    const input = {
      ...base,
      rulesVersion: `basic-2026-09-${n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? base.initialState : legacy,
      ...(n >= 74 ? { targetDefinitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(real) } : {}),
    }
    const read =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(read(JSON.stringify(input), real).ok, `v${n}基线`).toBe(true)
    for (const modId of results)
      for (const extra of [
        { initialState: { ...input.initialState, affixes: [{ modId, crafted: true }] } },
        { operations: [{ kind: 'essence', essenceId, resultModId: modId, values: [7] }] },
        { targetDefinitions: { targets: [{ targetId: 't1', modId }] } },
        { targetModIds: [modId] },
        { strategy: { rules: [{ action: { kind: 'essence', essenceId } }] } },
        { strategy: { flow: { stages: [{ action: { kind: 'essence', essenceId } }] } } },
      ])
        expect(read(JSON.stringify({ ...input, ...extra }), real), `v${n}/${modId}`).toMatchObject({
          ok: false,
          error: expect.stringContaining('v89'),
        })
  }
})
it('旧版 Perfect Infinite 仅报价保持兼容', () => {
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({
        ...project(),
        rulesVersion: 'basic-2026-09-16-v88',
        pricing: { unit: 'divine', prices: { [`essence:${essenceId}`]: 1 } },
      }),
      catalog,
    ).ok,
  ).toBe(true)
})

import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { requiresEssenceOutcomesProjectVersion } from './essenceOutcomesProjectVersion'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { addCraftAffix, type CraftResult, type CraftState, craftCandidates } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'
import { reuseTargetCraftPlan } from './targetWorkbenchProject'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function present<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试记录')
  return value
}
const essenceSourceHash = catalog._meta.sources.find(
  (s) => s.path === 'src/Data/Essence.lua',
)?.sha256
function imported(state: CraftState) {
  const dictionary = createCraftItemDictionary(catalog)
  const text = must(exportCraftItemText(catalog, state, { locale: 'en', dictionary })).text
  const parsed = parseItem(text)
  if (!parsed.ok) throw Error(parsed.error)
  return must(
    importIdentifiedCraftState(
      catalog,
      state.baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      state.sockets,
    ),
  )
}
function initial() {
  const state: CraftState = { ...project().initialState, rarity: 'rare' }
  const prefix = present(craftCandidates(catalog, state).find((m) => m.kind === 'prefix'))
  return imported(must(addCraftAffix(catalog, state, prefix.id)))
}
function operation(state: CraftState, resultModId: string) {
  const affix = present(state.affixes[0])
  return {
    kind: 'essence' as const,
    essenceId,
    resultModId,
    values: [7],
    removeModId: affix.modId,
    removeAffixId: present(affix.affixId),
  }
}
const strategy = {
  maxSteps: 4,
  rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'essence', essenceId } }],
}
it('三结果完整未来及工艺导入起点按全部游标恢复，数值和费用字段保留', () => {
  for (const id of results) {
    const initialState = initial()
    const op = operation(initialState, id)
    for (const cursor of [0, 1]) {
      const input = {
        ...project(),
        essenceSourceHash,
        initialState,
        operations: [op],
        cursor,
        pricing: { unit: 'divine', prices: { [`essence:${essenceId}`]: 2 } },
      }
      const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
      expect(restored.states[1]?.affixes).toMatchObject([{ modId: id, crafted: true }])
      expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(
        input,
      )
      expect(
        loadTargetWorkbenchProject(
          JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-16-v88' }),
          catalog,
        ).ok,
      ).toBe(false)
    }
    const crafted = must(applyCraftStep(catalog, initialState, op))
    const input = { ...project(), essenceSourceHash, initialState: imported(crafted) }
    expect(must(loadTargetWorkbenchProject(JSON.stringify(input), catalog)).project).toEqual(input)
  }
})
it('未执行指引和目标必须有精确材料映射及双来源，版本号本身不授权', () => {
  for (const extra of [
    { strategy },
    {
      targetDefinitions: {
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: results[0] }],
        alternatives: [],
        values: [],
      },
    },
  ]) {
    const signed = { ...project(), essenceSourceHash, ...extra }
    expect(must(loadTargetWorkbenchProject(JSON.stringify(signed), catalog)).project).toEqual(
      signed,
    )
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({ ...signed, essenceSourceHash: undefined }),
        catalog,
      ).ok,
    ).toBe(false)
    for (const mutate of [
      (c: CraftCatalog) => {
        present(c._meta.sources.find((s) => s.path === 'src/Data/ModItem.lua')).sha256 = 'a'.repeat(
          64,
        )
      },
      (c: CraftCatalog) => {
        present(c._meta.sources.find((s) => s.path === 'src/Data/Essence.lua')).sha256 = 'a'.repeat(
          64,
        )
      },
      (c: CraftCatalog) => {
        present(c.essences?.find((e) => e.id === essenceId)).mods.Amulet = 'Strength6'
      },
      (c: CraftCatalog) => {
        c.essences = present(c.essences).filter((e) => e.id !== essenceId)
      },
      (c: CraftCatalog) => {
        present(c.modifiers.find((m) => m.id === results[0])).group = 'forged'
      },
    ]) {
      const changed = structuredClone(catalog)
      mutate(changed)
      expect(loadTargetWorkbenchProject(JSON.stringify(signed), changed).ok).toBe(false)
    }
  }
})
it('沿用多结果指引提升v89，沿用旧指引保留版本、完整未来与报价', () => {
  const template = { ...project(), essenceSourceHash, strategy }
  const old = { ...project(), rulesVersion: 'basic-2026-09-16-v88' }
  expect(
    must(reuseTargetCraftPlan(JSON.stringify(old), JSON.stringify(template), catalog)).project
      .rulesVersion,
  ).toBe(project().rulesVersion)
  const initialState = initial()
  const current = {
    ...project(),
    essenceSourceHash,
    initialState,
    operations: [operation(initialState, present(results[0]))],
    pricing: { unit: 'divine', prices: { [`essence:${essenceId}`]: 3 } },
  }
  const oldTemplate = {
    ...old,
    strategy: {
      maxSteps: 4,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'stop' } }],
    },
  }
  const kept = must(
    reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(oldTemplate), catalog),
  ).project
  expect(kept.rulesVersion).toBe(project().rulesVersion)
  expect(kept.operations).toEqual(current.operations)
  expect(kept.pricing).toEqual(current.pricing)
})
it('扫描循环及访问器安全，来源文本与报价不解释为能力', () => {
  const input: Record<string, unknown> = { sourceText: results[0], description: results[1] }
  Object.defineProperty(input, 'modId', {
    get() {
      throw Error('不能调用访问器')
    },
  })
  input.self = input
  expect(requiresEssenceOutcomesProjectVersion(input)).toBe(false)
  expect(
    requiresEssenceOutcomesProjectVersion({ operations: [{ kind: 'essence', essenceId }] }),
  ).toBe(true)
  expect(requiresEssenceOutcomesProjectVersion({ targetModIds: [results[0]] })).toBe(true)
})
it('v89继承v88七组真实容量、完整未来和锻造来源签名门禁', () => {
  const serleId = 'pob2:augment:["Serle\'s Triumph","armour"]'
  let state: CraftState = {
    baseId: 'Twig Focus',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    sockets: [serleId],
    affixes: [],
  }
  for (const kind of ['prefix', 'prefix', 'prefix', 'suffix', 'suffix', 'suffix', 'suffix']) {
    state = must(
      addCraftAffix(
        catalog,
        state,
        present(craftCandidates(catalog, state).find((m) => m.kind === kind)).id,
      ),
    )
  }
  const targets = state.affixes.map((a, i) => ({ targetId: `t${i + 1}`, modId: a.modId }))
  const input = {
    ...project(),
    augmentSourceHash: catalog._meta.sources.find((s) => s.path === 'src/Data/ModRunes.lua')
      ?.sha256,
    initialState: imported({ ...state, affixes: [], sockets: [null] }),
    importedSockets: [null],
    operations: [{ kind: 'socket', socketIndex: 0, augmentId: serleId }],
    targetDefinitions: { nextTargetId: 8, targets, alternatives: [], values: [] },
  }
  for (const cursor of [0, 1]) {
    const original = { ...input, cursor }
    const restored = must(loadTargetWorkbenchProject(JSON.stringify(original), catalog))
    expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(
      original,
    )
  }
  expect(loadTargetWorkbenchProject(JSON.stringify({ ...input, operations: [] }), catalog).ok).toBe(
    false,
  )
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({
        ...project(),
        strategy: {
          maxSteps: 4,
          rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'runeforge' } }],
        },
      }),
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('签名') })
})
it('尚未进入的完整阶段精华指引可保存，降级及篡改结果选择均拒绝', () => {
  const initialState = initial()
  const input = {
    ...project(),
    essenceSourceHash,
    initialState,
    operations: [operation(initialState, present(results[2]))],
    strategyStartStep: 0,
    strategy: {
      maxSteps: 4,
      flow: {
        stages: [
          { id: 'a', name: '检查' },
          { id: 'b', name: '精华' },
        ],
        entryStageId: 'a',
      },
      rules: [
        {
          stageId: 'a',
          nextStageId: 'b',
          conditions: [{ kind: 'always' }],
          action: { kind: 'currency', currency: 'exalted' },
        },
        {
          stageId: 'b',
          conditions: [{ kind: 'all', conditions: [{ kind: 'always' }] }],
          action: { kind: 'essence', essenceId },
        },
      ],
    },
  }
  const restored = must(loadTargetWorkbenchProject(JSON.stringify(input), catalog))
  expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(input)
  expect(
    loadTargetWorkbenchProject(
      JSON.stringify({ ...input, rulesVersion: 'basic-2026-09-16-v88' }),
      catalog,
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('v89') })
  for (const resultModId of [undefined, 'Strength6', 'EssenceDisplayAttributes5']) {
    expect(
      loadTargetWorkbenchProject(
        JSON.stringify({ ...input, operations: [{ ...input.operations[0], resultModId }] }),
        catalog,
      ).ok,
    ).toBe(false)
  }
})
