import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { analyzeEssenceTargetContext } from './essenceAdvice'
import { analyzeEssencePreparationContext } from './essencePreparation'
import { inspectItem } from './export'
import { parseItem } from './parse'
import type { CraftResult, CraftState } from './rehearsal'
import { importIdentifiedCraftState } from './rehearsalImport'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function must<T>(r: CraftResult<T>): T {
  if (!r.ok) throw Error(r.error)
  return r.value
}
const initial: CraftState = {
  baseId: 'Amber Amulet',
  itemLevel: 86,
  rarity: 'magic',
  sourceText: null,
  affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
}
it.each(['zh-CN', 'zh-TW', 'en'] as const)(
  '%s 九种属性结果导出回读保留工艺、身份和范围',
  (locale) => {
    const dictionary = createCraftItemDictionary(
      catalog,
      locale === 'en'
        ? undefined
        : {
            items: JSON.parse(readFileSync(`data/dict/${locale}/items.json`, 'utf8')),
            stats: JSON.parse(readFileSync(`data/dict/${locale}/stats.json`, 'utf8')),
          },
    )
    for (const [prefix, tier, value] of [
      ['LesserEssence', 2, 10],
      ['Essence', 4, 18],
      ['GreaterEssence', 6, 26],
    ] as const) {
      for (const attribute of ['Strength', 'Dexterity', 'Intelligence']) {
        const resultModId = `${attribute}${tier}`
        const operation = {
          kind: 'essence' as const,
          essenceId: `Metadata/Items/Currency/Currency${prefix}Attribute`,
          resultModId,
          values: [value],
        }
        const state = must(applyCraftStep(catalog, initial, operation))
        const text = must(exportCraftItemText(catalog, state, { locale, dictionary })).text
        if (locale !== 'en') expect(text).not.toContain(`to ${attribute}`)
        const parsed = parseItem(text)
        if (!parsed.ok) throw Error(parsed.error)
        const restored = must(
          importIdentifiedCraftState(
            catalog,
            initial.baseId,
            parsed.item,
            inspectItem(parsed.item, dictionary),
            undefined,
            undefined,
            dictionary.stats?.entries,
          ),
        )
        expect(restored.affixes.find((a) => a.modId === resultModId)).toMatchObject({
          crafted: true,
          lines: state.affixes[1]?.lines,
        })
        const costs = must(collectCraftCosts(catalog, [operation]))
        expect(costs).toHaveLength(1)
        expect(costs[0]?.count).toBe(1)
      }
    }
  },
)
it.each(['Strength2', 'Dexterity4', 'Intelligence6'])(
  '%s目标直接建议与普通起点准备均可实际回放',
  (modId) => {
    const advice = must(analyzeEssenceTargetContext(catalog, initial, [modId]))
    const selected = advice.find((a) => a.operation.resultModId === modId)
    expect(selected).toBeDefined()
    if (!selected) throw Error('缺少指定属性建议')
    expect(
      must(applyCraftStep(catalog, initial, selected.operation)).affixes.some(
        (a) => a.modId === modId,
      ),
    ).toBe(true)
    let state: CraftState = { ...initial, rarity: 'normal', affixes: [] }
    const route = must(analyzeEssencePreparationContext(catalog, state, [modId])).routes.find(
      (r) => r.final.operation.resultModId === modId,
    )
    expect(route).toBeDefined()
    if (!route) throw Error('缺少精华准备路线')
    for (const operation of [...route.preparations, route.final.operation])
      state = must(applyCraftStep(catalog, state, operation))
    expect(state.affixes.some((a) => a.modId === modId && a.crafted)).toBe(true)
  },
)
