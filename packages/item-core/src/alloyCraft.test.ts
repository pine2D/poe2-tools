import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { prepareAlloyCraft } from './alloyCraft'
import { alloyCatalogSignature } from './alloys'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { type AlloyCraftOperation, applyCraftStep } from './craftSteps'
import { type CraftState, createCraftState } from './rehearsal'

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog: CraftCatalog = { ...primary, alloys: alloyTestFixture() }
const material = 'Metadata/Items/Currency/CurrencyVerisiumAlloy1'
const initial: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [
    { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
    { modId: 'FireResist1', lines: ['+10% to Fire Resistance'] },
  ],
}
const operation: AlloyCraftOperation = {
  kind: 'alloy',
  alloyId: material,
  removeModId: 'IncreasedLife1',
  values: [40],
}

it('合金移除一整组并加入保证工艺；后续神圣与剥离仍识别此组', () => {
  expect(createCraftState(catalog, initial).ok).toBe(true)
  const prepared = prepareAlloyCraft(catalog, initial, material)
  expect(prepared.ok).toBe(true)
  if (!prepared.ok) throw new Error(prepared.error)
  expect(prepared.value.removableAffixes.map((a) => a.modId)).toEqual([
    'IncreasedLife1',
    'FireResist1',
  ])
  const applied = applyCraftStep(catalog, initial, operation)
  expect(applied.ok).toBe(true)
  if (!applied.ok) throw new Error(applied.error)
  expect(applied.value.affixes).toEqual([
    initial.affixes[1],
    { modId: 'AlloyMaximumRunicWard1', crafted: true, lines: ['+40(37-49) to maximum Runic Ward'] },
  ])
  expect(collectCraftCosts(catalog, [operation])).toEqual({
    ok: true,
    value: [{ id: `alloy:${material}`, name: 'Runic Alloy', count: 1 }],
  })
  expect(prepareAlloyCraft(catalog, applied.value, material)).toMatchObject({ ok: false })
  expect(
    applyCraftStep(catalog, applied.value, {
      currency: 'divine',
      modIds: [],
      implicitValues: [10],
      rolls: [
        { modId: 'FireResist1', values: [9] },
        { modId: 'AlloyMaximumRunicWard1', values: [45] },
      ],
    }).ok,
  ).toBe(true)
  expect(
    applyCraftStep(catalog, applied.value, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'AlloyMaximumRunicWard1',
    }).ok,
  ).toBe(true)
  expect(initial.affixes).toHaveLength(2)
})

it('独立表缺失或映射改变时不能执行，签名反映语义变更', () => {
  expect(prepareAlloyCraft(primary, initial, material).ok).toBe(false)
  expect(alloyCatalogSignature(primary)).toBeNull()
  const changed = structuredClone(catalog)
  const mapping = changed.alloys?.alloys[0]?.mappings[0]
  if (!mapping) throw new Error('缺少关系样本')
  mapping.modId = 'AlloyMaximumRunicWardPercent1'
  expect(alloyCatalogSignature(changed)).not.toBe(alloyCatalogSignature(catalog))
  const invalid = { ...catalog, _meta: { ...catalog._meta, sourceCommit: 'a'.repeat(40) } }
  expect(prepareAlloyCraft(invalid, initial, material).ok).toBe(false)
})

it('拒绝非稀有、腐化、无可移除、低物等、未知映射和非法数值', () => {
  for (const state of [
    { ...initial, rarity: 'magic' as const },
    { ...initial, corrupted: true as const },
    { ...initial, itemLevel: 12 },
    { ...initial, affixes: [] },
  ])
    expect(prepareAlloyCraft(catalog, state, material).ok).toBe(false)
  expect(prepareAlloyCraft(catalog, initial, 'unknown').ok).toBe(false)
  expect(applyCraftStep(catalog, initial, { ...operation, values: [100] }).ok).toBe(false)
  expect(applyCraftStep(catalog, initial, { ...operation, removeModId: 'unknown' }).ok).toBe(false)
})

it('保护破裂组，同组不能被保证替换绕过冲突', () => {
  const fractured = {
    ...initial,
    affixes: initial.affixes.map((a, i) => (i === 0 ? { ...a, fractured: true as const } : a)),
  }
  const prepared = prepareAlloyCraft(catalog, fractured, material)
  expect(prepared.ok && prepared.value.removableAffixes.map((a) => a.modId)).toEqual([
    'FireResist1',
  ])
  expect(applyCraftStep(catalog, fractured, operation).ok).toBe(false)
})
