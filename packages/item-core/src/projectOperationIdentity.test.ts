import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { prepareAlloyCraft } from './alloyCraft'
import { alloyTestFixture } from './alloyTestFixture'
import { boneCatalog, boneState } from './boneTestFixture'
import type { CraftCatalog } from './catalog'
import { catalog as primary } from './catalystTestFixture'
import { architectCandidates, corruptionCandidates } from './corruptionEnchantments'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { prepareEssenceCraft } from './essenceCraft'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { inspectNumericLines } from './numeric'
import { upgradeProjectOperationIdentity } from './projectOperationIdentity'
import type { CraftResult, CraftState } from './rehearsal'
import { socketCandidates } from './sockets'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

function semantic(state: CraftState): CraftState {
  const { nextAffixId: _, ...rest } = state
  return { ...rest, affixes: state.affixes.map(({ affixId: _, ...affix }) => affix) }
}

const catalog = { ...primary, alloys: alloyTestFixture() }
const ring: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [
    { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
    { modId: 'FireResist1', lines: ['+10% to Fire Resistance'] },
  ],
}

function migrate(catalog: CraftCatalog, before: CraftState, operation: CraftStep) {
  const input = structuredClone({ before, operation })
  const legacyAfter = must(applyCraftStep(catalog, semantic(before), operation))
  const result = must(upgradeProjectOperationIdentity(catalog, before, operation))
  expect(result.operation).not.toBe(operation)
  expect(semantic(result.afterState)).toEqual(legacyAfter)
  expect(must(applyCraftStep(catalog, before, result.operation))).toEqual(result.afterState)
  expect(upgradeProjectOperationIdentity(catalog, before, operation)).toEqual({
    ok: true,
    value: result,
  })
  expect({ before, operation }).toEqual(input)
  return result
}

describe('项目历史操作的实例身份补齐', () => {
  it('蜕变、增幅、崇高、双增崇高与点金重建按新增顺序绑定 rolls', () => {
    const local = boneCatalog()
    const cases: { state: CraftState; operation: CraftStep; ids: string[] }[] = [
      {
        state: { ...boneState(), rarity: 'normal' },
        operation: {
          currency: 'transmutation',
          modIds: ['prefix1'],
          rolls: [{ modId: 'prefix1', values: [7] }],
        },
        ids: ['a9'],
      },
      {
        state: { ...boneState(['prefix1']), rarity: 'magic' },
        operation: {
          currency: 'augmentation',
          modIds: ['suffix1'],
          rolls: [{ modId: 'suffix1', values: [7] }],
        },
        ids: ['a1', 'a9'],
      },
      {
        state: boneState(['prefix1']),
        operation: {
          currency: 'exalted',
          modIds: ['suffix1'],
          rolls: [{ modId: 'suffix1', values: [7] }],
        },
        ids: ['a1', 'a9'],
      },
      {
        state: boneState(['prefix1']),
        operation: {
          currency: 'exalted',
          omen: 'greater_exaltation',
          modIds: ['suffix1', 'prefix2'],
          rolls: [
            { modId: 'prefix2', values: [8] },
            { modId: 'suffix1', values: [7] },
          ],
        },
        ids: ['a1', 'a9', 'a10'],
      },
      {
        state: { ...boneState(['prefix1']), rarity: 'magic' },
        operation: {
          currency: 'alchemy',
          modIds: ['prefix1', 'suffix1', 'prefix2', 'suffix2'],
          rolls: [
            { modId: 'suffix2', values: [8] },
            { modId: 'prefix1', values: [7] },
            { modId: 'suffix1', values: [6] },
            { modId: 'prefix2', values: [5] },
          ],
        },
        ids: ['a9', 'a10', 'a11', 'a12'],
      },
    ]
    for (const entry of cases) {
      const before = { ...must(enableCraftAffixIdentity(local, entry.state)), nextAffixId: 9 }
      const result = migrate(local, before, entry.operation)
      expect(result.afterState.affixes.map((a) => a.affixId)).toEqual(entry.ids)
      if ('currency' in result.operation) {
        for (const roll of result.operation.rolls ?? []) {
          expect(roll.affixId).toBe(
            result.afterState.affixes.find((a) => a.modId === roll.modId)?.affixId,
          )
        }
      }
    }
  })

  it('新增 rolls 指向实际新实例，预演不重复消费游标', () => {
    const before = {
      ...must(enableCraftAffixIdentity(catalog, { ...ring, rarity: 'magic' })),
      nextAffixId: 9,
    }
    const result = migrate(catalog, before, {
      currency: 'regal',
      modIds: ['ColdResist1'],
      rolls: [{ modId: 'ColdResist1', values: [8] }],
    })
    expect(result.operation).toMatchObject({
      rolls: [{ modId: 'ColdResist1', affixId: 'a9', values: [8] }],
    })
    expect(result.afterState.nextAffixId).toBe(10)
    expect(result.afterState.affixes.map((a) => a.affixId)).toEqual(['a1', 'a2', 'a9'])
  })

  it('同类型混沌替换分别绑定旧移除实例和新 rolls 实例', () => {
    const before = { ...must(enableCraftAffixIdentity(catalog, ring)), nextAffixId: 9 }
    const result = migrate(catalog, before, {
      currency: 'chaos',
      modIds: ['IncreasedLife1'],
      removeModId: 'IncreasedLife1',
      rolls: [{ modId: 'IncreasedLife1', values: [10] }],
    })
    expect(result.operation).toMatchObject({ removeAffixId: 'a1', rolls: [{ affixId: 'a9' }] })
    expect(result.afterState.nextAffixId).toBe(10)
    const removed = migrate(catalog, result.afterState, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'IncreasedLife1',
    })
    expect(removed.operation).toHaveProperty('removeAffixId', 'a9')
    expect(removed.afterState.affixes.map((a) => a.affixId)).toEqual(['a2'])
    expect(removed.afterState.nextAffixId).toBe(10)
  })

  it('神圣与破裂绑定既有实例且不分配新 ID', () => {
    const local = boneCatalog()
    const before = {
      ...must(
        enableCraftAffixIdentity(local, boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])),
      ),
      nextAffixId: 9,
    }
    const divine = migrate(local, before, {
      currency: 'divine',
      modIds: [],
      rolls: before.affixes.map((a) => ({ modId: a.modId, values: [7] })),
    })
    expect(divine.operation).toMatchObject({
      rolls: before.affixes.map((a) => ({ affixId: a.affixId })),
    })
    const fracture = migrate(local, before, { kind: 'fracture', modId: 'suffix1' })
    expect(fracture.operation).toEqual({ kind: 'fracture', modId: 'suffix1', affixId: 'a3' })
    expect(divine.afterState.nextAffixId).toBe(9)
    expect(fracture.afterState.nextAffixId).toBe(9)
  })

  it('保证制作的升级与替换保留旧实例并只分配一次', () => {
    const perfect = 'Metadata/Items/Currency/CurrencyPerfectEssenceMana'
    const lesser = 'Metadata/Items/Currency/CurrencyLesserEssenceMana'
    const alloy = 'Metadata/Items/Currency/CurrencyVerisiumAlloy1'
    const emotion = 'Metadata/Items/Currency/DistilledEmotion1'
    const magic: CraftState = { ...ring, rarity: 'magic' }
    const jewel: CraftState = {
      ...ring,
      baseId: 'Ruby',
      affixes: [{ modId: 'JewelFireDamage', lines: ['10% increased Fire Damage'] }],
    }
    const min = (lines: string[]) => must(inspectNumericLines(lines)).map((range) => range.min)
    const cases: { state: CraftState; operation: CraftStep; removes: boolean }[] = [
      {
        state: magic,
        operation: {
          kind: 'essence',
          essenceId: lesser,
          values: min(must(prepareEssenceCraft(catalog, magic, lesser)).mod.lines),
        },
        removes: false,
      },
      {
        state: ring,
        operation: {
          kind: 'essence',
          essenceId: perfect,
          removeModId: 'IncreasedLife1',
          values: min(must(prepareEssenceCraft(catalog, ring, perfect)).mod.lines),
        },
        removes: true,
      },
      {
        state: ring,
        operation: {
          kind: 'alloy',
          alloyId: alloy,
          removeModId: 'IncreasedLife1',
          values: min(must(prepareAlloyCraft(catalog, ring, alloy)).mod.lines),
        },
        removes: true,
      },
      {
        state: jewel,
        operation: {
          kind: 'liquid-emotion',
          emotionId: emotion,
          removeModId: 'JewelFireDamage',
          values: min(must(prepareLiquidEmotionCraft(catalog, jewel, emotion)).mod.lines),
        },
        removes: true,
      },
    ]
    for (const entry of cases) {
      const before = { ...must(enableCraftAffixIdentity(catalog, entry.state)), nextAffixId: 9 }
      const result = migrate(catalog, before, entry.operation)
      if (entry.removes) expect(result.operation).toHaveProperty('removeAffixId', 'a1')
      else expect(result.operation).not.toHaveProperty('removeAffixId')
      expect(result.afterState.affixes.at(-1)).toHaveProperty('affixId', 'a9')
      expect(result.afterState.nextAffixId).toBe(10)
    }
  })

  it('亵渎删除、占位、候选、重掷、揭示按真实时点分配', () => {
    const local = boneCatalog()
    let current: CraftState = {
      ...must(
        enableCraftAffixIdentity(
          local,
          boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3']),
        ),
      ),
      nextAffixId: 9,
    }
    const steps: CraftStep[] = [
      { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix', removeModId: 'suffix2' },
      {
        kind: 'desecration-offer',
        modIds: ['suffix2', 'suffix4', 'exclusive1'],
        revealOmen: 'abyssal_echoes',
      },
      { kind: 'desecration-reroll', modIds: ['exclusive1', 'exclusive2', 'exclusive3'] },
      { kind: 'desecration-reveal', modId: 'exclusive1', values: [7] },
    ]
    for (const [index, step] of steps.entries()) {
      const result = migrate(local, current, step)
      if (index === 0) expect(result.operation).toHaveProperty('removeAffixId', 'a5')
      expect(result.afterState.nextAffixId).toBe(index === 3 ? 10 : 9)
      current = result.afterState
    }
    expect(current.affixes.at(-1)).toMatchObject({ affixId: 'a9', desecrated: true })
  })

  it('瓦尔后续替换可以移除上次新生实例，包括回到原类型', () => {
    const before = {
      ...must(enableCraftAffixIdentity(catalog, { ...ring, rarity: 'magic' })),
      nextAffixId: 9,
    }
    const result = migrate(catalog, before, {
      kind: 'vaal',
      outcome: 'reroll',
      replacements: [
        { removeModId: 'IncreasedLife1', modId: 'IncreasedLife2', values: [25] },
        { removeModId: 'IncreasedLife2', modId: 'IncreasedLife1', values: [10] },
        { removeModId: 'IncreasedLife1', modId: 'IncreasedLife3', values: [35] },
      ],
    })
    expect(result.operation).toMatchObject({
      replacements: [{ removeAffixId: 'a1' }, { removeAffixId: 'a9' }, { removeAffixId: 'a10' }],
    })
    expect(result.afterState.nextAffixId).toBe(12)
    expect(result.afterState.affixes.at(-1)).toHaveProperty('affixId', 'a11')
  })

  it('打孔、镶嵌、瓦尔无变化和建筑师摧毁透传操作并保留身份', () => {
    const local = boneCatalog()
    const before = must(enableCraftAffixIdentity(local, boneState(['prefix1'])))
    const punched = migrate(local, before, { kind: 'artificer' }).afterState
    expect(punched.nextAffixId).toBe(before.nextAffixId)
    const helmetBase = catalog.bases.find(
      (base) => base.type === 'Helmet' && (base.socketLimit ?? 0) > 0,
    )
    if (!helmetBase) throw Error('缺少头盔目录夹具')
    const helmet = must(
      enableCraftAffixIdentity(catalog, {
        baseId: helmetBase.id,
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
        sockets: [null],
      }),
    )
    const augment = socketCandidates(catalog, helmet)[0]
    if (!augment) throw Error('缺少镶嵌候选')
    migrate(catalog, helmet, { kind: 'socket', socketIndex: 0, augmentId: augment.id })
    const corrupted = migrate(local, before, { kind: 'vaal', outcome: 'unchanged' }).afterState
    expect(
      migrate(local, corrupted, { kind: 'architect', outcome: 'destroy' }).afterState.destroyed,
    ).toBe(true)
  })

  it('瓦尔加孔与两层腐化属性不获得显式词缀身份', () => {
    const before = must(
      enableCraftAffixIdentity(catalog, {
        baseId: 'Crude Bow',
        itemLevel: 86,
        rarity: 'normal',
        sourceText: null,
        affixes: [],
        sockets: [],
      }),
    )
    expect(
      migrate(catalog, before, { kind: 'vaal', outcome: 'socket' }).afterState.sockets,
    ).toEqual([null])
    const first = corruptionCandidates(catalog, before)[0]
    if (!first) throw Error('缺少腐化目录夹具')
    const values = (lines: string[]) => must(inspectNumericLines(lines)).map((range) => range.min)
    const enchanted = migrate(catalog, before, {
      kind: 'vaal',
      outcome: 'enchant',
      modId: first.id,
      values: values(first.lines),
    }).afterState
    const second = architectCandidates(catalog, enchanted)[0]
    if (!second) throw Error('缺少建筑师目录夹具')
    const twice = migrate(catalog, enchanted, {
      kind: 'architect',
      outcome: 'enchant',
      modId: second.id,
      values: values(second.lines),
    }).afterState
    expect(twice.corruption).not.toHaveProperty('affixId')
    expect(twice.secondCorruption).not.toHaveProperty('affixId')
    expect(twice.nextAffixId).toBe(1)
  })

  it('拒绝已含身份的旧操作、显式 undefined 和非法输入，不修复已有 selector', () => {
    const before = must(enableCraftAffixIdentity(catalog, ring))
    const invalid: CraftStep[] = [
      { currency: 'annulment', modIds: [], removeModId: 'IncreasedLife1', removeAffixId: 'a1' },
      {
        currency: 'divine',
        modIds: [],
        rolls: [{ modId: 'IncreasedLife1', affixId: 'a1', values: [10] }],
      },
      { kind: 'fracture', modId: 'IncreasedLife1', affixId: 'a1' },
      {
        kind: 'vaal',
        outcome: 'reroll',
        replacements: [
          {
            removeModId: 'IncreasedLife1',
            removeAffixId: 'a1',
            modId: 'IncreasedLife2',
            values: [25],
          },
        ],
      },
      { currency: 'annulment', modIds: [], removeModId: 'missing' },
    ]
    for (const operation of invalid)
      expect(upgradeProjectOperationIdentity(catalog, before, operation).ok).toBe(false)
    const operation: CraftStep = {
      currency: 'annulment',
      modIds: [],
      removeModId: 'IncreasedLife1',
    }
    for (const patch of [
      { removeAffixId: undefined },
      { rolls: undefined },
      { extra: true },
      { nextAffixId: 9 },
    ]) {
      expect(
        upgradeProjectOperationIdentity(catalog, before, Object.assign({}, operation, patch)).ok,
      ).toBe(false)
    }
    expect(upgradeProjectOperationIdentity(catalog, ring, operation).ok).toBe(false)
    expect(
      upgradeProjectOperationIdentity(catalog, { ...before, nextAffixId: 1 }, operation).ok,
    ).toBe(false)
  })
})
