import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { renderNumericLines } from './numeric'
import type { CraftAffix, CraftResult, CraftState } from './rehearsal'
import { estimateWeaponStats } from './weaponStats'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function affix(modId: string, values: number[]): CraftAffix {
  const mod = catalog.modifiers.find((entry) => entry.id === modId)
  if (!mod) throw new Error('测试目录缺失')
  return { modId, lines: must(renderNumericLines(mod.lines, values)) }
}
function effect(kind: string, value: number) {
  return affix(`DestructionInfluence${kind}ModifierEffect`, [value])
}
function state(affixes: CraftAffix[]): CraftState {
  return {
    baseId: 'Crude Bow',
    itemLevel: 86,
    rarity: 'rare',
    quality: 20,
    sockets: ['pob2:augment:["Thrud\'s Might","weapon"]'],
    sourceText: null,
    affixes,
  }
}
it('火焰与元素增效相加40后仅截断一次，移除来源恢复基础值且输入不变', () => {
  const original = state([
    affix('LocalAddedFireDamage3', [8, 14]),
    effect('Fire', 20),
    effect('Elemental', 20),
  ])
  const before = structuredClone(original)
  const panel = must(estimateWeaponStats(catalog, original))
  expect(panel.damage.Fire).toMatchObject({ affixMin: 11, affixMax: 19, min: 11, max: 19 })
  expect(original).toEqual(before)
  const restored = must(
    estimateWeaponStats(catalog, { ...original, affixes: original.affixes.slice(0, 1) }),
  )
  expect(restored.damage.Fire).toMatchObject({ affixMin: 8, affixMax: 14 })
})
it('物理增效先投影平值和百分比，品质仍为独立乘区', () => {
  const panel = must(
    estimateWeaponStats(
      catalog,
      state([
        affix('LocalAddedPhysicalDamage1', [2, 5]),
        affix('LocalIncreasedPhysicalDamagePercent1', [49]),
        effect('Physical', 15),
      ]),
    ),
  )
  expect(panel.damage.Physical).toMatchObject({
    affixMin: 2,
    affixMax: 5,
    affixIncreased: 56,
    min: 15,
    max: 26,
  })
})
it('速度和暴击增效按内部精度投影，不重新以未放大范围匹配', () => {
  const panel = must(
    estimateWeaponStats(
      catalog,
      state([
        affix('LocalIncreasedAttackSpeed1', [7]),
        affix('LocalCriticalStrikeChance1', [1.5]),
        effect('Speed', 30),
        effect('Critical', 30),
      ]),
    ),
  )
  expect(panel.attackSpeed).toMatchObject({ increased: 9, value: 1.31 })
  expect(panel.criticalChance).toMatchObject({ addedPoints: 1.95, value: 6.95 })
})
it('混合物理与命中按整组标签缩放，腐化强化不受显式增效影响', () => {
  const original = state([
    affix('LocalIncreasedPhysicalDamagePercentAndAccuracyRating1', [19, 20]),
    effect('Physical', 15),
  ])
  const panel = must(
    estimateWeaponStats(catalog, {
      ...original,
      corrupted: true,
      corruption: {
        modId: 'CorruptionLocalIncreasedPhysicalDamagePercent1',
        lines: ['20% increased Physical Damage'],
      },
    }),
  )
  expect(panel.damage.Physical).toMatchObject({
    affixIncreased: 21,
    corruptionIncreased: 20,
    min: 10,
    max: 15,
  })
})
it('九条增效来源均不是武器直接伤害，不匹配的未知来源不影响面板', () => {
  for (const [kind, value] of Object.entries({
    Physical: 15,
    Fire: 20,
    Lightning: 20,
    Cold: 20,
    Elemental: 20,
    Chaos: 20,
    Mana: 30,
    Speed: 30,
    Critical: 30,
  })) {
    const panel = must(estimateWeaponStats(catalog, state([effect(kind, value)])))
    expect(panel.damage.Physical).toMatchObject({ min: 7, max: 11 })
  }
  const unknown = effect('Fire', 20)
  unknown.lines = ['(15-20)% increased Explicit Fire Modifier magnitudes']
  expect(estimateWeaponStats(catalog, state([unknown])).ok).toBe(true)
  expect(
    estimateWeaponStats(catalog, state([unknown, affix('LocalAddedFireDamage1', [2, 5])])).ok,
  ).toBe(false)
})
it('匹配词缀缺失缩放元数据或精度未知时返回未知，不补零', () => {
  const original = state([affix('LocalAddedFireDamage1', [2, 5]), effect('Fire', 20)])
  for (const metadata of [
    undefined,
    [
      { scalable: true, formats: ['unsupported'] },
      { scalable: true, formats: [] },
    ],
  ]) {
    const changed = structuredClone(catalog)
    if (!changed.scalability) throw new Error('测试缩放目录缺失')
    if (metadata) changed.scalability['Adds (1-2) to (3-5) Fire Damage'] = metadata
    else delete changed.scalability['Adds (1-2) to (3-5) Fire Damage']
    expect(estimateWeaponStats(changed, original).ok).toBe(false)
  }
})

it.each([' (unscalable)', '（不可缩放）', '（不可縮放）', ' — 数值不可估量'])(
  '武器面板保留逐行不可缩放注记：%s',
  (annotation) => {
    const local = {
      modId: 'LocalAddedFireDamage1',
      lines: [`Adds 2 to 5 Fire Damage${annotation}`],
    }
    const original = { ...state([local, effect('Fire', 20)]), quality: 0 }
    expect(must(estimateWeaponStats(catalog, original)).damage.Fire).toMatchObject({
      affixMin: 2,
      affixMax: 5,
      min: 2,
      max: 5,
    })
    const unknown = effect('Fire', 20)
    unknown.lines = ['(15-20)% increased Explicit Fire Modifier magnitudes']
    expect(
      must(estimateWeaponStats(catalog, { ...original, affixes: [local, unknown] })).damage.Fire
        .max,
    ).toBe(5)
  },
)
it('混合组按目录行身份保留注记，倒序命中行不可缩放不阻止物理行增效', () => {
  const local = {
    modId: 'LocalIncreasedPhysicalDamagePercentAndAccuracyRating1',
    lines: ['+20 to Accuracy Rating（不可缩放）', '19% increased Physical Damage'],
  }
  const original = state([local, effect('Physical', 15)])
  expect(must(estimateWeaponStats(catalog, original)).damage.Physical.affixIncreased).toBe(21)
  local.lines = ['+20 to Accuracy Rating', '19% increased Physical Damage (unscalable)']
  expect(must(estimateWeaponStats(catalog, original)).damage.Physical.affixIncreased).toBe(19)
})
