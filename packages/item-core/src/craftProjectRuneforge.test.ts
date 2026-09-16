import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { parseTargetCraftProject, serializeTargetCraftProject } from './craftProjectTargets'
import { fluxCatalogSignature } from './fluxes'
import type { CraftResult } from './rehearsal'
import { loadTargetWorkbenchProject, reuseTargetCraftPlan } from './targetWorkbenchProject'

const version = 'basic-2026-09-16-v82'
const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function project() {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: version,
    initialState: {
      baseId: 'Adherent Cuffs',
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
it('v82 空白项目可无可选目录恢复', () => {
  const restored = must(loadTargetWorkbenchProject(JSON.stringify(project()), catalog))
  expect(restored.project).toEqual(project())
  expect(JSON.parse(must(serializeTargetCraftProject(restored.project, catalog)))).toEqual(
    project(),
  )
})
it('v2–v81 均拒绝未来锻造、未执行嵌套指引和仅报价', () => {
  const real = { ...catalog, fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')) }
  for (let n = 2; n <= 81; n++) {
    const { targetDefinitions, orphanedTargets, ...base } = project()
    const { nextAffixId: _, ...legacyState } = base.initialState
    const input = {
      ...base,
      rulesVersion: `basic-2026-09-${n >= 76 ? '16' : '12'}-v${n}`,
      initialState: n >= 73 ? base.initialState : legacyState,
      ...(n >= 74 ? { targetDefinitions, orphanedTargets } : {}),
      ...(n === 75 ? { fluxCatalogSignature: fluxCatalogSignature(real) } : {}),
    }
    const read =
      n <= 72 ? parseCraftProject : n === 73 ? parseIdentityCraftProject : parseTargetCraftProject
    expect(read(JSON.stringify(input), real).ok, `v${n}基线`).toBe(true)
    for (const extra of [
      {
        operations: [
          {
            kind: 'runeforge',
            fromBaseId: 'Adherent Cuffs',
            toBaseId: 'Runeforged Adherent Cuffs',
          },
        ],
      },
      { strategy: { flow: { stages: [{ action: { kind: 'runeforge' } }] } } },
      { pricing: { unit: 'divine', prices: { 'currency:verisium': 1 } } },
    ])
      expect(read(JSON.stringify({ ...input, ...extra }), real), `v${n}`).toMatchObject({
        ok: false,
        error: expect.stringContaining('v82'),
      })
  }
})

it('真实空白与中文原文起点跨基底回放，所有撤销位置保留完整未来及原文', () => {
  for (const sourceText of [
    null,
    '物品类别: 手套\n稀有度: 普通\n合成测试手套\n--------\n物品等级: 86',
  ]) {
    const input = signedProject(sourceText)
    for (const cursor of [0, 1, 2]) {
      const restored = must(
        loadTargetWorkbenchProject(JSON.stringify({ ...input, cursor }), loaded, dictionary),
      )
      expect(restored.project).toEqual({ ...input, cursor })
      expect(restored.states.map((s) => s.baseId)).toEqual([
        'Adherent Cuffs',
        'Runeforged Adherent Cuffs',
        'Runeforged Adherent Cuffs',
      ])
      expect(restored.states.every((s) => s.sourceText === sourceText)).toBe(true)
      expect(restored.states[2]?.affixes[0]).toMatchObject({
        affixId: 'a1',
        modId: 'IncreasedLife1',
      })
      expect(
        JSON.parse(must(serializeTargetCraftProject(restored.project, loaded, dictionary))),
      ).toEqual({ ...input, cursor })
    }
  }
})
it('完整关系签名缺失、目录变化、未来非法转换及原文基底篡改均拒绝', () => {
  const input = signedProject()
  must(parseTargetCraftProject(JSON.stringify(input), loaded))
  const { runeforgingCatalogSignature: _, ...missing } = input
  for (const bad of [
    missing,
    { ...input, runeforgingCatalogSignature: 'changed' },
    { ...input, operations: [...input.operations, input.operations[0]] },
    { ...input, operations: [{ ...input.operations[0], verisium: 0 }] },
  ])
    expect(parseTargetCraftProject(JSON.stringify(bad), loaded).ok).toBe(false)
  expect(parseTargetCraftProject(JSON.stringify(input), catalog).ok).toBe(false)
  const changed = structuredClone(loaded)
  if (!changed.runeforging) throw Error('缺少目录')
  changed.runeforging._meta.reviewedAt = '2026-09-17'
  expect(parseTargetCraftProject(JSON.stringify(input), changed).ok).toBe(false)
  const source = signedProject(
    'Item Class: Gloves\nRarity: Normal\nRuneforged Adherent Cuffs\n--------\nItem Level: 86',
  )
  expect(parseTargetCraftProject(JSON.stringify(source), loaded).ok).toBe(false)
})
it('沿用锻造指引升级版本及签名，沿用旧目标保留接收方完整锻造历史和报价', () => {
  const source = {
    ...signedProject(),
    operations: [],
    strategy: {
      maxSteps: 5,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'runeforge' } }],
    },
  }
  const receiver = { ...project(), rulesVersion: 'basic-2026-09-16-v81' }
  const received = must(
    reuseTargetCraftPlan(JSON.stringify(receiver), JSON.stringify(source), loaded),
  )
  expect(received.project.rulesVersion).toBe(version)
  expect(received.project.runeforgingCatalogSignature).toBe(source.runeforgingCatalogSignature)
  expect(received.project.operations).toEqual([])
  const template = {
    ...receiver,
    targetDefinitions: {
      ...receiver.targetDefinitions,
      nextTargetId: 2,
      targets: [{ targetId: 't1', modId: 'IncreasedLife1' }],
    },
  }
  const current = {
    ...signedProject(),
    cursor: 1,
    pricing: { unit: 'divine', prices: { 'currency:verisium': 2 } },
  }
  const kept = must(reuseTargetCraftPlan(JSON.stringify(current), JSON.stringify(template), loaded))
  expect(kept.project.rulesVersion).toBe(version)
  expect(kept.project.operations).toEqual(current.operations)
  expect(kept.project.cursor).toBe(1)
  expect(kept.project.pricing).toEqual(current.pricing)
  expect(kept.states).toHaveLength(3)
})

import { runeforgingCatalogSignature } from './runeforgingCatalog'

const loaded: CraftCatalog = {
  ...catalog,
  runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
}
const dictionary = { items: { bases: { 'Adherent Cuffs': '合成测试手套' }, uniques: {} } }
function signedProject(sourceText: string | null = null) {
  return {
    ...project(),
    runeforgingCatalogSignature: runeforgingCatalogSignature(loaded),
    initialState: { ...project().initialState, sourceText },
    operations: [
      { kind: 'runeforge', fromBaseId: 'Adherent Cuffs', toBaseId: 'Runeforged Adherent Cuffs' },
      {
        currency: 'transmutation',
        modIds: ['IncreasedLife1'],
        rolls: [{ affixId: 'a1', modId: 'IncreasedLife1', values: [15] }],
      },
    ],
  }
}

it('未执行锻造指引及仅报价同样要求完整签名；v82继承结界条件', () => {
  for (const extra of [
    { pricing: { unit: 'divine', prices: { 'currency:verisium': 0 } } },
    {
      strategy: {
        maxSteps: 2,
        rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'runeforge' } }],
      },
    },
  ]) {
    const input = { ...signedProject(), operations: [], ...extra }
    must(parseTargetCraftProject(JSON.stringify(input), loaded))
    const { runeforgingCatalogSignature: _, ...unsigned } = input
    expect(parseTargetCraftProject(JSON.stringify(unsigned), loaded)).toMatchObject({
      ok: false,
      error: expect.stringContaining('签名'),
    })
  }
  const input = {
    ...project(),
    strategy: {
      maxSteps: 2,
      rules: [
        {
          conditions: [{ kind: 'item-property', property: 'Ward', min: 100 }],
          action: { kind: 'stop' },
        },
      ],
    },
  }
  must(parseTargetCraftProject(JSON.stringify(input), catalog))
})
