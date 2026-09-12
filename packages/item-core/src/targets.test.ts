import { describe, expect, it } from 'vitest'
import type { CatalogBase, CatalogMod, CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
import {
  analyzeCraftTargets,
  type CraftTargetValues,
  validateCraftTargetAlternatives,
  validateCraftTargets,
  validateCraftTargetValues,
} from './targets'

const base: CatalogBase = {
  id: 'Focus',
  name: 'Focus',
  type: 'Focus',
  tags: ['focus', 'default'],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: 3,
  hidden: false,
  runeforged: false,
}

function mod(id: string, kind: CatalogMod['kind'], extra: Partial<CatalogMod> = {}): CatalogMod {
  return {
    id,
    name: id,
    kind,
    group: id,
    level: 1,
    lines: [`${id} (1-10)`],
    statOrder: [1],
    tags: [],
    addsTags: [],
    eligibility: [
      { tag: 'focus', value: 1 },
      { tag: 'default', value: 0 },
    ],
    tradeHashes: {},
    ...extra,
  }
}

const modifiers = [
  mod('p1', 'prefix'),
  mod('p2', 'prefix'),
  mod('p3', 'prefix'),
  mod('p4', 'prefix'),
  mod('s1', 'suffix'),
  mod('s2', 'suffix'),
  mod('s3', 'suffix'),
  mod('s4', 'suffix'),
  mod('high', 'prefix', { group: 'p1', level: 80 }),
]

function catalog(mods = modifiers, extra: Partial<CatalogBase> = {}): CraftCatalog {
  return {
    _meta: {
      schemaVersion: 2,
      tier: 'primary',
      sourceCommit: 'a'.repeat(40),
      gameVersion: null,
      generatedAt: '2026-09-12',
      weightStatus: 'unknown',
      sources: [],
      excludedBases: [],
    },
    bases: [{ ...base, ...extra }],
    modifiers: mods,
  }
}

function state(rarity: CraftState['rarity'] = 'rare', ids: string[] = []): CraftState {
  return {
    baseId: base.id,
    itemLevel: 70,
    rarity,
    affixes: ids.map((modId) => ({ modId, lines: [`${modId} 5`] })),
    sourceText: null,
  }
}

function advice(
  current: CraftState,
  ids: string[],
  source = catalog(),
  values: CraftTargetValues[] = [],
) {
  const result = analyzeCraftTargets(source, current, ids, values)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('制作目标校验', () => {
  it('允许空目标、高物等精确档位和完整六组目标，并复制返回数组', () => {
    const ids = ['high', 'p2', 'p3', 's1', 's2', 's3']
    expect(validateCraftTargets(catalog(), base.id, [])).toEqual({ ok: true, value: [] })
    const result = validateCraftTargets(catalog(), base.id, ids)
    expect(result).toEqual({ ok: true, value: ids })
    if (result.ok) expect(result.value).not.toBe(ids)
  })

  it.each([
    ['重复 ID', ['p1', 'p1']],
    ['同组不同档位', ['p1', 'high']],
    ['前缀超容量', ['p1', 'p2', 'p3', 'p4']],
    ['后缀超容量', ['s1', 's2', 's3', 's4']],
    ['超过六组', ['p1', 'p2', 'p3', 's1', 's2', 's3', 's4']],
    ['未知 ID', ['missing']],
  ])('拒绝%s', (_label, ids) => {
    expect(validateCraftTargets(catalog(), base.id, ids)).toMatchObject({
      ok: false,
      error: expect.any(String),
    })
  })

  it('拒绝不存在、不受支持基底和静态不合格目标', () => {
    expect(validateCraftTargets(catalog(), 'missing', [])).toMatchObject({ ok: false })
    expect(validateCraftTargets(catalog(modifiers, { hidden: true }), base.id, [])).toMatchObject({
      ok: false,
    })
    const wrong = mod('wrong', 'prefix', { eligibility: [{ tag: 'default', value: 0 }] })
    expect(validateCraftTargets(catalog([wrong]), base.id, ['wrong'])).toMatchObject({ ok: false })
  })

  it('运行时非法目标列表返回错误而不抛出异常', () => {
    for (const invalid of [null, {}, 'p1', [null], [3]]) {
      expect(validateCraftTargets(catalog(), base.id, invalid as string[])).toMatchObject({
        ok: false,
      })
    }
  })
})

describe('制作目标分析', () => {
  it('高级通货建议只包含门槛内档位或当前词缀族最高档，并保留具体版本', () => {
    const source = catalog([
      mod('low', 'prefix', { group: 'p', level: 34 }),
      mod('greater', 'prefix', { group: 'p', level: 35 }),
      mod('perfect', 'prefix', { group: 'p', level: 50 }),
      mod('fallback', 'suffix', { level: 30 }),
    ])
    const current = state('rare')
    const low = advice(current, ['low'], source)
    expect(low.steps.map((step) => step.currency)).toEqual(['exalted'])
    const greater = advice(current, ['greater'], source)
    expect(greater.steps.map((step) => step.currency)).toEqual(['exalted', 'greater_exalted'])
    const perfect = advice(current, ['perfect'], source)
    expect(perfect.steps.map((step) => step.currency)).toEqual([
      'exalted',
      'greater_exalted',
      'perfect_exalted',
    ])
    const fallback = advice(current, ['fallback'], source)
    expect(fallback.steps.map((step) => step.currency)).toEqual([
      'exalted',
      'greater_exalted',
      'perfect_exalted',
    ])
  })

  it('高级混沌建议以移除后的动态池判断目标，并标记具体版本及丢失风险', () => {
    const source = catalog([
      mod('blocker', 'suffix', { addsTags: ['blocked'] }),
      mod('target', 'prefix', {
        level: 50,
        eligibility: [
          { tag: 'blocked', value: 0 },
          { tag: 'focus', value: 1 },
        ],
      }),
    ])
    const result = advice(state('rare', ['blocker']), ['blocker', 'target'], source)
    const chaos = result.steps.filter((step) => step.currency.includes('chaos'))
    expect(chaos.map((step) => step.currency)).toEqual(['chaos', 'greater_chaos', 'perfect_chaos'])
    expect(chaos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currency: 'perfect_chaos',
          removeModId: 'blocker',
          targetModIds: ['target'],
          lostTargetIds: ['blocker'],
          randomRemovalRisk: true,
          remainingChoices: 1,
        }),
      ]),
    )
  })

  it('神圣不会生成缺失精确ID，不列为目标推进建议', () => {
    const result = advice(state('rare', ['p1']), ['s1'])
    expect(result.steps.some((step) => step.currency === 'divine')).toBe(false)
  })
  it('按精确 ID 判定，同组不同档位不达成；物等不足明确解释且无添加提示', () => {
    const result = advice(state('rare', ['p1']), ['high'])
    expect(result.targets).toEqual([
      {
        modId: 'high',
        present: false,
        numeric: [],
        matched: false,
        reasons: expect.arrayContaining([
          expect.stringContaining('80'),
          expect.stringContaining('同组'),
        ]),
      },
    ])
    expect(result.steps).toEqual([])
  })

  it('已有高物等目标直接达成，不受当前物等与动态标签追溯影响', () => {
    const source = catalog([
      ...modifiers.filter((entry) => entry.id !== 'high'),
      mod('high', 'prefix', {
        group: 'p1',
        level: 80,
        eligibility: [
          { tag: 'blocked', value: 0 },
          { tag: 'focus', value: 1 },
        ],
      }),
      mod('blocker', 'suffix', { addsTags: ['blocked'] }),
    ])
    const result = advice(state('rare', ['high', 'blocker']), ['high'], source)
    expect(result.targets).toEqual([
      { modId: 'high', present: true, numeric: [], matched: true, reasons: [] },
    ])
    expect(result.steps).toEqual([])
  })

  it('普通装备优先蜕变，并保留点金开始四组选词缀的信息', () => {
    const result = advice(state('normal'), ['p1', 'p2'])
    expect(result.steps.map((step) => step.currency)).toEqual([
      'transmutation',
      'greater_transmutation',
      'perfect_transmutation',
      'alchemy',
    ])
    expect(result.steps[0]).toEqual({
      currency: 'transmutation',
      targetModIds: ['p1', 'p2'],
      lostTargetIds: [],
      randomRemovalRisk: false,
      clearsAll: false,
      remainingChoices: 1,
    })
    expect(result.steps.find((step) => step.currency === 'alchemy')).toMatchObject({
      currency: 'alchemy',
      clearsAll: true,
      remainingChoices: 4,
    })
  })

  it('直接添加排在移除建议前，点金标明确定丢失的已有目标', () => {
    const result = advice(state('magic', ['p1']), ['p1', 's1'])
    expect(result.steps[0]?.currency).toBe('augmentation')
    expect(result.steps.find((step) => step.currency === 'alchemy')).toMatchObject({
      targetModIds: ['s1'],
      lostTargetIds: ['p1'],
      clearsAll: true,
      remainingChoices: 4,
    })
    expect(result.steps.every((step) => !step.targetModIds.includes('p1'))).toBe(true)
  })

  it('满稀有装备逐组列出可释放位置的混沌结果，实际随机移除风险不能省略', () => {
    const result = advice(state('rare', ['p1', 'p2', 'p3', 's1', 's2', 's3']), ['p1', 'p4'])
    const chaos = result.steps.filter((step) => step.currency === 'chaos')
    expect(chaos.map((step) => step.removeModId)).toEqual(['p2', 'p3', 'p1'])
    expect(chaos.every((step) => step.randomRemovalRisk && step.remainingChoices === 1)).toBe(true)
    expect(chaos[0]).toMatchObject({ targetModIds: ['p4'], lostTargetIds: [] })
    expect(chaos[2]).toMatchObject({ lostTargetIds: ['p1'] })
    expect(result.steps.some((step) => step.currency === 'exalted')).toBe(false)
    expect(result.targets[1]?.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('前缀')]),
    )
    expect(result.targets[1]?.reasons.join('')).not.toContain('提升稀有度')
  })

  it('剥离后增幅只提示能释放目标的词缀，且剥离自身无需选择新词缀', () => {
    const result = advice(state('magic', ['p1', 's1']), ['p2'])
    const steps = result.steps.filter((step) => step.currency === 'annulment')
    expect(steps).toEqual([
      {
        currency: 'annulment',
        removeModId: 'p1',
        targetModIds: ['p2'],
        lostTargetIds: [],
        randomRemovalRisk: true,
        clearsAll: false,
        remainingChoices: 0,
      },
    ])
  })

  it.each(['magic', 'rare'] as const)('目标在%s状态可直接添加时不建议多余剥离', (rarity) => {
    const result = advice(state(rarity, ['p1']), ['s1'])
    expect(result.steps.some((step) => step.currency === 'annulment')).toBe(false)
    expect(
      result.steps.some(
        (step) => step.currency === (rarity === 'magic' ? 'augmentation' : 'exalted'),
      ),
    ).toBe(true)
  })

  it('移除动态阻断标签后释放目标，不能只用原状态候选池', () => {
    const source = catalog([
      ...modifiers,
      mod('blocker', 'suffix', { addsTags: ['no_fire'] }),
      mod('fire', 'prefix', {
        eligibility: [
          { tag: 'no_fire', value: 0 },
          { tag: 'focus', value: 1 },
        ],
      }),
    ])
    const result = advice(state('rare', ['blocker', 's1']), ['fire'], source)
    expect(result.targets[0]?.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('标签')]),
    )
    expect(
      result.steps.filter((step) => step.currency === 'chaos' || step.currency === 'annulment'),
    ).toEqual([
      {
        currency: 'chaos',
        removeModId: 'blocker',
        targetModIds: ['fire'],
        lostTargetIds: [],
        randomRemovalRisk: true,
        clearsAll: false,
        remainingChoices: 1,
      },
      {
        currency: 'annulment',
        removeModId: 'blocker',
        targetModIds: ['fire'],
        lostTargetIds: [],
        randomRemovalRisk: true,
        clearsAll: false,
        remainingChoices: 0,
      },
    ])
  })

  it('无目标或全部达成后不再产生制作提示', () => {
    expect(advice(state(), [])).toEqual({ targets: [], steps: [] })
    expect(advice(state('rare', ['p1', 's1']), ['p1', 's1']).steps).toEqual([])
  })

  it('非法状态或目标返回错误，分析不改变目录、状态与目标输入', () => {
    const source = catalog()
    const current = state('rare', ['p1', 's1'])
    const ids = ['p1', 'p2']
    const snapshot = structuredClone({ source, current, ids })
    advice(current, ids, source)
    expect({ source, current, ids }).toEqual(snapshot)
    expect(analyzeCraftTargets(source, { ...current, itemLevel: 0 }, ids)).toMatchObject({
      ok: false,
    })
    expect(analyzeCraftTargets(source, current, ['missing'])).toMatchObject({ ok: false })
  })
})

describe('制作目标数值条件', () => {
  const values: CraftTargetValues[] = [{ modId: 'p1', bounds: [{ index: 0, min: 6 }] }]

  it('验证条件并深复制，允许比显示网格更细的比较阈值', () => {
    const input = [{ modId: 'p1', bounds: [{ index: 0, min: 5.5, max: 9.5 }] }]
    const result = validateCraftTargetValues(catalog(), base.id, ['p1'], input)
    expect(result).toEqual({ ok: true, value: input })
    if (!result.ok) return
    const copied = result.value[0]?.bounds[0]
    if (copied === undefined) throw new Error('缺少复制后的条件')
    copied.min = 7
    expect(input[0]?.bounds[0]?.min).toBe(5.5)
    expect(validateCraftTargetValues(catalog(), base.id, [], [])).toEqual({ ok: true, value: [] })
  })

  it.each(
    [
      null,
      {},
      'p1',
      [null],
      [[]],
      [{ modId: 'p1', bounds: [] }],
      [{ modId: 's1', bounds: [{ index: 0, min: 1 }] }],
      [{ modId: 'p1', bounds: [{ index: 0 }] }],
      [{ modId: 'p1', bounds: [null] }],
      [{ modId: 'p1', bounds: ['1'] }],
      [{ modId: 'p1', bounds: [{ index: 0, min: null }] }],
      [{ modId: 'p1', bounds: [{ index: 0, min: undefined, max: 8 }] }],
      [{ modId: 'p1', bounds: [{ index: 0, min: '5' }] }],
      [{ modId: 'p1', bounds: [{ index: 0, min: NaN }] }],
      [{ modId: 'p1', bounds: [{ index: 0, max: Infinity }] }],
      [{ modId: 'p1', bounds: [{ index: 0, min: 0 }] }],
      [{ modId: 'p1', bounds: [{ index: 0, max: 11 }] }],
      [{ modId: 'p1', bounds: [{ index: 0, min: 8, max: 7 }] }],
      [{ modId: 'p1', bounds: [{ index: -1, min: 5 }] }],
      [{ modId: 'p1', bounds: [{ index: 0.5, min: 5 }] }],
      [{ modId: 'p1', bounds: [{ index: 1, min: 5 }] }],
      [{ modId: 'p1', bounds: [{ index: 0, min: 5, extra: 1 }] }],
      [{ modId: 'p1', bounds: [{ index: 0, min: 5 }], extra: 1 }],
      [
        {
          modId: 'p1',
          bounds: [
            { index: 0, min: 5 },
            { index: 0, max: 8 },
          ],
        },
      ],
      [...values, ...values],
      Array.from({ length: 7 }, () => values[0]),
    ].map((invalid) => [invalid]),
  )('运行时拒绝非法结构或越界条件 %#', (invalid) => {
    expect(validateCraftTargetValues(catalog(), base.id, ['p1'], invalid)).toMatchObject({
      ok: false,
      error: expect.any(String),
    })
  })

  it('数值校验同时验证目标列表、范围机制和每组32个条件上限', () => {
    expect(validateCraftTargetValues(catalog(), base.id, ['p1', 'p1'], [])).toMatchObject({
      ok: false,
    })
    const many = mod('many', 'prefix', {
      lines: Array.from({ length: 33 }, (_, index) => `Stat ${index} (1-10)`),
    })
    const bounds = Array.from({ length: 33 }, (_, index) => ({ index, min: 5 }))
    expect(
      validateCraftTargetValues(catalog([many]), base.id, ['many'], [{ modId: 'many', bounds }]),
    ).toMatchObject({ ok: false })
    expect(
      validateCraftTargetValues(
        catalog([many]),
        base.id,
        ['many'],
        [{ modId: 'many', bounds: bounds.slice(0, 32) }],
      ),
    ).toMatchObject({ ok: true })
    const skill = mod('skill', 'prefix', { lines: ['Grants Skill: Level (1-5) Fireball'] })
    expect(
      validateCraftTargetValues(
        catalog([skill]),
        base.id,
        ['skill'],
        [{ modId: 'skill', bounds: [{ index: 0, min: 2 }] }],
      ),
    ).toMatchObject({ ok: false })
    const fixed = mod('fixed', 'prefix', { lines: ['Cannot be Frozen'] })
    expect(
      validateCraftTargetValues(
        catalog([fixed]),
        base.id,
        ['fixed'],
        [{ modId: 'fixed', bounds: [{ index: 0, min: 2 }] }],
      ),
    ).toMatchObject({ ok: false })
  })

  it('精确ID已存在但数值未达标，只提示神圣且保留未知范围', () => {
    const result = advice(state('rare', ['p1']), ['p1'], catalog(), values)
    expect(result.targets[0]).toMatchObject({
      modId: 'p1',
      present: true,
      matched: false,
      numeric: [{ index: 0, min: 6, actual: 5, matched: false }],
      reasons: expect.arrayContaining([expect.stringContaining('下限')]),
    })
    expect(result.steps).toEqual([
      {
        currency: 'divine',
        targetModIds: ['p1'],
        rerolledTargetIds: ['p1'],
        lostTargetIds: [],
        randomRemovalRisk: false,
        clearsAll: false,
        remainingChoices: 0,
      },
    ])
    const current = state('rare', ['p1'])
    current.affixes = [{ modId: 'p1', lines: ['p1 (1-10)'] }]
    const unknown = advice(current, ['p1'], catalog(), values)
    expect(unknown.targets[0]).toMatchObject({
      present: true,
      matched: false,
      numeric: [{ index: 0, min: 6, actual: null, matched: false }],
    })
    expect(unknown.targets[0]?.reasons.join('')).toContain('未知')
  })

  it('缺失目标的数值实际值为null，不能通过神圣添加', () => {
    const result = advice(state(), ['p1'], catalog(), values)
    expect(result.targets[0]).toMatchObject({
      present: false,
      matched: false,
      numeric: [{ index: 0, min: 6, actual: null, matched: false }],
    })
    expect(result.targets[0]?.reasons.join('')).toContain('尚未')
    expect(result.steps.some((step) => step.currency === 'divine')).toBe(false)
  })

  it.each([
    { rarity: 'normal' as const, existing: [], reason: '普通装备需先使用通货提升稀有度' },
    { rarity: 'magic' as const, existing: ['p2'], reason: '前缀位置已满' },
  ])('数值目标保留 $rarity 装备的结构门槛原因', ({ rarity, existing, reason }) => {
    const result = advice(state(rarity, existing), ['p1'], catalog(), values)
    const reasons = result.targets[0]?.reasons.join('')
    expect(reasons).toContain(reason)
    expect(reasons).toContain('尚未包含此精确词缀')
  })

  it('乱序多行使用目录索引匹配，负数上下限按条件比较', () => {
    const mixed = mod('mixed', 'prefix', {
      lines: ['+(10-20) to maximum Life', '-(10-20)% Fire Resistance'],
    })
    const current = {
      ...state(),
      affixes: [{ modId: 'mixed', lines: ['-17% Fire Resistance', '+12 to maximum Life'] }],
    }
    const conditions = [
      {
        modId: 'mixed',
        bounds: [
          { index: 1, min: -18, max: -15 },
          { index: 0, max: 12 },
        ],
      },
    ]
    const result = advice(current, ['mixed'], catalog([mixed]), conditions)
    expect(result.targets[0]).toMatchObject({
      present: true,
      matched: true,
      numeric: [
        { index: 1, min: -18, max: -15, actual: -17, matched: true },
        { index: 0, max: 12, actual: 12, matched: true },
      ],
    })
    expect(result.steps).toEqual([])
    const stricter = [{ modId: 'mixed', bounds: [{ index: 1, max: -18 }] }]
    expect(
      advice(current, ['mixed'], catalog([mixed]), stricter).targets[0]?.reasons.join(''),
    ).toContain('上限')
  })

  it('神圣列出所有已存在数值目标的重掷风险，移除提示包含尚未达标的已有目标', () => {
    const conditions = [...values, { modId: 's1', bounds: [{ index: 0, max: 8 }] }]
    const result = advice(state('magic', ['p1', 's1']), ['p1', 's1', 'p2'], catalog(), conditions)
    expect(result.steps.find((step) => step.currency === 'divine')).toMatchObject({
      targetModIds: ['p1'],
      rerolledTargetIds: ['p1', 's1'],
      lostTargetIds: [],
    })
    expect(result.steps.find((step) => step.currency === 'alchemy')).toMatchObject({
      targetModIds: ['p2'],
      lostTargetIds: ['p1', 's1'],
    })
    expect(
      result.steps
        .filter((step) => step.currency !== 'divine')
        .every((step) => !step.targetModIds.includes('p1')),
    ).toBe(true)
  })

  it('神圣门禁失败时不提示，并且非法数值条件不会被分析忽略', () => {
    const unsupported = mod('skill', 'suffix', { lines: ['Grants Skill: Level (1-5) Fireball'] })
    const current = state('rare', ['p1'])
    current.affixes.push({ modId: 'skill', lines: [...unsupported.lines] })
    expect(advice(current, ['p1'], catalog([...modifiers, unsupported]), values).steps).toEqual([])
    expect(
      analyzeCraftTargets(catalog(), state('rare', ['p1']), ['p1'], [{ modId: 'p1', bounds: [] }]),
    ).toMatchObject({ ok: false })
  })

  it('其他ID尚缺失但已有数值条件均达成时不提示神圣，分析不改变输入', () => {
    const source = catalog()
    const current = state('rare', ['p1'])
    const conditions = [{ modId: 'p1', bounds: [{ index: 0, min: 5, max: 5 }] }]
    const snapshot = structuredClone({ source, current, conditions })
    const result = advice(current, ['p1', 's1'], source, conditions)
    expect(result.targets[0]?.matched).toBe(true)
    expect(result.steps.some((step) => step.currency === 'divine')).toBe(false)
    expect({ source, current, conditions }).toEqual(snapshot)
  })
})

describe('同组替代档位', () => {
  const alternatives = [{ targetModId: 'high', modIds: ['p1'] }]
  it('组内任一且组间全部，未选档位仍不达成', () => {
    const result = analyzeCraftTargets(
      catalog(),
      state('rare', ['p1']),
      ['high', 's1'],
      [],
      alternatives,
    )
    expect(result).toMatchObject({
      ok: true,
      value: {
        targets: [
          {
            modId: 'high',
            present: true,
            matched: true,
            alternatives: [
              { modId: 'high', present: false },
              { modId: 'p1', present: true, matched: true },
            ],
          },
          { modId: 's1', matched: false },
        ],
      },
    })
    if (!result.ok) return
    expect(
      result.value.steps.every(
        (step) => !step.targetModIds.includes('high') && !step.targetModIds.includes('p1'),
      ),
    ).toBe(true)
    expect(
      analyzeCraftTargets(catalog(), state('rare', ['p1', 's1']), ['high', 's1'], [], alternatives),
    ).toMatchObject({ ok: true, value: { steps: [] } })
    expect(advice(state('rare', ['p1']), ['high']).targets[0]?.matched).toBe(false)
  })

  it('替代项独立数值、实际损失和神圣风险，未知值不算完成', () => {
    const values = [
      { modId: 'high', bounds: [{ index: 0, min: 9 }] },
      { modId: 'p1', bounds: [{ index: 0, min: 6 }] },
      { modId: 's1', bounds: [{ index: 0, min: 4 }] },
    ]
    const result = analyzeCraftTargets(
      catalog(),
      state('magic', ['p1', 's1']),
      ['high', 's1', 'p2'],
      values,
      alternatives,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.targets[0]?.alternatives?.[1]).toMatchObject({
      matched: false,
      numeric: [{ actual: 5, min: 6 }],
    })
    expect(result.value.steps.find((step) => step.currency === 'divine')).toMatchObject({
      targetModIds: ['p1'],
      rerolledTargetIds: ['p1', 's1'],
    })
    expect(result.value.steps.find((step) => step.currency === 'alchemy')).toMatchObject({
      targetModIds: ['p2'],
      lostTargetIds: ['p1', 's1'],
    })
    const unknown = state('rare', ['p1'])
    unknown.affixes = [{ modId: 'p1', lines: ['p1 (1-10)'] }]
    expect(
      analyzeCraftTargets(catalog(), unknown, ['high'], values.slice(0, 2), alternatives),
    ).toMatchObject({
      ok: true,
      value: {
        targets: [
          {
            present: true,
            matched: false,
            alternatives: [{}, { numeric: [{ actual: null, matched: false }] }],
          },
        ],
      },
    })
  })

  it('数值条件依据各档自身范围，并保留物等和高级通货过滤', () => {
    const source = catalog([
      ...modifiers,
      mod('low', 'prefix', { group: 'p1', lines: ['low (20-30)'] }),
      mod('tier', 'prefix', { group: 'p1', level: 35 }),
    ])
    const accepted = [{ targetModId: 'high', modIds: ['low'] }]
    expect(
      validateCraftTargetValues(
        source,
        base.id,
        ['high'],
        [{ modId: 'low', bounds: [{ index: 0, min: 25 }] }],
        accepted,
      ).ok,
    ).toBe(true)
    expect(
      validateCraftTargetValues(
        source,
        base.id,
        ['high'],
        [{ modId: 'low', bounds: [{ index: 0, min: 5 }] }],
        accepted,
      ).ok,
    ).toBe(false)
    const result = analyzeCraftTargets(source, state(), ['high'], [], accepted)
    expect(result).toMatchObject({
      ok: true,
      value: { steps: [{ currency: 'exalted', targetModIds: ['low'] }] },
    })
  })

  it.each([
    null,
    {},
    [null],
    [{ targetModId: 'high', modIds: [] }],
    [{ targetModId: 'high', modIds: ['high'] }],
    [{ targetModId: 'missing', modIds: ['p1'] }],
    [{ targetModId: 'high', modIds: ['p1', 'p1'] }],
    [{ targetModId: 'high', modIds: ['s1'] }],
    [{ targetModId: 'high', modIds: ['missing'] }],
    [{ targetModId: 'high', modIds: ['p1'], extra: true }],
    [alternatives[0], alternatives[0]],
  ])('拒绝非法替代结构 %#', (invalid) => {
    expect(validateCraftTargetAlternatives(catalog(), base.id, ['high'], invalid).ok).toBe(false)
  })

  it('验证同kind静态资格、32成员边界与192条数值上限并深复制', () => {
    const ids = ['p1', 'p2', 'p3', 's1', 's2', 's3']
    const extra = ids.flatMap((id) =>
      Array.from({ length: 31 }, (_, index) =>
        mod(`${id}-${index}`, id.startsWith('p') ? 'prefix' : 'suffix', { group: id }),
      ),
    )
    const source = catalog([...modifiers, ...extra])
    const accepted = ids.map((targetModId) => ({
      targetModId,
      modIds: extra.filter((entry) => entry.group === targetModId).map((entry) => entry.id),
    }))
    const result = validateCraftTargetAlternatives(source, base.id, ids, accepted)
    expect(result).toEqual({ ok: true, value: accepted })
    if (result.ok) expect(result.value[0]?.modIds).not.toBe(accepted[0]?.modIds)
    const values = [...ids, ...extra.map((entry) => entry.id)].map((modId) => ({
      modId,
      bounds: [{ index: 0, min: 5 }],
    }))
    expect(validateCraftTargetValues(source, base.id, ids, values, accepted).ok).toBe(true)
    expect(
      validateCraftTargetValues(source, base.id, ids, [...values, values[0]], accepted).ok,
    ).toBe(false)
    expect(
      validateCraftTargetAlternatives(source, base.id, ids, [
        { targetModId: 'p1', modIds: [...(accepted[0]?.modIds ?? []), 'high'] },
      ]).ok,
    ).toBe(false)
    for (const wrong of [
      mod('wrong', 'suffix', { group: 'p1' }),
      mod('wrong', 'prefix', { group: 'p1', eligibility: [{ tag: 'default', value: 0 }] }),
    ]) {
      expect(
        validateCraftTargetAlternatives(
          catalog([...modifiers, wrong]),
          base.id,
          ['p1'],
          [{ targetModId: 'p1', modIds: ['wrong'] }],
        ).ok,
      ).toBe(false)
    }
  })
})

it('同组已有可直接添加的接受档位，不为另一个被动态阻断的接受项建议剥离', () => {
  const source = catalog([
    mod('blocker', 'suffix', { addsTags: ['blocked'] }),
    mod('primary', 'prefix', { group: 'target' }),
    mod('alternative', 'prefix', {
      group: 'target',
      eligibility: [
        { tag: 'blocked', value: 0 },
        { tag: 'focus', value: 1 },
      ],
    }),
  ])
  const result = analyzeCraftTargets(
    source,
    state('rare', ['blocker']),
    ['primary'],
    [],
    [{ targetModId: 'primary', modIds: ['alternative'] }],
  )
  expect(result.ok).toBe(true)
  if (result.ok)
    expect(result.value.steps.some((step) => step.currency === 'annulment')).toBe(false)
})

it('定向预兆建议只列对应基础通货与允许目标侧', () => {
  const result = analyzeCraftTargets(
    catalog(),
    state(),
    ['p1', 's1'],
    [],
    [],
    'sinistral_exaltation',
  )
  expect(
    result.ok && result.value.steps.map((step) => [step.currency, step.omen, step.targetModIds]),
  ).toEqual([['exalted', 'sinistral_exaltation', ['p1']]])
  expect(analyzeCraftTargets(catalog(), state(), ['p1'], [], [], null as never).ok).toBe(false)
})
it('定向剥离耗尽后下一步可新增另一侧且损失真实目标', () => {
  const result = analyzeCraftTargets(
    catalog(),
    state('rare', ['p1', 'p2', 'p3', 's1']),
    ['p4', 'p1'],
    [],
    [],
    'sinistral_annulment',
  )
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.steps).toHaveLength(3)
  expect(
    result.value.steps.every(
      (step) =>
        step.omen === 'sinistral_annulment' &&
        step.randomRemovalRisk &&
        step.removeModId?.startsWith('p'),
    ),
  ).toBe(true)
  expect(result.value.steps.find((step) => step.removeModId === 'p1')?.lostTargetIds).toEqual([
    'p1',
  ])
})

it('定向混沌能推进另一侧替代档位且损失记录实际接受档位', () => {
  const mods = [...modifiers, mod('low', 'prefix', { group: 'p1' })]
  const result = analyzeCraftTargets(
    catalog(mods),
    state('rare', ['low', 's1']),
    ['p1', 's2'],
    [],
    [{ targetModId: 'p1', modIds: ['low'] }],
    'sinistral_erasure',
  )
  expect(result).toMatchObject({
    ok: true,
    value: {
      steps: [
        {
          currency: 'chaos',
          omen: 'sinistral_erasure',
          removeModId: 'low',
          targetModIds: ['s2'],
          lostTargetIds: ['low'],
          randomRemovalRisk: true,
        },
      ],
    },
  })
})
it('已选预兆不会生成不兼容神圣建议', () => {
  const initial = state('rare', ['p1'])
  initial.affixes = [{ modId: 'p1', lines: ['p1 1'] }]
  const result = analyzeCraftTargets(
    catalog(),
    initial,
    ['p1'],
    [{ modId: 'p1', bounds: [{ index: 0, min: 9 }] }],
    [],
    'sinistral_exaltation',
  )
  expect(result).toMatchObject({ ok: true, value: { steps: [] } })
})

describe('精华技能互斥的目标原因', () => {
  const essence = mod('essence-skill', 'suffix', { group: 'EssenceSpellSkillLevel' })
  const ordinary = mod('cold-skill', 'suffix', {
    group: 'GlobalIncreaseColdSpellSkillGemLevelWeapon',
  })
  const source = catalog([...modifiers, essence, ordinary])

  it.each([
    ['essence-skill', 'cold-skill'],
    ['cold-skill', 'essence-skill'],
  ])('已有 %s 时明确指出目标 %s 的技能冲突，不能误报满侧', (existing, target) => {
    const current = state('rare', [existing])
    if (existing === 'essence-skill')
      current.affixes = current.affixes.map((affix) => ({ ...affix, crafted: true }))
    const result = advice(current, [target], source)
    expect(result.targets[0]?.reasons).toContain(
      '当前装备已有互斥的技能等级词缀，需要先移除冲突词缀。',
    )
    expect(result.targets[0]?.reasons.some((reason) => reason.includes('位置已满'))).toBe(false)
  })

  it('没有技能冲突且后缀确实满时仍提示容量原因', () => {
    const result = advice(state('rare', ['s1', 's2', 's3']), ['cold-skill'], source)
    expect(result.targets[0]?.reasons).toContain('当前后缀位置已满，需要先移除词缀。')
    expect(result.targets[0]?.reasons.some((reason) => reason.includes('技能等级'))).toBe(false)
  })
})

it('精华独有目标低物等只说明工具覆盖边界，普通目标仍说明物等要求', () => {
  const exclusive = mod('essence-only', 'prefix', {
    level: 80,
    eligibility: [{ tag: 'default', value: 0 }],
  })
  const source = catalog([...modifiers, exclusive])
  source._meta.sources = [{ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' }]
  source.essences = [
    {
      id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
      name: 'Perfect Essence of Life',
      type: 'Life',
      tierLevel: 99,
      mods: { Focus: exclusive.id },
    },
  ]
  const essenceReasons = advice(state(), [exclusive.id], source).targets[0]?.reasons
  expect(essenceReasons).toContain('该精华目标在当前低物等装备上的交互尚未验证，暂不支持演练。')
  expect(essenceReasons?.some((reason) => reason.includes('需要物品等级'))).toBe(false)
  expect(advice(state(), ['high'], source).targets[0]?.reasons).toContain(
    '需要物品等级 80，当前为 70。',
  )
})
