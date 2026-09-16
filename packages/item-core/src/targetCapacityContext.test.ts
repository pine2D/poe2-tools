import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
import { findTargetCapacityContext } from './targetCapacityContext'
import { validateStoredTargetDefinitions } from './targetDefinitions'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  alloys: alloyTestFixture(),
}
const astrid = 'pob2:augment:["Astrid\'s Creativity","caster"]'
const serle = 'pob2:augment:["Serle\'s Triumph","caster"]'
const base: CraftState = {
  baseId: 'Volatile Wand',
  rarity: 'rare',
  itemLevel: 86,
  sourceText: null,
  affixes: [],
  sockets: [null, null],
}
const definitions = {
  nextTargetId: 3,
  targets: ['AlloyEffectOfSocketedAugments1', 'AlloyCastSpeedDamageAsExtraColdHybridOneHand1'].map(
    (modId, i) => ({ targetId: `t${i + 1}`, modId }),
  ),
  alternatives: [],
  values: [],
}
it('双工艺目标选真实Astrid状态，不被后来的仅Serle状态遮蔽', () => {
  const crafted = { ...base, sockets: [astrid, null] }
  const suffix = { ...base, sockets: [serle, null] }
  expect(findTargetCapacityContext(catalog, [crafted, suffix], definitions)?.sockets).toEqual([
    astrid,
    null,
  ])
  expect(findTargetCapacityContext(catalog, [suffix, crafted], definitions)?.sockets).toEqual([
    astrid,
    null,
  ])
})
it('容量共存优先选实际共存状态，分离状态不得拼接', () => {
  const crafted = { ...base, sockets: [astrid, null] }
  const suffix = { ...base, sockets: [serle, null] }
  const together = { ...base, sockets: [astrid, serle] }
  expect(
    findTargetCapacityContext(catalog, [together, suffix, crafted], definitions)?.sockets,
  ).toEqual([astrid, serle])
  const separate = findTargetCapacityContext(catalog, [crafted, suffix], definitions)
  expect(separate?.sockets?.filter(Boolean)).toHaveLength(1)
})
it('已摧毁、错误部位、重复或伪造来源不能成为容量上下文', () => {
  for (const invalid of [
    { ...base, sockets: [astrid], destroyed: true as const },
    { ...base, baseId: 'Adherent Cuffs', sockets: [astrid] },
    { ...base, sockets: [astrid, astrid] },
  ])
    expect(findTargetCapacityContext(catalog, [invalid], definitions)).toBeUndefined()
  const missingSource = { ...catalog, _meta: { ...catalog._meta, sources: [] } }
  expect(
    findTargetCapacityContext(missingSource, [{ ...base, sockets: [astrid] }], definitions),
  ).toBeUndefined()
})

import { addCraftAffix, craftCandidates } from './rehearsal'
import { editTargetDefinitionContext } from './targetDefinitionContext'
import { editTargetDefinitions } from './targetDefinitionEdits'
import { extractTargetDefinitions } from './targetExtraction'

it('新增第七目标按拟编辑定义选择Serle，不被当前选中的Astrid阻挡', () => {
  let state: CraftState = { ...base, sockets: [serle, null] }
  for (const kind of ['prefix', 'prefix', 'prefix', 'suffix', 'suffix', 'suffix'] as const) {
    const mod = craftCandidates(catalog, state).find((entry) => entry.kind === kind)
    if (!mod) throw Error('缺少普通词缀')
    const result = addCraftAffix(catalog, state, mod.id)
    if (!result.ok) throw Error(result.error)
    state = result.value
  }
  const seventh = craftCandidates(catalog, state).find((entry) => entry.kind === 'suffix')
  if (!seventh) throw Error('缺少第四后缀')
  const extracted = extractTargetDefinitions(
    catalog,
    state,
    state.affixes.map((a) => a.modId),
    false,
    false,
  )
  if (!extracted.ok) throw Error(extracted.error)
  const history = [{ ...state, sockets: [astrid, null] }, state]
  const selected = findTargetCapacityContext(catalog, history, extracted.value)
  expect(selected?.sockets).toEqual([astrid, null])
  const edit = { kind: 'add', modId: seventh.id }
  const changed = editTargetDefinitions(catalog, state, extracted.value, edit, selected, history)
  expect(changed.ok).toBe(true)
  if (!changed.ok) throw Error(changed.error)
  for (const replacement of [
    { kind: 'replace-definitions', definitions: changed.value },
    {
      kind: 'replace',
      config: { targetModIds: changed.value.targets.map((target) => target.modId) },
    },
  ])
    expect(
      editTargetDefinitions(catalog, state, extracted.value, replacement, selected, history).ok,
    ).toBe(true)
  expect(
    editTargetDefinitionContext(
      catalog,
      state,
      { definitions: changed.value, orphanedTargets: [] },
      { kind: 'replace-definitions', definitions },
      state,
      history,
    ).ok,
  ).toBe(true)
  const jointDefinitions = {
    ...changed.value,
    targets: [...extracted.value.targets.slice(0, 5), ...definitions.targets].map((target, i) => ({
      ...target,
      targetId: `t${i + 1}`,
    })),
    nextTargetId: 8,
  }
  const both = { ...state, sockets: [astrid, serle] }
  expect(validateStoredTargetDefinitions(catalog, state.baseId, jointDefinitions, both).ok).toBe(
    true,
  )
  const separate = findTargetCapacityContext(catalog, history, jointDefinitions)
  expect(
    validateStoredTargetDefinitions(catalog, state.baseId, jointDefinitions, separate).ok,
  ).toBe(false)
  expect(
    editTargetDefinitionContext(
      catalog,
      state,
      { definitions: extracted.value, orphanedTargets: [] },
      edit,
      selected,
      history,
    ).ok,
  ).toBe(true)
})
