import { describe, expect, it } from 'vitest'
import { craftAffixIdentityError, enableCraftAffixIdentity } from './affixIdentity'
import { alloyTestFixture } from './alloyTestFixture'
import { required } from './beltTestFixture'
import { catalog as realCatalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { jewelFixture } from './jewelTestFixture'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { jointEffectDivineOperations, liquidRouteContext } from './liquidRouteCandidates'
import { renderNumericLines } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { sovereignRouteContext } from './sovereignRouteCandidates'
import { sovereignTargetSupport } from './sovereignTargetSupport'
import { STAT_SCALABILITY_SOURCE } from './statScalability'
import type { CraftTargetValues } from './targets'

const must = <T>(result: CraftResult<T>): T => {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
const semantic = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (key, entry) =>
      ['affixId', 'nextAffixId', 'removeAffixId'].includes(key) ? undefined : entry,
    ),
  ) as unknown

function fixture(kind: 'sovereign' | 'liquid') {
  if (kind === 'sovereign') {
    const catalog = { ...realCatalog, alloys: alloyTestFixture() }
    const initial: CraftState = {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'normal',
      sourceText: null,
      affixes: [],
    }
    const goal: CraftTargetValues = {
      modId: 'FireResist1',
      basis: 'effective',
      bounds: [{ index: 0, min: 13, max: 13 }],
    }
    return {
      catalog,
      initial,
      goal,
      effect: {
        modId: 'AlloyEffectOfResistanceMods1',
        crafted: true as const,
        lines: ['20(20-30)% increased Explicit Resistance Modifier magnitudes'],
      },
      target: { modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
      context: (state: CraftState) =>
        sovereignRouteContext(catalog, state, [[goal.modId]], [goal], () => {}),
    }
  }
  const { catalog, state } = jewelFixture()
  catalog._meta.sources.push(LIQUID_EMOTION_SOURCE, STAT_SCALABILITY_SOURCE)
  catalog.liquidEmotions = structuredClone(realCatalog.liquidEmotions ?? [])
  catalog.modifiers.push(...structuredClone(realCatalog.modifiers.filter((mod) => mod.craftedOnly)))
  const target = required(catalog.modifiers.find((mod) => mod.id === 'prefix1'))
  target.lines = ['+(10-20)% to Fire Resistance']
  target.tags = ['fire']
  const effect = required(catalog.modifiers.find((mod) => mod.id === 'CraftedJewelPrefixEffect'))
  catalog.scalability = {
    [required(target.lines[0])]: [{ scalable: true, formats: [] }],
    [required(effect.lines[0])]: [{ scalable: false, formats: [] }],
  }
  const goal: CraftTargetValues = {
    modId: target.id,
    basis: 'effective',
    bounds: [{ index: 0, min: 31, max: 31 }],
  }
  return {
    catalog,
    initial: { ...state, rarity: 'normal' as const },
    goal,
    effect: {
      modId: effect.id,
      crafted: true as const,
      lines: must(renderNumericLines(effect.lines, [40])),
    },
    target: { modId: target.id, lines: ['+20% to Fire Resistance'] },
    context: (current: CraftState) => liquidRouteContext(catalog, current, [[goal.modId]], [goal]),
  }
}

describe('路线辅助候选实例身份', () => {
  it.each(['sovereign', 'liquid'] as const)('%s 新增预演消费预算，耗尽立即停止', (kind) => {
    const { catalog, initial, context } = fixture(kind)
    for (const state of [initial, must(enableCraftAffixIdentity(catalog, initial))]) {
      const source = context(state)
      let applications = 0
      expect([...source.candidates(state, () => false)]).toEqual([])
      const candidates = [...source.candidates(state, () => ++applications <= 1)]
      expect(candidates).toHaveLength(1)
      expect(applications).toBe(2)
      expect(applyCraftStep(catalog, state, required(candidates[0]).operation).ok).toBe(true)
      applications = 0
      const all = [
        ...source.candidates(state, () => {
          applications++
          return true
        }),
      ]
      expect(applications).toBe(all.length)
      expect(all).toEqual([...source.candidates(state)])
    }
  })

  it('君王未来可行性逐实例判断，破裂低值不能遮住可重掷副本', () => {
    const { initial, context, goal } = fixture('sovereign')
    const affixes = [
      {
        modId: goal.modId,
        affixId: 'a1',
        lines: ['+6% to Fire Resistance'],
        fractured: true as const,
      },
      { modId: goal.modId, affixId: 'a2', lines: ['+10% to Fire Resistance'] },
    ]
    // 仅测试纯候选分析；公开制作状态仍拒绝重复同组。
    const state: CraftState = { ...initial, rarity: 'rare', affixes, nextAffixId: 3 }
    const reversed = { ...state, affixes: [...affixes].reverse() }
    expect(context(state).enabled).toBe(true)
    expect(context(reversed).enabled).toBe(true)
    expect(context(state).priority(state)).toBe(context(reversed).priority(reversed))
    const locked = { ...state, affixes: [required(affixes[0])] }
    expect(context(locked).enabled).toBe(false)
  })

  it.each(['sovereign', 'liquid'] as const)('%s 阶段分按整组实例计算，与排列无关', (kind) => {
    const { initial, context, goal, target } = fixture(kind)
    const low = kind === 'sovereign' ? '+6% to Fire Resistance' : '+10% to Fire Resistance'
    const state: CraftState = {
      ...initial,
      rarity: 'rare',
      nextAffixId: 3,
      affixes: [
        { modId: goal.modId, affixId: 'a1', lines: [low] },
        {
          ...target,
          affixId: 'a2',
          ...(kind === 'sovereign' ? { lines: ['+10% to Fire Resistance'] } : {}),
        },
      ],
    }
    const reversed = { ...state, affixes: [...state.affixes].reverse() }
    expect(context(state).priority(state)).toBe(context(reversed).priority(reversed))
  })

  it('君王假想增效逐候选独立分配，不要求已完成稀有度与牺牲准备', () => {
    const { catalog, initial, goal, effect } = fixture('sovereign')
    for (const legacy of [initial, { ...initial, rarity: 'rare' as const, affixes: [effect] }]) {
      const input = { ...must(enableCraftAffixIdentity(catalog, legacy)), nextAffixId: 9 }
      const before = structuredClone(input)
      const support = sovereignTargetSupport(catalog, input, [goal])
      expect(support?.contexts).toHaveLength(11)
      for (const context of support?.contexts ?? []) {
        expect(craftAffixIdentityError(context.state)).toBeNull()
        expect(context.state.nextAffixId).toBe(10)
        expect(context.state.affixes.at(-1)).toMatchObject({ affixId: 'a9', crafted: true })
      }
      expect(semantic(support)).toEqual(sovereignTargetSupport(catalog, legacy, [goal]))
      expect(sovereignTargetSupport(catalog, input, [goal])).toEqual(support)
      expect(input).toEqual(before)
    }
  })

  it('液态未来增效反解使用独立可分配快照，游标耗尽不能假造临时实例', () => {
    const { catalog, initial, goal, context } = fixture('liquid')
    const mod = required(catalog.modifiers.find((entry) => entry.id === goal.modId))
    const input = { ...must(enableCraftAffixIdentity(catalog, initial)), nextAffixId: 9 }
    const before = structuredClone(input)
    const future = context(input)
    expect(future.enabled).toBe(true)
    expect(future.rolls(input, mod)).toEqual(context(initial).rolls(initial, mod))
    expect(future.rolls(input, mod)).not.toBeNull()
    const exhausted = { ...input, nextAffixId: Number.MAX_SAFE_INTEGER }
    expect(context(exhausted).rolls(exhausted, mod)).toBeNull()
    expect(future.rolls(exhausted, mod)).toBeNull()
    const exhaustedFirst = context(exhausted)
    expect(exhaustedFirst.rolls(exhausted, mod)).toBeNull()
    expect(exhaustedFirst.rolls(input, mod)).toEqual(future.rolls(input, mod))
    expect(input).toEqual(before)
  })

  it.each(['sovereign', 'liquid'] as const)(
    '%s 新增候选使用真实预演的实例 ID，旧格式语义和候选上限一致',
    (kind) => {
      const { catalog, initial, context } = fixture(kind)
      const input = { ...must(enableCraftAffixIdentity(catalog, initial)), nextAffixId: 9 }
      const before = structuredClone(input)
      const candidates = [...context(input).candidates(input)]
      expect(candidates.length).toBeGreaterThan(0)
      expect(semantic(candidates)).toEqual([...context(initial).candidates(initial)])
      for (const { operation } of candidates) {
        if (!('currency' in operation) || !operation.modIds.length) continue
        const applied = must(applyCraftStep(catalog, input, operation))
        for (const roll of operation.rolls ?? []) {
          expect(roll.affixId).toBe('a9')
          expect(applied.affixes.at(-1)?.affixId).toBe(roll.affixId)
          expect(applied.affixes.at(-1)?.modId).toBe(roll.modId)
        }
        expect(applied.nextAffixId).toBe(10)
      }
      expect([...context(input).candidates(input)]).toEqual(candidates)
      expect(input).toEqual(before)
    },
  )

  it.each(['sovereign', 'liquid'] as const)(
    '%s 清除工艺候选携带所属实例，真实应用保留其他词缀与游标',
    (kind) => {
      const { catalog, initial, context, target, effect } = fixture(kind)
      const legacy: CraftState = { ...initial, rarity: 'rare', affixes: [target, effect] }
      const input = { ...must(enableCraftAffixIdentity(catalog, legacy)), nextAffixId: 9 }
      const candidates = [...context(input).candidates(input)].filter(
        ({ operation }) => 'currency' in operation && operation.currency === 'annulment',
      )
      expect(candidates.length).toBeGreaterThan(0)
      expect(semantic(candidates)).toEqual(
        [...context(legacy).candidates(legacy)].filter(
          ({ operation }) => 'currency' in operation && operation.currency === 'annulment',
        ),
      )
      for (const { operation } of candidates) {
        expect(operation).toMatchObject({ removeModId: effect.modId, removeAffixId: 'a2' })
        expect(must(applyCraftStep(catalog, input, operation))).toMatchObject({
          nextAffixId: 9,
          affixes: [input.affixes[0]],
        })
      }
    },
  )

  it('液态替换候选保留具体移除实例，可真实回放且不改变输入', () => {
    const { catalog, initial, context, target } = fixture('liquid')
    const legacy: CraftState = {
      ...initial,
      rarity: 'rare',
      affixes: [target, { modId: 'suffix1', lines: ['suffix1 5'] }],
    }
    const input = { ...must(enableCraftAffixIdentity(catalog, legacy)), nextAffixId: 9 }
    const before = structuredClone(input)
    const candidates = [...context(input).candidates(input)].filter(
      ({ operation }) => 'kind' in operation && operation.kind === 'liquid-emotion',
    )
    expect(candidates.length).toBeGreaterThan(0)
    for (const { operation } of candidates) {
      const removed = required(
        input.affixes.find(
          (affix) => 'removeModId' in operation && affix.modId === operation.removeModId,
        ),
      )
      expect(operation).toMatchObject({ removeAffixId: removed.affixId })
      const applied = must(applyCraftStep(catalog, input, operation))
      expect(applied.affixes.slice(0, -1)).toEqual(
        input.affixes.filter((affix) => affix !== removed),
      )
      expect(applied.affixes.at(-1)?.affixId).toBe('a9')
    }
    expect(input).toEqual(before)
  })

  it('联合神圣按中间增效实例重掷，所有 rolls 带 ID 且跳过破裂实例', () => {
    const { catalog, initial, target, effect, goal } = fixture('sovereign')
    const legacy: CraftState = {
      ...initial,
      rarity: 'rare',
      affixes: [
        target,
        effect,
        { modId: 'ColdResist1', lines: ['+8% to Cold Resistance'], fractured: true },
      ],
    }
    const input = { ...must(enableCraftAffixIdentity(catalog, legacy)), nextAffixId: 9 }
    const before = structuredClone(input)
    const candidates = [...jointEffectDivineOperations(catalog, input, [goal], [], false, [])]
    expect(candidates.length).toBeGreaterThan(0)
    expect(semantic(candidates)).toEqual([
      ...jointEffectDivineOperations(catalog, legacy, [goal], [], false, []),
    ])
    for (const operation of candidates) {
      expect(operation.rolls).toEqual([
        { modId: effect.modId, affixId: 'a2', values: [30] },
        { modId: target.modId, affixId: 'a1', values: [10] },
      ])
      const applied = must(applyCraftStep(catalog, input, operation))
      expect(applied.nextAffixId).toBe(9)
      expect(applied.affixes[2]).toEqual(input.affixes[2])
      expect(createCraftState(catalog, applied).ok).toBe(true)
    }
    expect(input).toEqual(before)
  })
})
