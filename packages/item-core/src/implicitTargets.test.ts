import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog } from './boneTestFixture'
import { implicitTargetFixture } from './implicitTargetFixture'
import {
  analyzeCraftImplicitTargets,
  craftImplicitTargetCandidates,
  implicitTargetRolls,
  validateCraftImplicitTargets,
} from './implicitTargets'
import { applyCraftOperation, type CraftState } from './rehearsal'

it('目录行身份不随原文倒序改变，腰带操作数值按有效行顺序', () => {
  const { catalog, state } = implicitTargetFixture()
  state.implicitLines.reverse()
  const goals = [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }] }]
  expect(craftImplicitTargetCandidates(catalog, state)).toMatchObject({
    ok: true,
    value: [
      { lineIndex: 0, actual: [15] },
      { lineIndex: 1, actual: [1], ranges: [{ min: 1, max: 3 }] },
    ],
  })
  expect(implicitTargetRolls(catalog, state, goals)).toEqual({ ok: true, value: [2, 15] })
})
it('普通负数/小数/多范围目标按目录行与行内索引映射，原文可倒序', () => {
  const catalog = boneCatalog('Ring')
  required(catalog.bases[0]).implicit = '-(0.1-0.3) cost\nAdds (1-4) to (8-12) damage'
  const state: CraftState = {
    baseId: 'Synthetic Base',
    itemLevel: 80,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    implicitLines: ['Adds 2(1-4) to 9(8-12) damage', '-0.2(-0.3--0.1) cost'],
  }
  const goals = [
    { lineIndex: 0, bounds: [{ index: 0, min: -0.15 }] },
    { lineIndex: 1, bounds: [{ index: 1, min: 10 }] },
  ]
  expect(craftImplicitTargetCandidates(catalog, state)).toMatchObject({
    ok: true,
    value: [
      { lineIndex: 0, actual: [-0.2] },
      { lineIndex: 1, actual: [2, 9] },
    ],
  })
  const rolls = implicitTargetRolls(catalog, state, goals)
  expect(rolls).toEqual({ ok: true, value: [-0.1, 2, 10] })
  if (rolls.ok) {
    const next = applyCraftOperation(catalog, state, {
      currency: 'divine',
      modIds: [],
      rolls: [],
      implicitValues: rolls.value,
    })
    expect(next.ok).toBe(true)
    if (next.ok)
      expect(analyzeCraftImplicitTargets(catalog, next.value, goals)).toMatchObject({
        ok: true,
        value: [{ matched: true }, { matched: true }],
      })
  }
  const impossible = [{ lineIndex: 0, bounds: [{ index: 0, min: -0.19, max: -0.11 }] }]
  expect(validateCraftImplicitTargets(catalog, state.baseId, impossible).ok).toBe(true)
  expect(implicitTargetRolls(catalog, state, impossible).ok).toBe(false)
})
it('未知实值不猜；重复同形导致目录身份歧义时明确拒绝', () => {
  const { catalog, state, base } = implicitTargetFixture()
  state.implicitLines[0] = '(10-20)% increased Flask Charges gained'
  expect(craftImplicitTargetCandidates(catalog, state)).toMatchObject({
    ok: true,
    value: expect.arrayContaining([expect.objectContaining({ actual: [null] })]),
  })
  base.implicit =
    '(10-20)% increased Flask Charges gained\n(10-20)% increased Flask Charges gained\nHas (1-3) Charm Slot'
  state.implicitLines = [
    '12(10-20)% increased Flask Charges gained',
    '15(10-20)% increased Flask Charges gained',
    'Has 1(1-2) Charm Slot',
  ]
  expect(craftImplicitTargetCandidates(catalog, state)).toMatchObject({
    ok: false,
    error: expect.stringContaining('歧义'),
  })
})
it('带技能的其他普通行仍可跟踪，但全件神圣门禁保持', () => {
  const catalog = boneCatalog('Sceptre')
  required(catalog.bases[0]).implicit =
    'Grants Skill: Level (1-20) Synthetic Skill\n+(10-20) to maximum Mana'
  const state: CraftState = {
    baseId: 'Synthetic Base',
    itemLevel: 80,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    implicitLines: ['Grants Skill: Level 5 Synthetic Skill', '+15(10-20) to maximum Mana'],
  }
  expect(craftImplicitTargetCandidates(catalog, state)).toMatchObject({
    ok: true,
    value: [
      { lineIndex: 0, kind: 'granted-skill', actual: [null], rerollable: false },
      { lineIndex: 0, kind: 'granted-skill-sockets', actual: [null], rerollable: false },
      { lineIndex: 1, actual: [15], rerollable: false },
    ],
  })
  expect(
    validateCraftImplicitTargets(catalog, state.baseId, [
      { lineIndex: 0, bounds: [{ index: 0, min: 10 }] },
    ]).ok,
  ).toBe(false)
})
it('固有条件严格字段、唯一索引、有限范围，返回深复制', () => {
  const { catalog, state } = implicitTargetFixture()
  const valid = [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }] }]
  for (const values of [
    null,
    {},
    [{ lineIndex: 1, bounds: [] }],
    [{ lineIndex: 1, bounds: [{ index: 0 }] }],
    [...valid, ...valid],
    [
      {
        lineIndex: 1,
        bounds: [
          { index: 0, min: 2 },
          { index: 0, max: 3 },
        ],
      },
    ],
    [{ lineIndex: 1, bounds: [{ index: 1, min: 2 }] }],
    [{ lineIndex: 1, bounds: [{ index: 0, min: 0 }] }],
    [{ lineIndex: 1, bounds: [{ index: 0, min: NaN }] }],
    [{ lineIndex: 1, bounds: [{ index: 0, max: Infinity }] }],
    [{ lineIndex: 1, bounds: [{ index: 0, min: 3, max: 2 }] }],
    [{ lineIndex: 1, bounds: [{ index: 0, min: 2, unknown: 1 }] }],
    [{ lineIndex: 1, bounds: [{ index: 0, min: undefined }] }],
  ])
    expect(validateCraftImplicitTargets(catalog, state.baseId, values).ok).toBe(false)
  const checked = validateCraftImplicitTargets(catalog, state.baseId, valid)
  expect(checked.ok).toBe(true)
  if (checked.ok) required(required(checked.value[0]).bounds[0]).min = 1
  expect(valid[0]?.bounds[0]?.min).toBe(2)
})

it('目录阈值与当前腰带范围分离，固定栏和plain实值可核对但不伪造重掷', () => {
  const { catalog, state, base } = implicitTargetFixture()
  const impossible = [{ lineIndex: 1, bounds: [{ index: 0, min: 3 }] }]
  expect(validateCraftImplicitTargets(catalog, state.baseId, impossible).ok).toBe(true)
  expect(analyzeCraftImplicitTargets(catalog, state, impossible)).toMatchObject({
    ok: true,
    value: [
      {
        matched: false,
        reasons: expect.arrayContaining([
          '当前咒符栏范围为1–2。',
          '当前可重掷范围或显示网格不能达到该固有条件。',
        ]),
      },
    ],
  })
  const plain = {
    ...state,
    sourceText: 'source',
    implicitLines: ['15(10-20)% increased Flask Charges gained', 'Has 2 Charm Slot'],
  }
  expect(
    analyzeCraftImplicitTargets(catalog, plain, [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }] }]),
  ).toMatchObject({ ok: true, value: [{ matched: true }] })
  expect(craftImplicitTargetCandidates(catalog, plain)).toMatchObject({
    ok: true,
    value: [{ rerollable: false }, { actual: [2], rerollable: false }],
  })
  base.implicit = '(10-20)% increased Flask Charges gained\nHas 1 Charm Slot'
  plain.implicitLines[1] = 'Has 1 Charm Slot'
  expect(craftImplicitTargetCandidates(catalog, plain)).toMatchObject({
    ok: true,
    value: [
      { lineIndex: 0 },
      { lineIndex: 1, ranges: [{ index: 0, min: 1, max: 1 }], actual: [1], rerollable: false },
    ],
  })
  expect(
    validateCraftImplicitTargets(catalog, state.baseId, [
      { lineIndex: 1, bounds: [{ index: 0, min: 2 }] },
    ]).ok,
  ).toBe(false)
})

it('整体32范围条件限制且任意常量不成为目标', () => {
  const catalog = boneCatalog('Ring')
  required(catalog.bases[0]).implicit =
    `${Array.from({ length: 33 }, (_, index) => `Line ${index} (1-3)`).join('\n')}\nHas 5 Constant`
  const values = Array.from({ length: 33 }, (_, lineIndex) => ({
    lineIndex,
    bounds: [{ index: 0, min: 2 }],
  }))
  expect(validateCraftImplicitTargets(catalog, 'Synthetic Base', values.slice(0, 32)).ok).toBe(true)
  expect(validateCraftImplicitTargets(catalog, 'Synthetic Base', values).ok).toBe(false)
  expect(
    validateCraftImplicitTargets(catalog, 'Synthetic Base', [
      { lineIndex: 33, bounds: [{ index: 0, min: 5 }] },
    ]).ok,
  ).toBe(false)
})
