import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CatalogMod, CraftCatalog } from './catalog'
import { destructionModifierEffect, isDestructionAffix } from './destructionEffects'
import { explicitModEffect, usesExplicitModEffect } from './jewelEffects'
import { type CraftAffix, type CraftState, createCraftState } from './rehearsal'
import { scaleStatLineByEffect } from './statScalability'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function mod(id: string): CatalogMod {
  const found = catalog.modifiers.find((entry) => entry.id === id)
  if (!found) throw Error(`缺少 ${id}`)
  return found
}
function source(name: string, value?: number): CraftAffix {
  const entry = mod(`DestructionInfluence${name}ModifierEffect`)
  return {
    modId: entry.id,
    lines: entry.lines.map((line) =>
      value === undefined ? line : line.replace(/\(\d+-\d+\)/, String(value)),
    ),
  }
}
function state(...affixes: CraftAffix[]): CraftState {
  return { baseId: 'Crude Bow', itemLevel: 86, rarity: 'rare', sourceText: null, affixes }
}

it.each([
  ['Physical', 15, 'physical'],
  ['Fire', 20, 'fire'],
  ['Lightning', 20, 'lightning'],
  ['Cold', 20, 'cold'],
  ['Chaos', 20, 'chaos'],
  ['Mana', 30, 'mana'],
  ['Speed', 30, 'speed'],
  ['Critical', 30, 'critical'],
] as const)('%s 来源按目标标签计算，不从文本关键词猜测', (name, percent, tag) => {
  const target = { ...mod('FireResist1'), tags: [tag] }
  expect(destructionModifierEffect(catalog, state(source(name, percent)), target)).toEqual({
    ok: true,
    value: percent,
  })
  expect(
    destructionModifierEffect(catalog, state(source(name, percent)), { ...target, tags: [] }),
  ).toEqual({ ok: true, value: 0 })
})

it('元素伤害要求标签交集，和火焰增效相加而非连乘', () => {
  const input = state(source('Fire', 20), source('Elemental', 20))
  const target = { ...mod('FireResist1'), tags: ['elemental', 'fire', 'damage'] }
  expect(destructionModifierEffect(catalog, input, target)).toEqual({ ok: true, value: 40 })
  expect(destructionModifierEffect(catalog, input, mod('FireResist1'))).toEqual({
    ok: true,
    value: 20,
  })
  expect(
    destructionModifierEffect(catalog, state(source('Elemental', 20)), mod('FireResist1')),
  ).toEqual({ ok: true, value: 0 })
})

it('现有显式投影入口识别毁灭来源，取消来源后回到基础值', () => {
  const input = state(source('Fire', 20), source('Elemental', 20))
  const target = { ...mod('FireResist1'), tags: ['elemental', 'fire', 'damage'] }
  expect(usesExplicitModEffect(catalog, input)).toBe(true)
  expect(explicitModEffect(catalog, input, target)).toEqual({ ok: true, value: 40 })
  expect(usesExplicitModEffect(catalog, state())).toBe(false)
  expect(explicitModEffect(catalog, state(), target)).toEqual({ ok: true, value: 0 })
})

it('共享数值缩放只做一次取整，来源自身保持原值；当前整件制作门禁仍关闭', () => {
  const input = state(source('Fire', 20), source('Elemental', 20))
  const target = mod('LocalAddedFireDamage1')
  const effect = explicitModEffect(catalog, input, target)
  if (!effect.ok) throw Error(effect.error)
  const pattern = target.lines[0]
  const metadata = pattern && catalog.scalability?.[pattern]
  if (!pattern || !metadata) throw Error('缺少缩放数据')
  expect(scaleStatLineByEffect(pattern, 'Adds 2 to 5 Fire Damage', metadata, effect.value)).toEqual(
    {
      ok: true,
      value: 'Adds 2 to 7 Fire Damage',
    },
  )
  const original = source('Fire', 20)
  const sourceMod = mod(original.modId)
  const sourcePattern = sourceMod.lines[0]
  const sourceMetadata = sourcePattern && catalog.scalability?.[sourcePattern]
  if (!sourcePattern || !sourceMetadata) throw Error('缺少来源缩放数据')
  expect(scaleStatLineByEffect(sourcePattern, original.lines[0] ?? '', sourceMetadata, 40)).toEqual(
    {
      ok: true,
      value: original.lines[0],
    },
  )
  expect(createCraftState(catalog, input).ok).toBe(false)
})

it('九条来源自身不可增效，不因同标签而递归放大', () => {
  for (const entry of catalog.modifiers.filter((m) => m.id.startsWith('DestructionInfluence'))) {
    const affix = { modId: entry.id, lines: entry.lines }
    expect(isDestructionAffix(catalog, affix)).toBe(true)
    expect(destructionModifierEffect(catalog, state(affix), entry)).toEqual({ ok: true, value: 0 })
  }
})

it('未知来源实际掷值仅使匹配目标未知，范围外和小数不被接受', () => {
  const unknown = state(source('Fire'))
  expect(destructionModifierEffect(catalog, unknown, mod('FireResist1')).ok).toBe(false)
  expect(destructionModifierEffect(catalog, unknown, mod('ColdResist1'))).toEqual({
    ok: true,
    value: 0,
  })
  for (const value of [14, 21, 19.5])
    expect(isDestructionAffix(catalog, source('Fire', value))).toBe(false)
  expect(isDestructionAffix(catalog, { ...source('Fire', 20), fractured: true })).toBe(true)
  expect(isDestructionAffix(catalog, { ...source('Fire', 20), crafted: true })).toBe(false)
  // 属性身份不等于制作授权；亵渎来源的符文与部位由整件状态入口核对。
  expect(isDestructionAffix(catalog, { ...source('Fire', 20), desecrated: true })).toBe(true)
})

it('来源身份、元数据、重复条目和重复来源不能被文字匹配绕过', () => {
  const affix = source('Fire', 20)
  for (const mutate of [
    (c: CraftCatalog) => {
      c._meta.sourceCommit = '0'.repeat(40)
    },
    (c: CraftCatalog) => {
      c.modifiers.push(mod(affix.modId))
    },
    (c: CraftCatalog) => {
      const entry = c.modifiers.find((m) => m.id === affix.modId)
      if (entry) entry.tags = ['cold']
    },
    (c: CraftCatalog) => {
      const line = mod(affix.modId).lines[0]
      if (line && c.scalability) c.scalability[line] = [{ scalable: true, formats: [] }]
    },
  ]) {
    const changed = structuredClone(catalog)
    mutate(changed)
    expect(isDestructionAffix(changed, affix)).toBe(false)
  }
  expect(destructionModifierEffect(catalog, state(affix, affix), mod('FireResist1')).ok).toBe(false)
})
