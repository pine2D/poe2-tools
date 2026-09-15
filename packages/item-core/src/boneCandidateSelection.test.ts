import { expect, it } from 'vitest'
import { collectDesecrationCandidates } from './boneCandidates'
import { boneCatalog, boneState } from './boneTestFixture'
import { type CraftState, createCraftState } from './rehearsal'

it('固定选项只验证相关词缀族，同时保留未选档位对远古最低等级回退的影响', () => {
  const catalog = boneCatalog()
  const low = catalog.modifiers.find((mod) => mod.id === 'suffix1')
  if (!low) throw Error('缺少测试词缀')
  catalog.modifiers.push(
    { ...low, id: 'middle', level: 20 },
    { ...low, id: 'above-item-level', level: 55 },
  )
  const state: CraftState = {
    ...boneState(),
    itemLevel: 50,
    pendingDesecration: { boneId: 'ancient_rib', kind: 'suffix' },
  }
  let fullValidations = 0
  const full = collectDesecrationCandidates(catalog, state, (next) => {
    fullValidations++
    return createCraftState(catalog, next).ok
  })
  let selectedValidations = 0
  const selected = collectDesecrationCandidates(
    catalog,
    state,
    (next) => {
      selectedValidations++
      return createCraftState(catalog, next).ok
    },
    ['suffix1', 'exclusive1', 'missing'],
  )
  expect(selected).toEqual(
    full.filter((mod) => ['suffix1', 'exclusive1', 'missing'].includes(mod.id)),
  )
  expect(selected.map((mod) => mod.id)).toEqual(['exclusive1'])
  expect(selectedValidations).toBeLessThan(fullValidations)
})

it('指定三项仍独立检查占位侧、巫妖族、已有冲突与不存在的ID', () => {
  const catalog = boneCatalog('Wand')
  const state: CraftState = {
    ...boneState(['suffix1']),
    pendingDesecration: { boneId: 'preserved_jawbone', kind: 'suffix', lichOmen: 'liege' },
  }
  const validate = (next: CraftState) => createCraftState(catalog, next).ok
  const ids = ['suffix1', 'prefix1', 'exclusive1', 'missing']
  expect(collectDesecrationCandidates(catalog, state, validate, ids).map((mod) => mod.id)).toEqual([
    'exclusive1',
  ])
  expect(collectDesecrationCandidates(catalog, state, validate, [])).toEqual([])
})

it('只证明至少三项时提前停止校验，仍按完整候选池核对最低等级回退', () => {
  const catalog = boneCatalog()
  const low = catalog.modifiers.find((mod) => mod.id === 'suffix1')
  if (!low) throw Error('缺少测试词缀')
  catalog.modifiers.push({ ...low, id: 'higher', level: 20 })
  const state: CraftState = {
    ...boneState(),
    itemLevel: 50,
    pendingDesecration: { boneId: 'ancient_rib', kind: 'suffix' },
  }
  let fullCalls = 0
  const full = collectDesecrationCandidates(catalog, state, (next) => {
    fullCalls++
    return createCraftState(catalog, next).ok
  })
  let limitedCalls = 0
  const limited = collectDesecrationCandidates(
    catalog,
    state,
    (next) => {
      limitedCalls++
      return createCraftState(catalog, next).ok
    },
    undefined,
    3,
  )
  expect(limited).toHaveLength(3)
  expect(limited.every((mod) => full.includes(mod))).toBe(true)
  expect(limited.some((mod) => mod.id === 'suffix1')).toBe(false)
  expect(limitedCalls).toBeLessThan(fullCalls)
})

it('同族高档真实状态校验失败时保留低档回退及并列候选', () => {
  const catalog = boneCatalog()
  const low = catalog.modifiers.find((mod) => mod.id === 'suffix1')
  if (!low) throw Error('缺少测试词缀')
  catalog.modifiers.push({ ...low, id: 'invalid-higher', level: 20 }, { ...low, id: 'same-level' })
  const state: CraftState = {
    ...boneState(),
    itemLevel: 50,
    pendingDesecration: { boneId: 'ancient_rib', kind: 'suffix' },
  }
  const pool = collectDesecrationCandidates(
    catalog,
    state,
    (next) =>
      !next.affixes.some((affix) => affix.modId === 'invalid-higher') &&
      createCraftState(catalog, next).ok,
    ['suffix1', 'same-level'],
  )
  expect(pool.map((mod) => mod.id)).toEqual(['suffix1', 'same-level'])
})
