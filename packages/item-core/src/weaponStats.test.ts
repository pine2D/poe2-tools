import { describe, expect, it } from 'vitest'
import type { CatalogBase, CatalogMod, CraftCatalog } from './catalog'
import * as api from './index'
import type { CraftState } from './rehearsal'

const base: CatalogBase = {
  id: 'bow',
  name: 'Test',
  type: 'Crossbow',
  tags: ['default', 'weapon', 'twohand'],
  requirements: {},
  properties: {
    PhysicalMin: 10,
    PhysicalMax: 20,
    FireMin: 3,
    FireMax: 7,
    AttackRateBase: 1.5,
    CritChanceBase: 5,
    ReloadTimeBase: 0.8,
  },
  implicit: null,
  implicitTags: [],
  sourceQuality: 20,
  socketLimit: 2,
  hidden: false,
  runeforged: false,
}
function mod(group: string, lines: string[], kind: 'prefix' | 'suffix' = 'prefix'): CatalogMod {
  return {
    id: group,
    group,
    lines,
    kind,
    name: group,
    level: 1,
    statOrder: [],
    tags: [],
    addsTags: [],
    eligibility: [{ tag: 'default', value: 1 }],
    tradeHashes: {},
  }
}
const mods = [
  mod('LocalPhysicalDamage', ['Adds (5-8) to (10-15) Physical Damage']),
  mod('LocalPhysicalDamagePercent', ['(100-120)% increased Physical Damage']),
  mod('LocalIncreasedAttackSpeed', ['(20-25)% increased Attack Speed'], 'suffix'),
  mod('LocalBaseCriticalStrikeChance', ['+(1.51-2.1)% to Critical Hit Chance'], 'suffix'),
]
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'test',
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [
      { path: 'src/Data/ModRunes.lua', url: 'https://example.test/runes', sha256: 'a'.repeat(64) },
    ],
    excludedBases: [],
  },
  bases: [base],
  modifiers: mods,
  augments: [
    {
      id: 'iron',
      name: 'Iron Rune',
      category: 'weapon',
      type: 'Rune',
      localMod: true,
      lines: ['16% increased Physical Damage'],
      statOrder: [],
      tradeHashes: {},
      levelReq: 0,
    },
    {
      id: 'fire',
      name: 'Desert Rune',
      category: 'weapon',
      type: 'Rune',
      localMod: true,
      lines: ['Adds 7 to 11 Fire Damage'],
      statOrder: [],
      tradeHashes: {},
      levelReq: 0,
    },
  ],
}
const state: CraftState = {
  baseId: 'bow',
  itemLevel: 80,
  rarity: 'rare',
  affixes: mods.map((m, i) => ({
    modId: m.id,
    lines:
      [
        ['Adds 5 to 10 Physical Damage'],
        ['100% increased Physical Damage'],
        ['20% increased Attack Speed'],
        ['+1.51% to Critical Hit Chance'],
      ][i] ?? [],
  })),
  sourceText: null,
  sockets: ['iron', 'fire'],
  quality: 20,
}
const estimate = (c = catalog, s = state) => api.estimateWeaponStats(c, s)
describe('武器本地面板', () => {
  it('公开独立武器品质能力', () => {
    expect(api.supportsWeaponQuality).toBeTypeOf('function')
    expect(api.supportsWeaponQuality(base)).toBe(true)
  })
  it('按手算向量分别计算品质、物理、元素、攻速、暴击百分点和装填', () => {
    expect(estimate()).toMatchObject({
      ok: true,
      value: {
        damage: {
          Physical: { min: 39, max: 78, dps: 105.3 },
          Fire: { min: 10, max: 18, dps: 25.2 },
        },
        attackSpeed: { value: 1.8 },
        criticalChance: { value: 6.51 },
        reload: { value: 0.67 },
        totalDps: 130.5,
      },
    })
  })
  it('拒绝未确定范围和未知品质孔位', () => {
    for (const patch of [
      { quality: undefined },
      { sockets: undefined },
      { affixes: [{ modId: mods[0]?.id, lines: mods[0]?.lines }] },
    ])
      expect(estimate(catalog, { ...state, ...patch } as CraftState).ok).toBe(false)
  })
  it('纯元素与基础零暴击合法且不逆推来源品质', () => {
    const c = {
      ...catalog,
      bases: [
        {
          ...base,
          properties: {
            ColdMin: 11,
            ColdMax: 26,
            AttackRateBase: 1.55,
            CritChanceBase: 0,
            ReloadTimeBase: 0.8,
          },
        },
      ],
    }
    expect(estimate(c, { ...state, sockets: [], affixes: [] })).toMatchObject({
      ok: true,
      value: {
        damage: { Physical: { min: 0, max: 0 }, Cold: { min: 11, max: 26 } },
        criticalChance: { value: 0 },
      },
    })
  })
  it('相关未知语义明确拒绝，全局效果不混入', () => {
    for (const [group, line, ok] of [
      ['UnknownLocal', '20% increased Attack Speed', false],
      ['LocalCriticalStrikeMultiplier', '+30% to Critical Damage Bonus', true],
      [
        'IncreasedWeaponElementalDamagePercent',
        '30% increased Elemental Damage with Attacks',
        true,
      ],
      ['DamageasExtraFire', 'Gain 30% of Damage as Extra Fire Damage', true],
      ['Future', '20% increased Reload Speed', false],
    ] as const) {
      const m = mod(group, [line])
      expect(
        estimate(
          { ...catalog, modifiers: [m] },
          { ...state, affixes: [{ modId: group, lines: [line] }] },
        ).ok,
        line,
      ).toBe(ok)
    }
  })
  it('基础负数、缺端点及非有限值拒绝', () => {
    for (const properties of [
      { ...base.properties, PhysicalMax: -1 },
      { AttackRateBase: 1, CritChanceBase: 0, FireMin: 1 },
      { ...base.properties, AttackRateBase: Infinity },
      { ...base.properties, PhysicalMax: Number.MAX_VALUE },
    ])
      expect(estimate({ ...catalog, bases: [{ ...base, properties }] }).ok).toBe(false)
  })
  it('固定端点与混合组数值不会错位', () => {
    const m = mod('LocalIncreasedPhysicalDamagePercentAndAccuracyRating', [
      '(100-110)% increased Physical Damage',
      '+(10-20) to Accuracy Rating',
    ])
    const flat = mod('LocalLightningDamage', ['Adds 1 to (7-9) Lightning Damage'])
    expect(
      estimate(
        { ...catalog, modifiers: [m, flat] },
        {
          ...state,
          sockets: [],
          affixes: [
            { modId: m.id, lines: ['100% increased Physical Damage', '+10 to Accuracy Rating'] },
            { modId: flat.id, lines: ['Adds 1 to 7 Lightning Damage'] },
          ],
        },
      ),
    ).toMatchObject({
      ok: true,
      value: { damage: { Physical: { min: 24, max: 48 }, Lightning: { min: 1, max: 7 } } },
    })
  })
  it('不修改输入，当前符文独立于来源记录', () => {
    const s = {
      ...state,
      runeSourceLines: ['16% increased Physical Damage'],
      sourceText:
        'Item Class: Crossbows\nRarity: Normal\nTest\n--------\n16% increased Physical Damage (rune)',
    }
    const snapshot = JSON.stringify(s)
    expect(estimate(catalog, s)).toEqual(estimate())
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})

it('结构边界不看名称，拒绝特殊品质与无法射击弩', () => {
  for (const patch of [
    { type: 'Wand', tags: ['wand', 'onehand'] },
    { type: 'Staff', tags: ['staff', 'twohand'] },
    { type: 'Sceptre' },
    { type: 'Body Armour' },
    { runeforged: true },
    { hidden: true },
    { tags: ['weapon', 'twohand', 'not_for_sale'] },
    { implicit: 'Quality has no effect' },
    { implicit: 'Cannot load or fire Ammunition' },
  ]) {
    const b = { ...base, ...patch }
    expect(api.supportsWeaponQuality(b)).toBe(false)
    expect(estimate({ ...catalog, bases: [b] }).ok).toBe(false)
  }
  expect(api.supportsWeaponQuality({ ...base, name: 'Runeforged Morning Star' })).toBe(true)
})
it('已知固有弹体、流血、命中和爆炸效果隔离，未知本地属性拒绝', () => {
  for (const implicit of [
    '20% increased Bolt Speed',
    '25% increased Projectile Speed with this Weapon',
    'Bleeding you inflict deals Damage 10% faster',
    'Causes Enemies to Explode on Critical kill, for 10% of their Life as Physical Damage',
    'Loads an additional bolt',
  ])
    expect(estimate({ ...catalog, bases: [{ ...base, implicit }] }).ok, implicit).toBe(true)
  for (const implicit of [
    '20% increased Attack Speed',
    '+1% to Critical Hit Chance',
    '10% increased Reload Speed',
    'Adds 1 to 3 Chaos Damage',
  ])
    expect(estimate({ ...catalog, bases: [{ ...base, implicit }] }).ok, implicit).toBe(false)
})
it('小数 half-up、混沌不乘品质、当前重复与替换符文', () => {
  const c = {
    ...catalog,
    bases: [
      {
        ...base,
        properties: {
          PhysicalMin: 1,
          PhysicalMax: 3,
          ChaosMin: 2,
          ChaosMax: 4,
          AttackRateBase: 1.005,
          CritChanceBase: 1.005,
          ReloadTimeBase: 0.8,
        },
      },
    ],
  }
  expect(estimate(c, { ...state, quality: 30, sockets: [], affixes: [] })).toMatchObject({
    ok: true,
    value: {
      attackSpeed: { value: 1.01 },
      criticalChance: { value: 1.01 },
      damage: { Chaos: { min: 2, max: 4 } },
    },
  })
  expect(estimate(catalog, { ...state, sockets: ['fire', 'fire'], affixes: [] })).toMatchObject({
    ok: true,
    value: { damage: { Fire: { min: 17, max: 29 }, Physical: { min: 12, max: 24 } } },
  })
})
it('混合组缺失行或附带未支持语义拒绝，已校验工艺与普通词缀一致', () => {
  const m = mod('LocalIncreasedPhysicalDamagePercentAndAccuracyRating', [
    '100% increased Physical Damage',
    '+10 to Accuracy Rating',
    '20% increased Reload Speed',
  ])
  expect(
    estimate(
      { ...catalog, modifiers: [m] },
      { ...state, affixes: [{ modId: m.id, lines: m.lines }] },
    ).ok,
  ).toBe(false)
  expect(
    estimate(catalog, {
      ...state,
      affixes: state.affixes.map((a, i) => (i === 0 ? { ...a, crafted: true } : a)),
    }),
  ).toEqual(estimate())
})
it('完整物理生命与魔力吸血模板不影响本地面板', () => {
  for (const resource of ['Life', 'Mana']) {
    const m = mod(`Leech${resource}`, [`Leeches (6-6.9)% of Physical Damage as ${resource}`])
    expect(
      estimate(
        { ...catalog, modifiers: [m] },
        { ...state, affixes: [{ modId: m.id, lines: m.lines }] },
      ).ok,
    ).toBe(true)
  }
})
it('未知本地语义不能靠夹带全局或条件关键词绕过检查', () => {
  for (const line of [
    '20% increased Attack Speed; 30% increased Elemental Damage with Attacks',
    '20% increased Attack Speed as Extra Fire Damage',
    '20% increased Reload Speed while stationary',
    'Gain 30% of Damage as Extra Fire Damage and 20% increased Attack Speed',
  ]) {
    const m = mod('UnknownHybrid', [line])
    expect(
      estimate(
        { ...catalog, modifiers: [m] },
        { ...state, affixes: [{ modId: m.id, lines: [line] }] },
      ).ok,
      line,
    ).toBe(false)
  }
})
it('安全大整数端点不得因浮点补偿额外增加一点', () => {
  const c = {
    ...catalog,
    bases: [
      {
        ...base,
        properties: {
          PhysicalMin: 2 ** 52,
          PhysicalMax: 2 ** 52,
          AttackRateBase: 0.1,
          CritChanceBase: 0,
          ReloadTimeBase: 0.8,
        },
      },
    ],
  }
  expect(estimate(c, { ...state, quality: 0, sockets: [], affixes: [] })).toMatchObject({
    ok: true,
    value: { damage: { Physical: { min: 2 ** 52, max: 2 ** 52 } } },
  })
})
it('安全大数四分之一端点按 half-up 向下舍入', () => {
  const c = {
    ...catalog,
    bases: [
      {
        ...base,
        properties: {
          ...base.properties,
          PhysicalMin: 2 ** 50 + 0.25,
          PhysicalMax: 2 ** 50 + 0.25,
          AttackRateBase: 0.1,
        },
      },
    ],
  }
  expect(estimate(c, { ...state, quality: 0, sockets: [], affixes: [] })).toMatchObject({
    ok: true,
    value: { damage: { Physical: { min: 1125899906842624, max: 1125899906842624 } } },
  })
})
it('物理提高的数学半点不受中间浮点乘法误差影响', () => {
  const m = mod('LocalPhysicalDamagePercent', ['13% increased Physical Damage'])
  expect(
    estimate(
      {
        ...catalog,
        bases: [{ ...base, properties: { ...base.properties, PhysicalMin: 50, PhysicalMax: 50 } }],
        modifiers: [m],
      },
      { ...state, quality: 0, sockets: [], affixes: [{ modId: m.id, lines: m.lines }] },
    ),
  ).toMatchObject({ ok: true, value: { damage: { Physical: { min: 57, max: 57 } } } })
})
it.each([
  [1.7, 15, 1.96],
  [1.5, 13, 1.7],
])('基速 %s 提高 %s%% 的数学半点正确保留两位小数', (speed, increased, expected) => {
  const m = mod('LocalIncreasedAttackSpeed', [`${increased}% increased Attack Speed`], 'suffix')
  expect(
    estimate(
      {
        ...catalog,
        bases: [{ ...base, properties: { ...base.properties, AttackRateBase: speed } }],
        modifiers: [m],
      },
      { ...state, quality: 0, sockets: [], affixes: [{ modId: m.id, lines: m.lines }] },
    ),
  ).toMatchObject({ ok: true, value: { attackSpeed: { value: expected } } })
})
it('未知 Local 伤害组即使未写伤害类型也明确拒绝', () => {
  const m = mod('LocalDamagePercent', ['20% increased Damage'])
  expect(
    estimate(
      { ...catalog, modifiers: [m] },
      { ...state, affixes: [{ modId: m.id, lines: m.lines }] },
    ),
  ).toMatchObject({ ok: false, error: expect.stringContaining('本地武器语义尚未支持') })
})
it('未知本地组不能借已知非面板文案绕过，已知组也不能附加未支持语义', () => {
  for (const m of [
    mod('LocalFuture', ['+10 to Accuracy Rating']),
    mod('LocalAccuracyRating', ['+10 to Accuracy Rating', '20% increased Damage']),
    mod('LocalCriticalStrikeMultiplier', ['+30% to Critical Damage Bonus and Damage']),
  ])
    expect(
      estimate(
        { ...catalog, modifiers: [m] },
        { ...state, affixes: [{ modId: m.id, lines: m.lines }] },
      ),
    ).toMatchObject({ ok: false })
})
it('已核实的非面板本地组保持基础面板', () => {
  for (const m of [
    mod('LocalAccuracyRating', ['+10 to Accuracy Rating']),
    mod('LocalCriticalStrikeMultiplier', ['+30% to Critical Damage Bonus']),
    mod('LocalLightRadiusAndAccuracy', ['+10 to Accuracy Rating', '5% increased Light Radius']),
    mod('LocalAttributeRequirements', ['15% reduced Attribute Requirements']),
    mod('LocalStunDuration', ['11% increased Stun Duration']),
    mod('LocalStunDamageIncrease', ['Causes 21% increased Stun Buildup']),
    mod('LocalMeleeWeaponRange', ['+1 to Weapon Range']),
    mod('LocalAdditionalChainChance', ['25% chance to Chain an additional time']),
    mod('LocalChaosPenetration', ['Attacks with this Weapon Penetrate 15% Chaos Resistance']),
  ])
    expect(
      estimate(
        { ...catalog, modifiers: [m] },
        { ...state, quality: 0, sockets: [], affixes: [{ modId: m.id, lines: m.lines }] },
      ),
      m.group,
    ).toMatchObject({
      ok: true,
      value: {
        damage: { Physical: { min: 10, max: 20 } },
        attackSpeed: { value: 1.5 },
        criticalChance: { value: 5 },
      },
    })
})
it('源面板999与目录不同仍可导入，原值不回写且不参与计算', () => {
  const raw =
    'Item Class: Crossbows\nRarity: Normal\nTest\n--------\nPhysical Damage: 999-999 (augmented)\nCritical Hit Chance: 99%\nAttacks per Second: 9\nQuality: +20%\n--------\nItem Level: 80'
  const parsed = api.parseItem(raw)
  if (!parsed.ok) throw new Error(parsed.error)
  const imported = api.importCraftState(
    catalog,
    base.id,
    parsed.item,
    api.inspectItem(parsed.item, { items: { bases: { Test: '测试弩' }, uniques: {} } }),
    [],
  )
  expect(imported, imported.ok ? '' : imported.error).toMatchObject({ ok: true })
  if (!imported.ok) return
  expect(imported.value.sourceText).toBe(raw)
  expect(estimate(catalog, imported.value)).toMatchObject({
    ok: true,
    value: {
      damage: { Physical: { min: 12, max: 24 } },
      attackSpeed: { value: 1.5 },
      criticalChance: { value: 5 },
    },
  })
})
it('武器属性标题不能从词缀导出为伪造面板', () => {
  const m = mod('Unknown', ['Physical Damage: 999-999'])
  expect(
    api.exportCraftItemText(
      { ...catalog, modifiers: [m] },
      { ...state, affixes: [{ modId: m.id, lines: m.lines }] },
    ),
  ).toMatchObject({ ok: false })
})
