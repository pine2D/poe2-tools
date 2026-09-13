import { expect, it } from 'vitest'
import { applyCraftStep } from './craftSteps'
import {
  type CraftStrategy,
  type CraftStrategyAction,
  evaluateCraftStrategy,
  readCraftStrategy,
} from './craftStrategy'
import { boneState, essenceId, perfectEssenceId, specialCatalog } from './specialStrategyFixture'

const single = (action: CraftStrategyAction): CraftStrategy => ({
  maxSteps: 20,
  rules: [{ conditions: [{ kind: 'always' }], action }],
})
it('精华规则使用保证属性及预兆合法性，已有工艺或错误稀有度阻塞', () => {
  const source = specialCatalog()
  const action: CraftStrategyAction = { kind: 'essence', essenceId }
  expect(
    evaluateCraftStrategy(
      source,
      { ...boneState(['prefix1']), rarity: 'magic' },
      single(action),
      0,
    ),
  ).toMatchObject({ ok: true, value: { kind: 'action', action } })
  expect(evaluateCraftStrategy(source, boneState(['prefix1']), single(action), 0)).toMatchObject({
    ok: true,
    value: { kind: 'blocked' },
  })
  expect(
    evaluateCraftStrategy(
      source,
      boneState(['prefix1', 'suffix1']),
      single({ kind: 'essence', essenceId: perfectEssenceId, omen: 'dextral_crystallisation' }),
      0,
    ),
  ).toMatchObject({ ok: true, value: { kind: 'action' } })
  expect(
    readCraftStrategy(single({ kind: 'essence', essenceId, omen: 'dextral_crystallisation' })).ok,
  ).toBe(false)
})
it('骨骼施加、首组三项、揭示后按阶段重新匹配，并保留完整材料操作', () => {
  const source = specialCatalog()
  const strategy: CraftStrategy = {
    maxSteps: 20,
    rules: [
      { conditions: [{ kind: 'targets-met', value: true }], action: { kind: 'stop' } },
      {
        conditions: [{ kind: 'desecration-stage', value: 'unrevealed' }],
        action: { kind: 'reveal' },
      },
      { conditions: [{ kind: 'desecration-stage', value: 'offered' }], action: { kind: 'reveal' } },
      {
        conditions: [{ kind: 'desecration-stage', value: 'none' }],
        action: { kind: 'desecrate', boneId: 'preserved_rib', directionOmen: 'dextral_necromancy' },
      },
    ],
  }
  let s = boneState()
  const goals = { targetModIds: ['exclusive1'] }
  for (const [index, operation] of [
    {
      kind: 'desecrate',
      boneId: 'preserved_rib',
      affixKind: 'suffix',
      directionOmen: 'dextral_necromancy',
    },
    { kind: 'desecration-offer', modIds: ['exclusive1', 'exclusive2', 'exclusive3'] },
    { kind: 'desecration-reveal', modId: 'exclusive1', values: [7] },
  ].entries()) {
    expect(evaluateCraftStrategy(source, s, strategy, index, goals)).toMatchObject({
      ok: true,
      value: { kind: 'action', ruleIndex: [3, 1, 2][index] },
    })
    const applied = applyCraftStep(source, s, operation as Parameters<typeof applyCraftStep>[2])
    if (!applied.ok) throw Error(applied.error)
    s = applied.value
  }
  expect(evaluateCraftStrategy(source, s, strategy, 3, goals)).toMatchObject({
    ok: true,
    value: { kind: 'stop', ruleIndex: 0 },
  })
})
it('亵渎占位计入词缀数及空位，允许已有支持的待揭示破裂，但不误报目标完成', () => {
  const source = specialCatalog()
  const applied = applyCraftStep(source, boneState(['prefix1', 'prefix2', 'suffix1']), {
    kind: 'desecrate',
    boneId: 'preserved_rib',
    affixKind: 'prefix',
  })
  if (!applied.ok) throw Error(applied.error)
  const s = applied.value
  const strategy: CraftStrategy = {
    maxSteps: 20,
    rules: [
      { conditions: [{ kind: 'targets-met', value: true }], action: { kind: 'stop' } },
      { conditions: [{ kind: 'open-prefix', min: 1 }], action: { kind: 'stop' } },
      { conditions: [{ kind: 'affix-count', min: 4 }], action: { kind: 'fracture' } },
    ],
  }
  expect(
    evaluateCraftStrategy(source, s, strategy, 1, { targetModIds: ['prefix1'] }),
  ).toMatchObject({
    ok: true,
    value: { kind: 'action', ruleIndex: 2, action: { kind: 'fracture' } },
  })
  expect(evaluateCraftStrategy(source, s, { ...strategy, maxSteps: 1 }, 1)).toMatchObject({
    ok: true,
    value: { kind: 'stop', reason: 'step-limit' },
  })
})
it('无候选、未知材料、非法结构不能开始特殊步骤', () => {
  const source = specialCatalog()
  expect(evaluateCraftStrategy(source, boneState(), single({ kind: 'reveal' }), 0)).toMatchObject({
    ok: true,
    value: { kind: 'blocked' },
  })
  expect(
    evaluateCraftStrategy(source, boneState(['prefix1']), single({ kind: 'fracture' }), 0),
  ).toMatchObject({ ok: true, value: { kind: 'blocked' } })
  const unknown = single({
    kind: 'essence',
    essenceId: 'Metadata/Items/Currency/CurrencyLesserEssenceUnknown',
  })
  expect(
    evaluateCraftStrategy(source, { ...boneState(), rarity: 'magic' }, unknown, 0),
  ).toMatchObject({ ok: true, value: { kind: 'blocked' } })
  for (const action of [
    { kind: 'reveal', omen: 'light' },
    { kind: 'fracture', modId: 'prefix1' },
    { kind: 'desecrate', boneId: 'preserved_rib', lichOmen: 'liege' },
    { kind: 'desecrate', boneId: 'bad' },
    { kind: 'essence', essenceId, omen: undefined },
  ])
    expect(readCraftStrategy(single(action as CraftStrategyAction)).ok).toBe(false)
})

it('新增阶段与计数条件拒绝未知状态、多余字段和越界值', () => {
  for (const condition of [
    { kind: 'affix-count', min: -1 },
    { kind: 'affix-count', min: 7 },
    { kind: 'affix-count', min: 1.5 },
    { kind: 'desecration-stage', value: 'revealed' },
    { kind: 'desecration-stage', value: 'none', min: 1 },
  ])
    expect(
      readCraftStrategy({
        maxSteps: 20,
        rules: [{ conditions: [condition], action: { kind: 'stop' } }],
      }).ok,
    ).toBe(false)
})
