import { expect, it } from 'vitest'
import { boneCatalog } from './boneTestFixture'
import { catalog as realCatalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { catalog, mod } from './partialTargetFixture'
import { type CraftState, createCraftState } from './rehearsal'
import { estimateSkillLevelContributions } from './skillLevelContributions'

const source = catalog(
  [
    mod('minion', 'suffix', { lines: ['+1 to Level of all Minion Skills'] }),
    mod('all', 'prefix', { lines: ['+1 to Level of all Skills'] }),
    mod('spell', 'prefix', { lines: ['+(1-3) to Level of all Spell Skills'] }),
    mod('fire', 'suffix', { lines: ['+2 to Level of all Fire Spell Skills'] }),
  ],
  { implicit: 'Grants Skill: Level (1-20) Skeletal Warrior Minion', implicitTags: [[]] },
)
const state: CraftState = {
  baseId: 'Focus',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)'],
  affixes: [{ modId: 'minion', lines: ['+1 to Level of all Minion Skills'] }],
}
it('移除技能词缀后贡献消失，授予技能起点和原状态不变', () => {
  const before = estimateSkillLevelContributions(source, state)
  expect(before).toEqual({
    ok: true,
    value: [{ scope: 'all Minion Skills', value: { ok: true, value: 1 } }],
  })
  const removed = applyCraftStep(source, state, {
    currency: 'annulment',
    modIds: [],
    removeModId: 'minion',
  })
  if (!removed.ok) throw new Error(removed.error)
  expect(estimateSkillLevelContributions(source, removed.value)).toEqual({ ok: true, value: [] })
  expect(removed.value.implicitLines).toEqual(state.implicitLines)
  expect(state.affixes).toHaveLength(1)
})
it('不同适用范围分列，未知掷值不按下限处理，也不污染其他范围', () => {
  const current = {
    ...state,
    affixes: [
      ...state.affixes,
      { modId: 'all', lines: ['+1 to Level of all Skills'] },
      { modId: 'spell', lines: ['+(1-3) to Level of all Spell Skills'] },
      { modId: 'fire', lines: ['+2 to Level of all Fire Spell Skills'] },
    ],
  }
  const result = estimateSkillLevelContributions(source, current)
  if (!result.ok) throw new Error(result.error)
  expect(result.value.find((entry) => entry.scope === 'all Skills')?.value).toEqual({
    ok: true,
    value: 1,
  })
  expect(result.value.find((entry) => entry.scope === 'all Minion Skills')?.value).toEqual({
    ok: true,
    value: 1,
  })
  expect(result.value.find((entry) => entry.scope === 'all Spell Skills')?.value.ok).toBe(false)
  expect(result.value.find((entry) => entry.scope === 'all Fire Spell Skills')?.value).toEqual({
    ok: true,
    value: 2,
  })
})
it('同范围逐词缀相加，条件词缀保留独立范围，不并入无条件贡献', () => {
  const lines = [
    '+1 to Level of all Minion Skills',
    '+2 to Level of all Minion Skills',
    '+3 to Level of all Minion Skills while on Full Life',
  ]
  const custom = catalog([mod('combined', 'prefix', { lines })])
  const result = estimateSkillLevelContributions(custom, {
    ...state,
    implicitLines: [],
    affixes: [{ modId: 'combined', lines }],
  })
  if (!result.ok) throw new Error(result.error)
  expect(result.value).toEqual([
    { scope: 'all Minion Skills', value: { ok: true, value: 3 } },
    { scope: 'all Minion Skills while on Full Life', value: { ok: true, value: 3 } },
  ])
})
it('无效状态和摧毁装备不能给出完整贡献', () => {
  expect(estimateSkillLevelContributions(source, { ...state, baseId: 'missing' }).ok).toBe(false)
  expect(estimateSkillLevelContributions(source, { ...state, destroyed: true }).ok).toBe(false)
})
it('复用催化增效与来源门禁，缺少缩放资料时不能展示基础值充当有效值', () => {
  const lines = ['+5 to Level of all Fire Spell Skills']
  const custom = {
    ...catalog([mod('fire5', 'prefix', { lines, tags: ['fire'] })], { type: 'Ring' }),
    _meta: realCatalog._meta,
    scalability: realCatalog.scalability ?? {},
  }
  const current: CraftState = {
    ...state,
    implicitLines: [],
    catalyst: { id: "Xoph's", quality: 20 },
    affixes: [{ modId: 'fire5', lines }],
  }
  expect(estimateSkillLevelContributions(custom, current)).toEqual({
    ok: true,
    value: [{ scope: 'all Fire Spell Skills', value: { ok: true, value: 6 } }],
  })
  const missing = estimateSkillLevelContributions({ ...custom, scalability: {} }, current)
  if (!missing.ok) throw new Error(missing.error)
  expect(missing.value[0]?.value.ok).toBe(false)
})
it('原文含尚未核对的催化品质时，不能将基础技能加成称为有效值', () => {
  const custom = catalog(
    [mod('fire5', 'prefix', { lines: ['+5 to Level of all Fire Spell Skills'] })],
    { type: 'Ring' },
  )
  const current = {
    ...state,
    implicitLines: [],
    sourceText: 'Quality (Fire Modifiers): +20%\n+5 to Level of all Fire Spell Skills',
    affixes: [{ modId: 'fire5', lines: ['+5 to Level of all Fire Spell Skills'] }],
  }
  expect(createCraftState(custom, current).ok).toBe(true)
  expect(estimateSkillLevelContributions(custom, current).ok).toBe(false)
})
it('合法待揭示状态保持未知，不能忽略未揭示组返回完整贡献', () => {
  const current: CraftState = {
    ...state,
    pendingDesecration: { boneId: 'preserved_rib', kind: 'prefix' },
  }
  const verified = { ...source, _meta: boneCatalog()._meta }
  expect(createCraftState(verified, current).ok).toBe(true)
  expect(estimateSkillLevelContributions(verified, current).ok).toBe(false)
})
