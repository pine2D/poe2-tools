import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { catalog, dictionary, parse } from './catalystTestFixture'
import { CORRUPTION_SOURCE } from './corruptionSource'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { inspectItem } from './export'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { estimateResistances } from './resistances'
import { statScalabilitySourceHash } from './statScalability'

const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
const initial: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'normal',
  sourceText: null,
  affixes: [],
}
const steps: CraftStep[] = [
  { kind: 'vaal', outcome: 'enchant', modId: 'CorruptionChaosResistance1', values: [15] },
  { kind: 'architect', outcome: 'enchant', modId: 'CorruptionAllResistances1', values: [10] },
]
const metadata = {
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog._meta.sourceCommit,
  corruptionSourceHash: CORRUPTION_SOURCE.sha256,
}

it('双强化项目所有游标恢复且绑定数据，旧版不能包含成功步骤或二重起点', () => {
  const p = { ...metadata, initialState: initial, operations: steps, cursor: 2 }
  const restore = (value: unknown) => parseCraftProject(JSON.stringify(value), catalog, dictionary)
  for (const cursor of [0, 1, 2]) {
    const result = must(restore({ ...p, cursor }))
    expect(result.states[2]).toMatchObject({
      twiceCorrupted: true,
      secondCorruption: { modId: 'CorruptionAllResistances1' },
    })
    expect(result.project.cursor).toBe(cursor)
    expect(result.project.operations).toEqual(steps)
  }
  for (let v = 2; v <= 62; v++)
    expect(restore({ ...p, cursor: 0, rulesVersion: `basic-2026-09-12-v${v}` }).ok).toBe(false)
  for (const corruptionSourceHash of [undefined, '0'.repeat(64)])
    expect(restore({ ...p, corruptionSourceHash }).ok).toBe(false)
  expect(
    restore({ ...p, cursor: 0, operations: [...steps, { kind: 'architect', outcome: 'destroy' }] })
      .ok,
  ).toBe(false)
  const legacy = {
    ...p,
    rulesVersion: 'basic-2026-09-12-v62',
    operations: [steps[0], { kind: 'architect', outcome: 'destroy' }],
  }
  expect(restore(legacy).ok).toBe(true)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 双强化催化装备输出、再导入、起点恢复完整保留两组',
  (locale) => {
    const local = createCraftItemDictionary(
      catalog,
      locale === 'en'
        ? {}
        : Object.fromEntries(
            ['items', 'stats'].map((k) => [
              k,
              JSON.parse(
                readFileSync(
                  new URL(`../../../data/dict/${locale}/${k}.json`, import.meta.url),
                  'utf8',
                ),
              ),
            ]),
          ),
    )
    let state: CraftState = {
      ...initial,
      rarity: 'rare',
      affixes: [{ modId: 'ChaosResist1', lines: ['+5(4-7)% to Chaos Resistance'] }],
      implicitLines: ['10(6-15)% increased Rarity of Items found'],
      catalyst: { id: "Chayula's", quality: 20, declared: true },
    }
    for (const step of steps) state = must(applyCraftStep(catalog, state, step))
    const text = must(exportCraftItemText(catalog, state, { locale, dictionary: local })).text
    expect(text).toContain('Twice Corrupted')
    const item = parse(text)
    expect(item.mods.map((m) => m.kind)).toEqual(['enchant', 'enchant', 'implicit', 'suffix'])
    const imported = must(
      importCraftState(
        catalog,
        state.baseId,
        item,
        inspectItem(item, local),
        undefined,
        undefined,
        local.stats?.entries,
      ),
    )
    expect(imported).toMatchObject({
      twiceCorrupted: true,
      corruption: state.corruption,
      secondCorruption: state.secondCorruption,
      affixes: state.affixes,
    })
    expect(estimateResistances(catalog, imported).chaosResistance).toEqual({ ok: true, value: 24 })
    expect(estimateResistances(catalog, imported).fireResistance).toEqual({ ok: true, value: 10 })
    // 催化品质下显示值与基础值不同，按已解析的两个头部定位，交换实际文本中的显示顺序。
    const firstHeader = item.mods[0]?.header.raw
    const secondHeader = item.mods[1]?.header.raw
    expect(firstHeader).toBeTruthy()
    expect(secondHeader).toBeTruthy()
    const blocks = text.split('--------')
    const firstIndex = blocks.findIndex((block) => block.includes(firstHeader ?? 'unmatched'))
    const secondIndex = blocks.findIndex(
      (block, index) => index > firstIndex && block.includes(secondHeader ?? 'unmatched'),
    )
    const firstBlock = blocks[firstIndex]
    const secondBlock = blocks[secondIndex]
    if (!firstBlock || !secondBlock) throw Error('缺少强化文本分组')
    blocks[firstIndex] = secondBlock
    blocks[secondIndex] = firstBlock
    const reversedText = blocks.join('--------')
    const reversedItem = parse(reversedText)
    const reversed = must(
      importCraftState(
        catalog,
        state.baseId,
        reversedItem,
        inspectItem(reversedItem, local),
        undefined,
        undefined,
        local.stats?.entries,
      ),
    )
    expect(reversed).toMatchObject({
      corruption: state.secondCorruption,
      secondCorruption: state.corruption,
    })
    expect(estimateResistances(catalog, reversed)).toEqual(estimateResistances(catalog, imported))
    const project = {
      ...metadata,
      scalabilitySourceHash: statScalabilitySourceHash(catalog),
      initialState: imported,
      operations: [],
      cursor: 0,
    }
    expect(parseCraftProject(JSON.stringify(project), catalog, local).ok).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v62' }),
        catalog,
        local,
      ).ok,
    ).toBe(false)
    const forged = { ...item }
    delete forged.twiceCorrupted
    expect(importCraftState(catalog, state.baseId, forged, inspectItem(item, local)).ok).toBe(false)
    const missingFlag = parse(text.replace('Twice Corrupted', 'Corrupted'))
    expect(
      importCraftState(
        catalog,
        state.baseId,
        missingFlag,
        inspectItem(missingFlag, local),
        undefined,
        undefined,
        local.stats?.entries,
      ).ok,
    ).toBe(false)
    const missingSecond = { ...imported }
    delete missingSecond.secondCorruption
    expect(
      parseCraftProject(JSON.stringify({ ...project, initialState: missingSecond }), catalog, local)
        .ok,
    ).toBe(false)
  },
)

it('原本没有强化的腐化装备追加一组后，可按二重腐化文本和项目恢复', () => {
  const state = must(
    applyCraftStep(catalog, { ...initial, corrupted: true }, steps[1] as CraftStep),
  )
  expect(state).not.toHaveProperty('secondCorruption')
  const text = must(exportCraftItemText(catalog, state, { locale: 'en', dictionary })).text
  const item = parse(text)
  const imported = must(
    importCraftState(catalog, state.baseId, item, inspectItem(item, dictionary)),
  )
  expect(imported).toMatchObject({ twiceCorrupted: true, corruption: state.corruption })
  const project = { ...metadata, initialState: imported, operations: [], cursor: 0 }
  expect(parseCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
})
