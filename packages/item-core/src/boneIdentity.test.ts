import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { collectDesecrationCandidates } from './boneCandidates'
import { applyBoneCraft, desecrationCandidates, prepareDesecration } from './boneCraft'
import type { BoneCraftOperation } from './boneRules'
import { boneCatalog, boneState } from './boneTestFixture'
import type { CraftCatalog } from './catalog'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('亵渎词缀实例迁移', () => {
  it('真实目录候选与 legacy 相同，每项从原游标独立预演且不修改输入', () => {
    const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
    const state: CraftState = {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'rare',
      affixes: [
        { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
        { modId: 'FireResist1', lines: ['+10% to Fire Resistance'] },
      ],
      sourceText: null,
      sockets: [],
      pendingDesecration: { boneId: 'preserved_collarbone', kind: 'prefix' },
    }
    const identified = value(enableCraftAffixIdentity(catalog, state))
    const before = structuredClone(identified)
    const legacyPool = desecrationCandidates(catalog, state).map((mod) => mod.id)
    expect(legacyPool.length).toBeGreaterThan(3)
    expect(desecrationCandidates(catalog, identified).map((mod) => mod.id)).toEqual(legacyPool)
    const previews: CraftState[] = []
    collectDesecrationCandidates(catalog, identified, (next) => {
      previews.push(next)
      return createCraftState(catalog, next).ok
    })
    expect(previews.length).toBeGreaterThan(3)
    for (const preview of previews) {
      expect(preview.nextAffixId).toBe(4)
      expect(preview.affixes.map((affix) => affix.affixId)).toEqual(['a1', 'a2', 'a3'])
      expect(preview).not.toHaveProperty('pendingDesecration')
    }
    expect(identified).toEqual(before)
  })

  it('定向和巫妖 pending 可启用身份并重新校验，移除预演保留正确实例', () => {
    const catalog = boneCatalog('Ring')
    const config = { directionOmen: 'dextral_necromancy', lichOmen: 'liege' } as const
    const state = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
    const identified = value(enableCraftAffixIdentity(catalog, state))
    const prepared = value(prepareDesecration(catalog, identified, 'preserved_collarbone', config))
    expect(prepared.kinds).toEqual(['suffix'])
    expect(prepared.removableAffixes.map((affix) => affix.affixId)).toEqual(['a4', 'a5', 'a6'])
    const pending = value(
      applyBoneCraft(catalog, state, {
        kind: 'desecrate',
        boneId: 'preserved_collarbone',
        affixKind: 'suffix',
        removeModId: 'suffix2',
        ...config,
      }),
    )
    const enabled = value(enableCraftAffixIdentity(catalog, pending))
    expect(createCraftState(catalog, enabled).ok).toBe(true)
    expect(enabled.nextAffixId).toBe(6)
    expect(desecrationCandidates(catalog, enabled).map((mod) => mod.id)).toEqual([
      'exclusive1',
      'exclusive2',
      'exclusive3',
    ])
  })

  it('满容量按 ID 删除单个实例并保留游标，错误类型断言、未知 ID 和破裂目标拒绝', () => {
    const catalog = boneCatalog()
    const state = value(
      enableCraftAffixIdentity(
        catalog,
        boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3']),
      ),
    )
    const fractured = state.affixes[3]
    if (!fractured) throw new Error('合成夹具缺少破裂目标')
    fractured.fractured = true
    const before = structuredClone(state)
    const step = {
      kind: 'desecrate',
      boneId: 'preserved_rib',
      affixKind: 'suffix',
      removeModId: 'suffix2',
      removeAffixId: 'a5',
    } as const
    const result = value(applyBoneCraft(catalog, state, step))
    expect(result.affixes.map((affix) => affix.affixId)).toEqual(['a1', 'a2', 'a3', 'a4', 'a6'])
    expect(result.nextAffixId).toBe(7)
    expect(result.affixes).toEqual(state.affixes.filter((_, index) => index !== 4))
    expect(applyBoneCraft(catalog, state, { ...step, removeAffixId: 'a4' }).ok).toBe(false)
    expect(applyBoneCraft(catalog, state, { ...step, removeAffixId: 'a99' }).ok).toBe(false)
    expect(
      applyBoneCraft(catalog, state, {
        ...step,
        removeModId: 'suffix1',
        removeAffixId: 'a4',
      }).ok,
    ).toBe(false)
    expect(
      applyBoneCraft(catalog, state, {
        ...step,
        removeModId: 'prefix1',
        removeAffixId: 'a1',
      }).ok,
    ).toBe(false)
    expect(state).toEqual(before)
  })

  it.each([false, true])(
    '有空位拒绝所有 removal 字段，包括显式 undefined（身份=%s）',
    (identified) => {
      const catalog = boneCatalog()
      const initial = boneState(['suffix1'])
      const state = identified ? value(enableCraftAffixIdentity(catalog, initial)) : initial
      const step = { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' } as const
      for (const selector of [
        { removeModId: 'suffix1' },
        { removeModId: undefined },
        { removeAffixId: 'a1' },
        { removeAffixId: undefined },
        { removeModId: 'suffix1', removeAffixId: 'a1' },
      ]) {
        expect(
          applyBoneCraft(catalog, state, { ...step, ...selector } as BoneCraftOperation).ok,
        ).toBe(false)
      }
    },
  )

  it.each([false, true])(
    'pending、offer、reroll 不分配，揭示确定性分配一次且取消不消费（身份=%s）',
    (identified) => {
      const catalog = boneCatalog()
      const initial = boneState(['prefix1'])
      const state = identified ? value(enableCraftAffixIdentity(catalog, initial)) : initial
      const before = structuredClone(state)
      const pending = value(
        applyBoneCraft(catalog, state, {
          kind: 'desecrate',
          boneId: 'preserved_rib',
          affixKind: 'suffix',
        }),
      )
      const offered = value(
        applyBoneCraft(catalog, pending, {
          kind: 'desecration-offer',
          modIds: ['suffix1', 'suffix2', 'suffix3'],
          revealOmen: 'abyssal_echoes',
        }),
      )
      const rerolled = value(
        applyBoneCraft(catalog, offered, {
          kind: 'desecration-reroll',
          modIds: ['exclusive1', 'exclusive2', 'exclusive3'],
        }),
      )
      for (const snapshot of [pending, offered, rerolled]) {
        expect(snapshot.affixes).toEqual(state.affixes)
        expect(snapshot.nextAffixId).toBe(identified ? 2 : undefined)
      }
      const rerolledBefore = structuredClone(rerolled)
      const reveal = { kind: 'desecration-reveal', modId: 'exclusive1', values: [7] } as const
      const operation: BoneCraftOperation = { ...reveal, values: [...reveal.values] }
      expect(applyBoneCraft(catalog, rerolled, { ...operation, values: [11] }).ok).toBe(false)
      const result = value(applyBoneCraft(catalog, rerolled, operation))
      expect(result).toEqual(value(applyBoneCraft(catalog, rerolled, operation)))
      expect(result).toEqual({
        ...state,
        ...(identified ? { nextAffixId: 3 } : {}),
        affixes: [
          ...state.affixes,
          {
            modId: 'exclusive1',
            lines: ['exclusive1 7(1-10)'],
            desecrated: true,
            ...(identified ? { affixId: 'a2' } : {}),
          },
        ],
      })
      expect(rerolled).toEqual(rerolledBefore)
      expect(state).toEqual(before)
      if (!identified) expect(JSON.stringify(result)).not.toMatch(/affixId|nextAffixId/)
      const retained = result.affixes[0]
      if (!retained) throw new Error('结果缺少保留词缀')
      retained.lines.push('修改结果不影响快照')
      expect(rerolled).toEqual(rerolledBefore)
    },
  )
})
