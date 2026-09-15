import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { parseCraftProject } from './craftProject'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import {
  parseTargetCraftProject,
  serializeTargetCraftProject,
  type TargetCraftProject,
} from './craftProjectTargets'
import { inspectItem } from './export'
import { FLUXES, fluxCatalogSignature } from './fluxes'
import { jewelSourceHash } from './jewels'
import { parseItem } from './parse'
import type { CraftResult } from './rehearsal'
import { importCraftState, importIdentifiedCraftState } from './rehearsalImport'
import { extractTargetDefinitions } from './targetExtraction'
import { evaluateTargetDefinitions } from './targetProgress'
import { loadTargetWorkbenchProject } from './targetWorkbenchProject'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function project(): TargetCraftProject {
  return {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-12-v75',
    fluxCatalogSignature: fluxCatalogSignature(catalog) ?? '',
    initialState: {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'normal',
      affixes: [],
      nextAffixId: 1,
      sourceText: null,
    },
    targetDefinitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    orphanedTargets: [],
    operations: [
      {
        currency: 'transmutation',
        modIds: ['FireResist4'],
        rolls: [{ affixId: 'a1', modId: 'FireResist4', values: [21] }],
      },
      {
        currency: 'augmentation',
        modIds: ['IncreasedLife1'],
        rolls: [{ affixId: 'a2', modId: 'IncreasedLife1', values: [10] }],
      },
      {
        currency: 'regal',
        modIds: ['ColdResist4'],
        rolls: [{ affixId: 'a3', modId: 'ColdResist4', values: [22] }],
      },
      {
        currency: 'exalted',
        modIds: ['LightningResist4'],
        rolls: [{ affixId: 'a4', modId: 'LightningResist4', values: [23] }],
      },
      {
        kind: 'flux',
        fluxId: FLUXES[0]?.id ?? '',
        rolls: [
          { affixId: 'a3', modId: 'FireResist4', values: [24] },
          { affixId: 'a4', modId: 'FireResist4', values: [25] },
        ],
      },
      { currency: 'annulment', modIds: [], removeModId: 'FireResist4', removeAffixId: 'a3' },
    ],
    cursor: 5,
  }
}

describe('v75 多条溶剂项目严格回放', () => {
  it('保留三个同类实例、撤销位置及未来逐条移除；保存读取等价', () => {
    const source = project()
    const saved = serializeTargetCraftProject(source, catalog)
    expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true })
    if (!saved.ok) return
    const restored = loadTargetWorkbenchProject(saved.value, catalog)
    expect(restored, JSON.stringify(restored)).toMatchObject({ ok: true })
    if (!restored.ok) return
    expect(restored.value.project).toEqual(source)
    expect(restored.value.states[5]?.affixes.map((a) => [a.affixId, a.modId])).toEqual([
      ['a1', 'FireResist4'],
      ['a2', 'IncreasedLife1'],
      ['a3', 'FireResist4'],
      ['a4', 'FireResist4'],
    ])
    expect(restored.value.states[6]?.affixes.map((a) => a.affixId)).toEqual(['a1', 'a2', 'a4'])
    expect(restored.value.states[6]?.nextAffixId).toBe(5)
  })
  it('来源缺失/不同、未来步骤漏身份、起点伪造身份都不能恢复', () => {
    const source = project()
    const { fluxes: _fluxes, ...primary } = catalog
    expect(parseTargetCraftProject(JSON.stringify(source), primary).ok).toBe(false)
    for (const mutate of [
      (p: TargetCraftProject) => {
        delete p.fluxCatalogSignature
      },
      (p: TargetCraftProject) => {
        p.fluxCatalogSignature += 'x'
      },
      (p: TargetCraftProject) => {
        delete (p.operations[5] as { removeAffixId?: string }).removeAffixId
      },
      (p: TargetCraftProject) => {
        p.initialState.nextAffixId = 2
      },
      (p: TargetCraftProject) => {
        ;(p.operations[4] as { rolls: unknown[] }).rolls.pop()
      },
    ]) {
      const bad = structuredClone(source)
      mutate(bad)
      expect(parseTargetCraftProject(JSON.stringify(bad), catalog).ok).toBe(false)
    }
  })
  it('同类独立数值与破裂目标保存后仍分别对应，未来移除不更换已破裂实例', () => {
    const p = project()
    p.operations.splice(5, 0, { kind: 'fracture', modId: 'FireResist4', affixId: 'a4' })
    const restored = must(parseTargetCraftProject(JSON.stringify(p), catalog))
    const state = restored.states[6]
    if (!state) throw new Error('缺少转换后破裂状态')
    p.targetDefinitions = must(
      extractTargetDefinitions(
        catalog,
        state,
        [
          { modId: 'FireResist4', affixId: 'a3' },
          { modId: 'FireResist4', affixId: 'a4' },
        ],
        true,
        true,
      ),
    )
    const recovered = must(
      parseTargetCraftProject(must(serializeTargetCraftProject(p, catalog)), catalog),
    )
    expect(recovered.project.targetDefinitions).toEqual(p.targetDefinitions)
    expect(evaluateTargetDefinitions(catalog, state, p.targetDefinitions).satisfied).toBe(true)
    const after = recovered.states[7]
    if (!after) throw new Error('缺少未来移除状态')
    expect(evaluateTargetDefinitions(catalog, after, p.targetDefinitions).satisfied).toBe(false)
    expect(after.affixes.find((a) => a.affixId === 'a4')?.fractured).toBe(true)
  })
  it.each(['en', 'zh-CN', 'zh-TW'] as const)(
    '%s 转换结果可按观察原文重新导入，但不伪造旧制作历史；来源篡改拒绝',
    (locale) => {
      const p = project()
      const converted = must(parseTargetCraftProject(JSON.stringify(p), catalog)).states[5]
      if (!converted) throw new Error('缺少转换状态')
      const dictionary =
        locale === 'en'
          ? {}
          : {
              items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
              stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
            }
      const text = must(exportCraftItemText(catalog, converted, { locale, dictionary })).text
      const parsed = parseItem(text)
      if (!parsed.ok) throw new Error(parsed.error)
      const inspection = inspectItem(parsed.item, createCraftItemDictionary(catalog, dictionary))
      expect(importCraftState(catalog, converted.baseId, parsed.item, inspection).ok).toBe(false)
      const observed = must(
        importIdentifiedCraftState(
          catalog,
          converted.baseId,
          parsed.item,
          inspection,
          undefined,
          undefined,
          dictionary.stats?.entries,
        ),
      )
      expect(observed.affixes).toHaveLength(4)
      const observedProject = {
        ...p,
        initialState: {
          ...observed,
          nextAffixId: 5,
          affixes: observed.affixes.map((a, i) => ({ ...a, affixId: `a${i + 1}` })),
        },
        operations: [],
        cursor: 0,
      }
      const saved = must(serializeTargetCraftProject(observedProject, catalog, dictionary))
      expect(must(loadTargetWorkbenchProject(saved, catalog, dictionary)).states).toHaveLength(1)
      const first = observedProject.initialState.affixes[0]
      if (!first) throw new Error('缺少词缀')
      first.lines = ['+25% to Fire Resistance']
      expect(serializeTargetCraftProject(observedProject, catalog, dictionary).ok).toBe(false)
    },
  )
  it('普通珠宝经虚空得到无工艺来源最大混沌抗性，目标与回放不依赖液态来源', () => {
    const p = project()
    p.initialState = { ...p.initialState, baseId: 'Ruby' }
    p.jewelSourceHash = jewelSourceHash(catalog) ?? ''
    p.operations = [
      { currency: 'transmutation', modIds: ['JewelMaximumFireResistance'] },
      {
        kind: 'flux',
        fluxId: FLUXES.find((f) => f.target === 'chaos')?.id ?? '',
        rolls: [{ affixId: 'a1', modId: 'CraftedJewelMaximumChaosResistance', values: [] }],
      },
    ]
    p.cursor = 2
    p.targetDefinitions = {
      nextTargetId: 2,
      targets: [{ targetId: 't1', modId: 'CraftedJewelMaximumChaosResistance' }],
      alternatives: [],
      values: [],
    }
    const { liquidEmotions: _liquid, ...withoutLiquid } = catalog
    const restored = must(parseTargetCraftProject(JSON.stringify(p), withoutLiquid))
    expect(restored.states[2]?.affixes).toEqual([
      {
        affixId: 'a1',
        modId: 'CraftedJewelMaximumChaosResistance',
        lines: ['+1% to Maximum Chaos Resistance'],
      },
    ])
    expect(restored.project.liquidEmotionSourceHash).toBeUndefined()
  })
  it('旧v72–74不可借同一目录承认未来溶剂历史或签名', () => {
    for (const version of [72, 73, 74]) {
      const p = { ...project(), rulesVersion: `basic-2026-09-12-v${version}` }
      const parser =
        version === 72
          ? parseCraftProject
          : version === 73
            ? parseIdentityCraftProject
            : parseTargetCraftProject
      expect(parser(JSON.stringify(p), catalog).ok).toBe(false)
    }
  })
})
