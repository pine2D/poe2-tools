import { expect, it } from 'vitest'
import { catalog, dictionary } from './catalystTestFixture'
import { parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { readCraftProperty } from './itemProperties'
import type { CraftState } from './rehearsal'

const bow: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  quality: 0,
  sockets: [],
}
const property = (property = 'physicalDps', min = 9, max?: number) => ({
  kind: 'item-property',
  property,
  min,
  ...(max === undefined ? {} : { max }),
})
function strategy(condition: unknown) {
  return { maxSteps: 10, rules: [{ conditions: [condition], action: { kind: 'stop' } }] }
}
function decision(condition: unknown, state = bow) {
  const s = readCraftStrategy(strategy(condition))
  if (!s.ok) throw new Error(s.error)
  const r = evaluateCraftStrategy(catalog, state, s.value, 0)
  if (!r.ok) throw new Error(r.error)
  return r.value.kind
}
it('基础物理 DPS 与含端点上下限判断，不受其他属性的缺失影响', () => {
  expect(decision(property('physicalDps', 9, 9))).toBe('stop')
  expect(decision(property('physicalDps', 9.01))).toBe('unmatched')
  expect(decision(property('elementalDps', 0, 0))).toBe('stop')
  expect(decision(property('attackSpeed', 1.2, 1.2))).toBe('stop')
  expect(decision(property('Armour', 0))).toBe('unmatched')
})
it('DPS 显示边界消除二进制尾数，等于上下限也能命中', () => {
  const base = catalog.bases.find((base) => base.id === bow.baseId)
  if (!base) throw new Error('缺少弓')
  const source = {
    ...catalog,
    bases: [{ ...base, properties: { ...base.properties, AttackRateBase: 1.03 } }],
  }
  expect(readCraftProperty(source, bow, 'physicalDps')).toEqual({ ok: true, value: 7.725 })
  const s = readCraftStrategy(strategy(property('physicalDps', 7.725, 7.725)))
  if (!s.ok) throw new Error(s.error)
  expect(evaluateCraftStrategy(source, bow, s.value, 0)).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
})
it('未知品质和孔位取反后仍未知，已确认的未达成才匹配取反', () => {
  const not = { kind: 'not', condition: property('physicalDps', 10) }
  expect(decision(not)).toBe('stop')
  const { quality: _, ...unknownQuality } = bow
  const { sockets: __, ...unknownSockets } = bow
  expect(decision(not, unknownQuality)).toBe('unmatched')
  expect(decision(not, unknownSockets)).toBe('unmatched')
  expect(
    decision({ kind: 'any', conditions: [property(), { kind: 'always' }] }, unknownQuality),
  ).toBe('stop')
})
it('合法施加物理词缀后由未达成变成停止；原状态无变更', () => {
  const mod = catalog.modifiers.find(
    (m) =>
      m.group === 'LocalPhysicalDamage' &&
      m.level === 1 &&
      m.eligibility.some((e) => e.tag === 'bow' && e.value === 1),
  )
  if (!mod) throw new Error('缺少弓物理词缀')
  const result = applyCraftStep(catalog, bow, {
    currency: 'transmutation',
    modIds: [mod.id],
    rolls: [{ modId: mod.id, values: [1, 4] }],
  })
  if (!result.ok) throw new Error(result.error)
  expect(decision(property('physicalDps', 10))).toBe('unmatched')
  expect(decision(property('physicalDps', 10), result.value)).toBe('stop')
  expect(bow.affixes).toEqual([])
})
it('防御条件按实际装备面板判断，不存在的防御不当零', () => {
  const base = catalog.bases.find(
    (b) =>
      b.type === 'Helmet' &&
      b.properties.Armour &&
      b.properties.EnergyShield === undefined &&
      !b.implicit &&
      !b.hidden &&
      !b.runeforged,
  )
  if (!base?.properties.Armour) throw new Error('缺少护甲基底')
  const state = { ...bow, baseId: base.id }
  expect(decision(property('Armour', base.properties.Armour, base.properties.Armour), state)).toBe(
    'stop',
  )
  expect(decision(property('EnergyShield', 0), state)).toBe('unmatched')
})
it('严格验证数值、指标、字段与重复条件，多个不同面板可联合', () => {
  for (const bad of [
    property('unknown'),
    property('physicalDps', -1),
    property('physicalDps', Infinity),
    property('physicalDps', NaN),
    property('physicalDps', 5, 4),
    { ...property(), extra: true },
  ]) {
    expect(readCraftStrategy(strategy(bad)).ok).toBe(false)
  }
  const s = strategy(property())
  const rule = s.rules[0]
  if (!rule) throw new Error('缺少规则')
  rule.conditions.push(property('attackSpeed', 1))
  expect(readCraftStrategy(s).ok).toBe(true)
  rule.conditions.push(property())
  expect(readCraftStrategy(s).ok).toBe(false)
})
it('项目保留深层面板条件，v47 不能注入未命中的深层规则', () => {
  const p = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-12-v48',
    initialState: bow,
    operations: [],
    cursor: 0,
    augmentSourceHash: catalog._meta.sources.find(
      (source) => source.path === 'src/Data/ModRunes.lua',
    )?.sha256,
    strategy: strategy({ kind: 'any', conditions: [{ kind: 'always' }, property()] }),
  }
  const r = parseCraftProject(JSON.stringify(p), catalog, dictionary)
  expect(r.ok, r.ok ? '' : r.error).toBe(true)
  expect(
    parseCraftProject(
      JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v47' }),
      catalog,
      dictionary,
    ).ok,
  ).toBe(false)
})
