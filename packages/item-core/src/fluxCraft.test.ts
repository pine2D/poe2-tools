import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import {
  applyFluxCraft,
  type FluxCraftOperation,
  isFluxCraftOperation,
  prepareFluxCraft,
} from './fluxCraft'
import {
  FLUXES,
  type FluxCatalog,
  fluxCatalogSignature,
  fluxModsCanCoexist,
  hasFluxModEligibility,
} from './fluxes'
import { inspectNumericLines, readNumericValues, renderNumericLines } from './numeric'
import {
  addCraftAffix,
  type CraftResult,
  type CraftState,
  craftCandidates,
  createCraftState,
} from './rehearsal'

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const table: FluxCatalog = JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8'))
const catalog: CraftCatalog = { ...primary, fluxes: table }
function must<T>(value: CraftResult<T>): T {
  if (!value.ok) throw Error(value.error)
  return value.value
}
function mod(id: string) {
  const found = catalog.modifiers.find((mod) => mod.id === id)
  if (!found) throw Error(id)
  return found
}
function base(id: string) {
  const found = catalog.bases.find((base) => base.id === id)
  if (!found) throw Error(id)
  return found
}
function rolls(id: string, high = false) {
  return must(inspectNumericLines(mod(id).lines)).map((range) => (high ? range.max : range.min))
}
function initial(
  ids = ['FireResist1', 'ColdResist2', 'LightningResist3', 'IncreasedLife1'],
  baseId = 'Gold Ring',
) {
  return must(
    enableCraftAffixIdentity(catalog, {
      baseId,
      itemLevel: 86,
      rarity: 'rare',
      sourceText: null,
      affixes: ids.map((modId) => ({
        modId,
        lines: must(renderNumericLines(mod(modId).lines, rolls(modId))),
      })),
    }),
  )
}
function operation(state: CraftState, index: number): FluxCraftOperation {
  const flux = FLUXES[index]
  if (!flux) throw Error('缺少材料')
  const prepared = must(prepareFluxCraft(catalog, state, flux.id))
  return {
    kind: 'flux',
    fluxId: flux.id,
    rolls: prepared.changes.map(({ affix, toMod }, i) => ({
      affixId: affix.affixId as string,
      modId: toMod.id,
      values: rolls(toMod.id, i % 2 === 1),
    })),
  }
}

describe('溶剂真实多实例转换', () => {
  it('一次转换全部其他元素实例，严格指定各新类型数值并保留身份顺序和游标', () => {
    const state = initial(),
      before = structuredClone(state)
    const prepared = must(prepareFluxCraft(catalog, state, FLUXES[0].id))
    expect(
      prepared.changes.map(({ affix, fromMod, toMod }) => [affix.affixId, fromMod.id, toMod.id]),
    ).toEqual([
      ['a2', 'ColdResist2', 'FireResist2'],
      ['a3', 'LightningResist3', 'FireResist3'],
    ])
    const step = operation(state, 0)
    step.rolls.reverse()
    const next = must(applyCraftStep(catalog, state, step))
    expect(next.affixes.map((affix) => [affix.affixId, affix.modId])).toEqual([
      ['a1', 'FireResist1'],
      ['a2', 'FireResist2'],
      ['a3', 'FireResist3'],
      ['a4', 'IncreasedLife1'],
    ])
    expect(next.affixes[0]).toEqual(state.affixes[0])
    expect(next.affixes[3]).toEqual(state.affixes[3])
    expect(next.nextAffixId).toBe(5)
    for (const roll of step.rolls)
      expect(next.affixes.find((a) => a.affixId === roll.affixId)?.lines).toEqual(
        must(renderNumericLines(mod(roll.modId).lines, roll.values)),
      )
    expect(applyFluxCraft(catalog, state, step)).toEqual({ ok: true, value: next })
    expect(applyFluxCraft(catalog, state, step)).toEqual({ ok: true, value: next })
    expect(state).toEqual(before)
    const cold = must(applyFluxCraft(catalog, next, operation(next, 1)))
    expect(cold.affixes.map((a) => a.modId)).toEqual([
      'ColdResist1',
      'ColdResist2',
      'ColdResist3',
      'IncreasedLife1',
    ])
    const lightning = must(applyFluxCraft(catalog, cold, operation(cold, 2)))
    const chaos = must(applyFluxCraft(catalog, lightning, operation(lightning, 3)))
    expect(chaos.affixes.map((a) => a.modId)).toEqual([
      'ChaosResist1',
      'ChaosResist2',
      'ChaosResist3',
      'IncreasedLife1',
    ])
    expect(prepareFluxCraft(catalog, chaos, FLUXES[0].id).ok).toBe(false)
    expect(chaos.nextAffixId).toBe(5)
  })
  it('不同档位汇聚相同混沌类型，后续神圣和移除精确按实例且普通追加不生成重复', () => {
    const start = initial(['FireResist4', 'ColdResist5', 'IncreasedLife1'])
    const after = must(applyFluxCraft(catalog, start, operation(start, 3)))
    expect(after.affixes.map((a) => [a.affixId, a.modId])).toEqual([
      ['a1', 'ChaosResist4'],
      ['a2', 'ChaosResist4'],
      ['a3', 'IncreasedLife1'],
    ])
    const divine = must(
      applyCraftStep(catalog, after, {
        currency: 'divine',
        modIds: [],
        implicitValues: must(
          inspectNumericLines(base(after.baseId).implicit?.split('\n') ?? []),
        ).map((range) => range.min),
        rolls: after.affixes.map((affix) => ({
          affixId: affix.affixId as string,
          modId: affix.modId,
          values:
            affix.affixId === 'a2'
              ? rolls('ChaosResist4')
              : must(readNumericValues(mod(affix.modId).lines, affix.lines)).map((value) => {
                  if (value === null) throw Error('未知数值')
                  return value
                }),
        })),
      }),
    )
    expect(divine.affixes[0]).toEqual(after.affixes[0])
    expect(divine.affixes[1]?.lines).toEqual(
      must(renderNumericLines(mod('ChaosResist4').lines, rolls('ChaosResist4'))),
    )
    expect(
      applyCraftStep(catalog, after, {
        currency: 'annulment',
        modIds: [],
        removeModId: 'ChaosResist4',
      }).ok,
    ).toBe(false)
    const removed = must(
      applyCraftStep(catalog, after, {
        currency: 'annulment',
        modIds: [],
        removeModId: 'ChaosResist4',
        removeAffixId: 'a2',
      }),
    )
    expect(removed.affixes.map((a) => a.affixId)).toEqual(['a1', 'a3'])
    expect(
      craftCandidates(catalog, removed, 'exalted').some((m) => m.group === 'ChaosResistance'),
    ).toBe(false)
    expect(addCraftAffix(catalog, removed, 'ChaosResist4', 'exalted').ok).toBe(false)
    expect(createCraftState(primary, after).ok).toBe(false)
    const { nextAffixId: _, ...legacy } = after
    expect(
      createCraftState(catalog, {
        ...legacy,
        affixes: after.affixes.map(({ affixId: _, ...a }) => a),
      }).ok,
    ).toBe(false)
  })
  it('转换后的重复抗性仍逐条计数，破裂只锁指定实例', () => {
    const before = initial(['FireResist4', 'ColdResist5', 'IncreasedLife1', 'IncreasedMana1'])
    const after = must(applyFluxCraft(catalog, before, operation(before, 3)))
    const fractured = must(
      applyCraftStep(catalog, after, { kind: 'fracture', modId: 'ChaosResist4', affixId: 'a2' }),
    )
    expect(fractured.affixes.map((a) => [a.affixId, a.fractured === true])).toEqual([
      ['a1', false],
      ['a2', true],
      ['a3', false],
      ['a4', false],
    ])
    expect(fractured.nextAffixId).toBe(5)
    expect(applyCraftStep(catalog, after, { kind: 'fracture', modId: 'ChaosResist4' }).ok).toBe(
      false,
    )
    expect(createCraftState(catalog, { ...after, rarity: 'magic' }).ok).toBe(false)
    const tooMany = {
      ...after,
      nextAffixId: 7,
      affixes: [
        ...after.affixes,
        { ...after.affixes[0], affixId: 'a5' },
        { ...after.affixes[1], affixId: 'a6' },
      ],
    } as CraftState
    expect(createCraftState(catalog, tooMany).ok).toBe(false)
    expect(after.affixes.every((a) => !a.fractured)).toBe(true)
  })
  it('普通珠宝跨颜色转换及混沌终点保留非工艺来源，不能授权不匹配域或任意重复', () => {
    const start = initial(['JewelMaximumFireResistance'], 'Ruby')
    const cold = must(applyFluxCraft(catalog, start, operation(start, 1)))
    expect(cold.affixes[0]).toEqual({
      affixId: 'a1',
      modId: 'JewelMaximumColdResistance',
      lines: must(
        renderNumericLines(
          mod('JewelMaximumColdResistance').lines,
          rolls('JewelMaximumColdResistance'),
        ),
      ),
    })
    const chaos = must(applyFluxCraft(catalog, cold, operation(cold, 3)))
    expect(chaos.affixes[0]?.modId).toBe('CraftedJewelMaximumChaosResistance')
    expect(chaos.affixes[0]).not.toHaveProperty('crafted')
    expect(hasFluxModEligibility(catalog, base('Ruby'), mod('JewelMaximumColdResistance'))).toBe(
      true,
    )
    expect(
      hasFluxModEligibility(catalog, base('Gold Ring'), mod('JewelMaximumColdResistance')),
    ).toBe(false)
    expect(
      fluxModsCanCoexist(catalog, base('Gold Ring'), mod('IncreasedLife1'), mod('IncreasedLife1')),
    ).toBe(false)
    const item = initial(['IncreasedLife1'])
    expect(
      createCraftState(catalog, {
        ...item,
        nextAffixId: 3,
        affixes: [...item.affixes, { ...item.affixes[0], affixId: 'a2' }],
      } as CraftState).ok,
    ).toBe(false)
  })
  it('明确亵渎域转换保留绿色来源，转混沌后标记仍保留', () => {
    const id = 'AbyssModArmourJewelleryKurgalSuffixColdChaosResistance'
    const start = must(
      enableCraftAffixIdentity(catalog, {
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'rare',
        sourceText: null,
        affixes: [
          {
            modId: id,
            lines: must(renderNumericLines(mod(id).lines, rolls(id))),
            desecrated: true,
          },
        ],
      }),
    )
    const lightning = must(applyFluxCraft(catalog, start, operation(start, 2)))
    expect(lightning.affixes[0]).toMatchObject({
      affixId: 'a1',
      modId: 'AbyssModArmourJewelleryUlamanSuffixLightningChaosResistance',
      desecrated: true,
    })
    const chaos = must(applyFluxCraft(catalog, lightning, operation(lightning, 3)))
    expect(chaos.affixes[0]).toMatchObject({
      affixId: 'a1',
      modId: 'ChaosResist6',
      desecrated: true,
    })
    expect(chaos.nextAffixId).toBe(2)
  })
  it('遗漏、多余、重复、过期、错类型和非法数值全部拒绝，失败不修改前态', () => {
    const start = initial(),
      step = operation(start, 0),
      before = structuredClone(start)
    const first = step.rolls[0]
    if (!first) throw Error('缺少roll')
    for (const rolls of [
      [],
      step.rolls.slice(0, 1),
      [...step.rolls, first],
      step.rolls.map((r, i) => (i === 0 ? { ...r, affixId: 'a99' } : r)),
      step.rolls.map((r, i) => (i === 0 ? { ...r, modId: 'ColdResist2' } : r)),
      step.rolls.map((r, i) => (i === 0 ? { ...r, values: [999] } : r)),
      [...step.rolls, { affixId: 'a1', modId: 'FireResist1', values: rollsForFirst() }],
    ])
      expect(applyFluxCraft(catalog, start, { ...step, rolls }).ok).toBe(false)
    expect(start).toEqual(before)
    function rollsForFirst() {
      return rolls('FireResist1')
    }
  })
  it('严格拒绝字段注入和显式缺省值，破裂整体消费与实际工艺转换给出尚未核实提示', () => {
    const start = initial(),
      step = operation(start, 0)
    for (const bad of [
      { ...step, rolls: [{ ...step.rolls[0], affixId: 'a9007199254740992' }] },
      { ...step, extra: true },
      { ...step, rolls: undefined },
      { ...step, fluxId: '' },
      { ...step, rolls: [{ ...step.rolls[0], affixId: undefined }] },
      { ...step, rolls: [{ ...step.rolls[0], extra: true }] },
    ])
      expect(isFluxCraftOperation(bad)).toBe(false)
    const fractured = {
      ...start,
      affixes: start.affixes.map((a, i) => (i === 3 ? { ...a, fractured: true as const } : a)),
    }
    expect(prepareFluxCraft(catalog, fractured, FLUXES[0].id)).toMatchObject({
      ok: false,
      error: expect.stringContaining('未核实'),
    })
    const crafted = {
      ...start,
      affixes: start.affixes.map((a, i) => (i === 1 ? { ...a, crafted: true as const } : a)),
    }
    expect(prepareFluxCraft(catalog, crafted, FLUXES[0].id)).toMatchObject({
      ok: false,
      error: expect.stringContaining('未核实'),
    })
    expect(prepareFluxCraft(catalog, { ...start, corrupted: true }, FLUXES[0].id).ok).toBe(false)
    expect(prepareFluxCraft(catalog, { ...start, destroyed: true }, FLUXES[0].id).ok).toBe(false)
    expect(prepareFluxCraft(catalog, { ...start, rarity: 'normal' }, FLUXES[0].id).ok).toBe(false)
    expect(prepareFluxCraft(primary, start, FLUXES[0].id).ok).toBe(false)
  })
  it('来源签名只规范关系顺序，缺失或损坏来源拒绝，显式缺目标不能部分转换', () => {
    const signature = fluxCatalogSignature(catalog)
    expect(typeof signature).toBe('string')
    expect(
      fluxCatalogSignature({
        ...catalog,
        fluxes: {
          ...table,
          _meta: { ...table._meta, reviewedAt: '2026-09-16' },
          rows: [...table.rows].reverse(),
        },
      }),
    ).toBe(signature)
    expect(fluxCatalogSignature(primary)).toBeNull()
    const bad = {
      ...catalog,
      _meta: {
        ...catalog._meta,
        sources: catalog._meta.sources.filter((s) => s.path !== 'src/Data/ModVeiled.lua'),
      },
    }
    expect(fluxCatalogSignature(bad)).toBeNull()
    const missing = structuredClone(table)
    const row = missing.rows.find((r) => r.members.cold.modId === 'ColdResist2')
    if (!row) throw Error('缺少关系')
    row.members.fire.modId = null
    expect(prepareFluxCraft({ ...catalog, fluxes: missing }, initial(), FLUXES[0].id).ok).toBe(
      false,
    )
  })
})
