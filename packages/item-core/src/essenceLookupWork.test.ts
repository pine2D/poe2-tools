import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { inspectEssences, isEssenceMappedMod } from './essences'
import { targetProjectSourceUsage } from './targetProjectSources'

const source: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function measured() {
  let reads = 0
  const catalog = {
    ...source,
    modifiers: source.modifiers.map(
      (mod) =>
        new Proxy(mod, {
          get(target, key, receiver) {
            if (key === 'id') reads++
            return Reflect.get(target, key, receiver)
          },
        }),
    ),
  }
  return { catalog, reads: () => reads }
}
it('整批枚举只做线性身份查询，不能为每种材料重新遍历整个词缀目录', () => {
  const { catalog, reads } = measured()
  const base = catalog.bases.find((b) => b.id === 'Amber Amulet')
  if (!base) throw Error('缺少基底')
  const result = inspectEssences(catalog, base)
  expect(result.filter((e) => e.resultModId).map((e) => e.modId)).toEqual([
    'EssencePercentStrength1',
    'EssencePercentDexterity1',
    'EssencePercentIntelligence1',
  ])
  expect(reads()).toBeLessThan(catalog.modifiers.length * 3)
})
it('检查已有工艺授权也不随材料数重复扫描全目录', () => {
  const { catalog, reads } = measured()
  const base = catalog.bases.find((b) => b.id === 'Amber Amulet')
  if (!base) throw Error('缺少基底')
  expect(isEssenceMappedMod(catalog, base, 'EssencePercentIntelligence1')).toBe(true)
  expect(reads()).toBeLessThan(catalog.modifiers.length * 3)
})
it('没有目标时不读取任何词缀身份或可选目录', () => {
  const { catalog, reads } = measured()
  expect(targetProjectSourceUsage(catalog, 'Amber Amulet', [])).toEqual({
    essence: false,
    desecration: false,
    liquid: false,
    jewel: false,
  })
  expect(reads()).toBe(0)
})
it('每次查询看到当前目录，不缓存之前通过的来源或身份', () => {
  const catalog = structuredClone(source)
  const base = catalog.bases.find((b) => b.id === 'Amber Amulet')
  if (!base) throw Error('缺少基底')
  expect(isEssenceMappedMod(catalog, base, 'EssencePercentIntelligence1')).toBe(true)
  const mod = catalog.modifiers.find((m) => m.id === 'EssencePercentIntelligence1')
  if (!mod) throw Error('缺少词缀')
  const previous = mod.group
  mod.group = 'invalid'
  expect(isEssenceMappedMod(catalog, base, mod.id)).toBe(false)
  mod.group = previous
  expect(isEssenceMappedMod(catalog, base, mod.id)).toBe(true)
  catalog.modifiers.push(structuredClone(mod))
  expect(isEssenceMappedMod(catalog, base, mod.id)).toBe(false)
})
