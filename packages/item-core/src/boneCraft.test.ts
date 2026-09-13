import { describe, expect, it } from 'vitest'
import { applyBoneCraft, desecrationCandidates, prepareDesecration } from './boneCraft'
import { BONE_RULES, type CraftBone } from './boneRules'
import { boneCatalog, boneState } from './boneTestFixture'
import { compareCraftStates } from './comparison'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { analyzeEssenceTargets } from './essenceAdvice'
import { prepareEssenceCraft } from './essenceCraft'
import {
  addCraftAffix,
  applyCraftOperation,
  type CraftState,
  craftCandidates,
  createCraftState,
  prepareCraftOperation,
  removableCraftAffixes,
} from './rehearsal'
import { socketCandidates } from './sockets'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

describe('骨骼与固定三候选揭示', () => {
  it('空位骨骼→pending占位→固定三项→选择来源数值，普通/精华入口阻止隐藏加工', () => {
    const catalog = boneCatalog()
    const start = boneState()
    const applied = applyCraftStep(catalog, start, {
      kind: 'desecrate',
      boneId: 'preserved_rib',
      affixKind: 'suffix',
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.value).toMatchObject({
      pendingDesecration: { boneId: 'preserved_rib', kind: 'suffix' },
      affixes: [],
    })
    expect(start).not.toHaveProperty('pendingDesecration')
    expect(
      applyCraftOperation(catalog, applied.value, { currency: 'exalted', modIds: ['prefix1'] }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('请先完成亵渎揭示') })
    expect(prepareEssenceCraft(catalog, applied.value, 'missing')).toMatchObject({
      ok: false,
      error: expect.stringContaining('请先完成亵渎揭示'),
    })
    expect(applyCraftStep(catalog, applied.value, { kind: 'artificer' })).toMatchObject({
      ok: false,
      error: expect.stringContaining('请先完成亵渎揭示'),
    })
    expect(exportCraftItemText(catalog, applied.value)).toMatchObject({
      ok: false,
      error: expect.stringContaining('保存项目'),
    })
    expect(compareCraftStates(catalog, start, applied.value)).toMatchObject({
      ok: true,
      value: { pendingDesecration: { before: null, after: { kind: 'suffix' } } },
    })
    const offered = applyCraftStep(catalog, applied.value, {
      kind: 'desecration-offer',
      modIds: ['suffix1', 'exclusive1', 'exclusive2'],
    })
    expect(offered.ok).toBe(true)
    if (!offered.ok) return
    const revealed = applyCraftStep(catalog, offered.value, {
      kind: 'desecration-reveal',
      modId: 'exclusive1',
      values: [7],
    })
    expect(revealed).toMatchObject({
      ok: true,
      value: {
        affixes: [{ modId: 'exclusive1', desecrated: true, lines: ['exclusive1 7(1-10)'] }],
      },
    })
    if (revealed.ok) expect(revealed.value).not.toHaveProperty('pendingDesecration')
  })
  it('满六组必须移除同侧释放空位，五组禁止指定移除，pending计入容量', () => {
    const catalog = boneCatalog()
    const full = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
    const bone = { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' } as const
    expect(applyCraftStep(catalog, full, bone).ok).toBe(false)
    expect(applyCraftStep(catalog, full, { ...bone, removeModId: 'prefix1' }).ok).toBe(false)
    expect(applyCraftStep(catalog, full, { ...bone, removeModId: 'suffix1' }).ok).toBe(true)
    const five = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2'])
    expect(applyCraftStep(catalog, five, { ...bone, removeModId: 'suffix1' }).ok).toBe(false)
    expect(applyCraftStep(catalog, five, bone).ok).toBe(true)
    expect(
      createCraftState(catalog, {
        ...full,
        pendingDesecration: { boneId: 'preserved_rib', kind: 'suffix' },
      } as CraftState).ok,
    ).toBe(false)
  })
})

function pending(options?: string[], boneId: CraftBone = 'preserved_rib'): CraftState {
  return {
    ...boneState(),
    pendingDesecration: { boneId, kind: 'suffix', ...(options ? { options } : {}) },
  }
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('合成数据缺失')
  return value
}
describe('骨骼规则与拒绝边界', () => {
  it('九材料按明确类别与64/40等级门禁，工艺可共存但不可二次亵渎', () => {
    expect(Object.keys(BONE_RULES)).toHaveLength(9)
    for (const [boneId, rule] of Object.entries(BONE_RULES)) {
      const allowed =
        rule.category === 'weapon'
          ? ['Bow', 'Quiver', 'Sceptre']
          : rule.category === 'armour'
            ? ['Helmet', 'Focus', 'Shield', 'Buckler']
            : ['Amulet', 'Ring', 'Belt']
      for (const type of allowed) {
        const catalog = boneCatalog(type)
        for (const level of [39, 40, 64, 65]) {
          expect(
            prepareDesecration(catalog, { ...boneState(), itemLevel: level }, boneId as CraftBone)
              .ok,
          ).toBe(
            (rule.maxItemLevel === null || level <= rule.maxItemLevel) && level >= rule.minModLevel,
          )
        }
      }
      expect(
        prepareDesecration(
          boneCatalog(rule.category === 'weapon' ? 'Ring' : 'Bow'),
          boneState(),
          boneId as CraftBone,
        ).ok,
      ).toBe(false)
    }
    for (const type of ['Charm', 'Jewel', 'Map'])
      expect(prepareDesecration(boneCatalog(type), boneState(), 'preserved_rib').ok).toBe(false)
    expect(
      prepareDesecration(
        boneCatalog(),
        {
          ...boneState(['prefix1']),
          affixes: [{ modId: 'prefix1', lines: ['prefix1 5'], crafted: true }],
        },
        'preserved_rib',
      ).ok,
    ).toBe(true)
    expect(prepareDesecration(boneCatalog(), pending(), 'preserved_rib').ok).toBe(false)
    expect(
      prepareDesecration(
        boneCatalog(),
        {
          ...boneState(['suffix1']),
          affixes: [{ modId: 'suffix1', lines: ['suffix1 5'], desecrated: true }],
        },
        'preserved_rib',
      ).ok,
    ).toBe(false)
    const untrusted = boneCatalog()
    untrusted._meta.sources = []
    expect(prepareDesecration(untrusted, boneState(), 'preserved_rib').ok).toBe(false)
  })
  it('pending严格形状、容量与深复制，不混入已揭示状态', () => {
    const catalog = boneCatalog()
    const input = pending(['suffix1', 'suffix2', 'exclusive1'])
    const checked = createCraftState(catalog, input)
    expect(checked.ok).toBe(true)
    if (checked.ok) {
      required(checked.value.pendingDesecration?.options)[0] = 'changed'
      expect(input.pendingDesecration?.options?.[0]).toBe('suffix1')
    }
    for (const value of [
      undefined,
      null,
      false,
      [],
      {},
      { boneId: 'future', kind: 'suffix' },
      { boneId: 'preserved_rib', kind: 'implicit' },
      { boneId: 'preserved_rib', kind: 'suffix', options: undefined },
      { boneId: 'preserved_rib', kind: 'suffix', options: [] },
      { boneId: 'preserved_rib', kind: 'suffix', options: ['suffix1', 'suffix1', 'suffix2'] },
      { boneId: 'preserved_rib', kind: 'suffix', extra: true },
    ]) {
      expect(
        createCraftState(catalog, { ...boneState(), pendingDesecration: value } as CraftState).ok,
      ).toBe(false)
    }
    expect(createCraftState(catalog, { ...pending(), rarity: 'magic' }).ok).toBe(false)
    expect(
      createCraftState(catalog, {
        ...pending(),
        affixes: [{ modId: 'prefix1', lines: ['prefix1 5'], desecrated: true }],
      }).ok,
    ).toBe(false)
  })
  it('Ancient按当前物等kind/group最高档回退，真实动态负tag/冲突/数值门禁不可绕过', () => {
    const catalog = boneCatalog()
    const low = required(catalog.modifiers.find((mod) => mod.id === 'suffix1'))
    catalog.modifiers.push(
      { ...low, id: 'family20', level: 20 },
      { ...low, id: 'family35', level: 35 },
      { ...low, id: 'family50', level: 50 },
      { ...low, id: 'family80', level: 80 },
      { ...low, id: 'unknown-capacity', group: 'capacity', lines: ['+1 Prefix Modifier allowed'] },
      {
        ...low,
        id: 'unknown-skill',
        group: 'skill',
        lines: ['Grants Skill: Level (1-20) Unknown'],
      },
    )
    const ancient = { ...pending(undefined, 'ancient_rib'), itemLevel: 40 }
    expect(
      desecrationCandidates(catalog, ancient)
        .filter((mod) => mod.group === low.group)
        .map((mod) => mod.id),
    ).toEqual(['family35'])
    expect(
      desecrationCandidates(catalog, { ...ancient, itemLevel: 60 })
        .filter((mod) => mod.group === low.group)
        .map((mod) => mod.id),
    ).toEqual(['family50'])
    const ids = desecrationCandidates(catalog, pending()).map((mod) => mod.id)
    expect(ids).toContain('exclusive1')
    expect(ids).toContain('suffix1')
    expect(ids).not.toContain('prefix1')
    expect(ids).not.toContain('unknown-capacity')
    expect(ids).not.toContain('unknown-skill')
    const blocker = required(catalog.modifiers.find((mod) => mod.id === 'prefix1'))
    blocker.addsTags = ['blocked']
    low.eligibility = [
      { tag: 'blocked', value: 0 },
      { tag: 'synthetic', value: 1 },
      { tag: 'default', value: 0 },
    ]
    expect(
      desecrationCandidates(catalog, {
        ...pending(),
        affixes: boneState(['prefix1']).affixes,
      }).some((mod) => mod.id === 'suffix1'),
    ).toBe(false)
    expect(
      desecrationCandidates(catalog, {
        ...pending(),
        affixes: boneState(['suffix1']).affixes,
      }).some((mod) => mod.group === low.group),
    ).toBe(false)
  })
  it('三项只限制不同ID，各自合法可同族，offer不可覆盖或被外部数组改写，完整值校验', () => {
    const catalog = boneCatalog()
    const low = required(catalog.modifiers.find((mod) => mod.id === 'suffix1'))
    catalog.modifiers.push(
      { ...low, id: 'same-family2', level: 2 },
      { ...low, id: 'same-family3', level: 3 },
    )
    const options = ['suffix1', 'same-family2', 'same-family3']
    const offered = applyBoneCraft(catalog, pending(), {
      kind: 'desecration-offer',
      modIds: options,
    })
    expect(offered.ok).toBe(true)
    if (!offered.ok) return
    options[0] = 'external'
    expect(offered.value.pendingDesecration?.options?.[0]).toBe('suffix1')
    expect(
      applyBoneCraft(catalog, offered.value, {
        kind: 'desecration-offer',
        modIds: ['suffix2', 'suffix3', 'suffix4'],
      }).ok,
    ).toBe(false)
    for (const values of [[], [0], [11], [1.1], [5, 5], [Number.NaN]]) {
      expect(
        applyBoneCraft(catalog, offered.value, {
          kind: 'desecration-reveal',
          modId: 'suffix1',
          values,
        }).ok,
      ).toBe(false)
    }
    expect(
      applyBoneCraft(catalog, offered.value, {
        kind: 'desecration-reveal',
        modId: 'suffix2',
        values: [5],
      }).ok,
    ).toBe(false)
    const result = applyBoneCraft(catalog, offered.value, {
      kind: 'desecration-reveal',
      modId: 'suffix1',
      values: [5],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(
        applyCraftOperation(catalog, result.value, {
          currency: 'divine',
          modIds: [],
          rolls: [{ modId: 'suffix1', values: [10] }],
        }),
      ).toMatchObject({ ok: true, value: { affixes: [{ desecrated: true }] } })
      expect(
        applyCraftOperation(catalog, result.value, {
          currency: 'annulment',
          modIds: [],
          removeModId: 'suffix1',
        }),
      ).toMatchObject({ ok: true, value: { affixes: [] } })
    }
    for (const modIds of [
      [],
      ['suffix1'],
      ['suffix1', 'suffix1', 'suffix2'],
      ['suffix1', 'suffix2', 'missing'],
    ])
      expect(applyBoneCraft(catalog, pending(), { kind: 'desecration-offer', modIds }).ok).toBe(
        false,
      )
    const tooFew = {
      ...catalog,
      modifiers: catalog.modifiers.filter((mod) => ['suffix1', 'suffix2'].includes(mod.id)),
    }
    expect(
      applyBoneCraft(tooFew, pending(), {
        kind: 'desecration-offer',
        modIds: ['suffix1', 'suffix2', 'suffix3'],
      }).ok,
    ).toBe(false)
  })
  it('所有直接加工入口与指导在pending期间关闭，容量和已有字段不被清空', () => {
    const catalog = boneCatalog()
    const state = pending()
    expect(craftCandidates(catalog, state)).toEqual([])
    expect(socketCandidates(catalog, state)).toEqual([])
    for (const result of [
      addCraftAffix(catalog, state, 'prefix1'),
      prepareCraftOperation(catalog, state, 'alchemy'),
      removableCraftAffixes(catalog, state, 'annulment'),
      applyCraftStep(catalog, state, { kind: 'socket', socketIndex: 0, augmentId: 'fake' }),
      analyzeEssenceTargets(catalog, state, ['suffix1']),
    ])
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining('请先完成亵渎揭示'),
      })
    expect(analyzeCraftTargets(catalog, state, ['suffix1'])).toMatchObject({
      ok: true,
      value: { steps: [] },
    })
    expect(planCraftTargetRoutes(catalog, state, ['suffix1']).ok).toBe(true)
    const offered = {
      ...state,
      pendingDesecration: {
        ...required(state.pendingDesecration),
        options: ['suffix1', 'suffix2', 'suffix3'],
      },
    } satisfies CraftState
    const diff = compareCraftStates(catalog, state, offered)
    expect(diff).toMatchObject({
      ok: true,
      value: {
        affixes: [],
        pendingDesecration: {
          before: { kind: 'suffix' },
          after: { options: ['suffix1', 'suffix2', 'suffix3'] },
        },
      },
    })
    expect(compareCraftStates(catalog, state, structuredClone(state))).toMatchObject({ ok: true })
    if (diff.ok) required(diff.value.pendingDesecration?.after?.options)[0] = 'changed'
    expect(offered.pendingDesecration.options[0]).toBe('suffix1')
  })
})
