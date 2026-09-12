import { describe, expect, it } from 'vitest'
import type { CatalogBase, CatalogMod, CraftCatalog } from './catalog'
import {
  addCraftAffix,
  applyCraftOperation,
  CRAFT_CURRENCY_LABELS,
  CRAFT_CURRENCY_RULES,
  type CraftCurrency,
  type CraftState,
  craftCandidates,
  createCraftState,
  prepareCraftOperation,
  removableCraftAffixes,
} from './rehearsal'

const base: CatalogBase = {
  id: 'Test Focus',
  name: 'Test Focus',
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

function mod(
  id: string,
  kind: CatalogMod['kind'],
  group = id,
  overrides: Partial<CatalogMod> = {},
): CatalogMod {
  return {
    id,
    kind,
    name: id,
    group,
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
    ...overrides,
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
]

function catalog(baseOverride: Partial<CatalogBase> = {}, mods = modifiers): CraftCatalog {
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
    bases: [{ ...base, ...baseOverride }],
    modifiers: mods,
  }
}

function state(overrides: Partial<CraftState> = {}): CraftState {
  return {
    baseId: base.id,
    itemLevel: 70,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    ...overrides,
  }
}

const upgradedCurrencies = [
  ['greater_transmutation', 'transmutation', 'greater', 44, '高级蜕变石', 'normal'],
  ['perfect_transmutation', 'transmutation', 'perfect', 70, '完美蜕变石', 'normal'],
  ['greater_augmentation', 'augmentation', 'greater', 44, '高级增幅石', 'magic'],
  ['perfect_augmentation', 'augmentation', 'perfect', 70, '完美增幅石', 'magic'],
  ['greater_regal', 'regal', 'greater', 35, '高级富豪石', 'magic'],
  ['perfect_regal', 'regal', 'perfect', 50, '完美富豪石', 'magic'],
  ['greater_exalted', 'exalted', 'greater', 35, '高级崇高石', 'rare'],
  ['perfect_exalted', 'exalted', 'perfect', 50, '完美崇高石', 'rare'],
  ['greater_chaos', 'chaos', 'greater', 35, '高级混沌石', 'rare'],
  ['perfect_chaos', 'chaos', 'perfect', 50, '完美混沌石', 'rare'],
] as const

describe('已有普通孔状态', () => {
  it('拒绝超出非腐化已有孔范围或形状错误的状态，不以目录 socketLimit 放宽', () => {
    const source = catalog({ type: 'Helmet', socketLimit: 3 })
    for (const sockets of [[null, null, null], [42], [undefined], null, 'empty']) {
      expect(createCraftState(source, { ...state(), sockets } as CraftState).ok).toBe(false)
    }
  })

  it('深拷贝明确空孔并保留未建模与零孔的区别', () => {
    const source = catalog({ type: 'Helmet' })
    const initial = state({ sockets: [null] })
    const checked = createCraftState(source, initial)
    expect(checked.ok).toBe(true)
    if (!checked.ok) return
    expect(checked.value.sockets).toEqual([null])
    expect(checked.value.sockets).not.toBe(initial.sockets)
    const legacy = createCraftState(source, state())
    expect(legacy.ok && Object.hasOwn(legacy.value, 'sockets')).toBe(false)
    expect(createCraftState(source, state({ sockets: [] }))).toMatchObject({
      ok: true,
      value: { sockets: [] },
    })
  })
})

describe('品质状态', () => {
  it('接受并保留 0–30 整数，拒绝缺省范围外数值', () => {
    for (const quality of [0, 20, 30])
      expect(createCraftState(catalog(), state({ quality }))).toMatchObject({
        ok: true,
        value: { quality },
      })
    for (const quality of [-1, 20.5, 31, Number.NaN])
      expect(createCraftState(catalog(), state({ quality })).ok).toBe(false)
  })

  it('通货操作保留品质且不产生品质消耗', () => {
    const source = catalog({}, [mod('prefix', 'prefix')])
    const result = applyCraftOperation(source, state({ quality: 20 }), {
      currency: 'transmutation',
      modIds: ['prefix'],
    })
    expect(result).toMatchObject({ ok: true, value: { quality: 20 } })
  })
})

describe('高级与完美通货', () => {
  it.each(upgradedCurrencies)(
    '%s 按新增词缀等级筛选同族，并保留既有低档词缀',
    (currency, operation, _tier, minimum, _label, rarity) => {
      const low = mod('low', 'suffix', 'family', { level: minimum - 1 })
      const at = mod('at', 'suffix', 'family', { level: minimum })
      const above = mod('above', 'suffix', 'family', { level: minimum + 1 })
      const old = mod('old', 'prefix')
      const source = catalog({}, [low, at, above, old])
      const initial = state({
        rarity,
        itemLevel: minimum,
        affixes: rarity === 'normal' ? [] : [{ modId: 'old', lines: ['old 5'] }],
      })
      const removeModId = operation === 'chaos' ? 'old' : undefined
      const prepared = prepareCraftOperation(source, initial, currency, removeModId)
      expect(prepared.ok).toBe(true)
      if (!prepared.ok) return
      const candidates = craftCandidates(source, prepared.value.state, currency).map(
        (entry) => entry.id,
      )
      expect(candidates).toContain('at')
      expect(candidates).not.toContain('low')
      expect(candidates).not.toContain('above')
      expect(craftCandidates(source, prepared.value.state).map((entry) => entry.id)).toContain(
        'low',
      )
      const snapshot = structuredClone(initial)
      expect(
        applyCraftOperation(source, initial, {
          currency,
          modIds: ['low'],
          ...(removeModId ? { removeModId } : {}),
        }),
      ).toMatchObject({ ok: false })
      expect(initial).toEqual(snapshot)
      const result = applyCraftOperation(source, initial, {
        currency,
        modIds: ['at'],
        ...(removeModId ? { removeModId } : {}),
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.rarity).toBe(
          operation === 'transmutation' || operation === 'augmentation' ? 'magic' : 'rare',
        )
        expect(result.value.affixes.some((affix) => affix.modId === 'old')).toBe(
          rarity !== 'normal' && operation !== 'chaos',
        )
      }
    },
  )

  it('最低等级例外只保留各族当前物等内最高档，不受未来高档或另一侧同名组影响', () => {
    const source = catalog({}, [
      mod('mana-early', 'prefix', 'mana', { level: 40 }),
      mod('mana-current', 'prefix', 'mana', { level: 65 }),
      mod('mana-future', 'prefix', 'mana', { level: 81 }),
      mod('other-side', 'suffix', 'mana', { level: 48 }),
      mod('res-low', 'suffix', 'res', { level: 69 }),
      mod('res-at', 'suffix', 'res', { level: 70 }),
      mod('res-high', 'suffix', 'res', { level: 75 }),
    ])
    expect(
      craftCandidates(
        source,
        state({ rarity: 'magic', itemLevel: 80 }),
        'perfect_augmentation',
      ).map((entry) => entry.id),
    ).toEqual(['mana-current', 'other-side', 'res-at', 'res-high'])
  })

  it('族最高档先按基底资格与动态标签筛选，混沌移除后重算并释放原组', () => {
    const blocker = mod('blocker', 'prefix', 'family', { addsTags: ['blocked'] })
    const source = catalog({}, [
      blocker,
      mod('early', 'prefix', 'family', { level: 20 }),
      mod('current', 'prefix', 'family', { level: 33 }),
      mod('blocked-high', 'prefix', 'family', {
        level: 60,
        eligibility: [
          { tag: 'blocked', value: 0 },
          { tag: 'focus', value: 1 },
        ],
      }),
      mod('wrong-base', 'prefix', 'family', {
        level: 70,
        eligibility: [{ tag: 'default', value: 0 }],
      }),
      mod('tag-source', 'suffix', 'tag-source', { addsTags: ['blocked'] }),
    ])
    const initial = state({ rarity: 'rare', affixes: [{ modId: 'blocker', lines: ['blocker 5'] }] })
    expect(
      craftCandidates(source, initial, 'perfect_chaos').map((entry) => entry.id),
    ).not.toContain('current')
    const unblocked = prepareCraftOperation(source, initial, 'perfect_chaos', 'blocker')
    expect(unblocked.ok).toBe(true)
    if (unblocked.ok)
      expect(
        craftCandidates(source, unblocked.value.state, 'perfect_chaos').map((entry) => entry.id),
      ).toEqual(['blocked-high', 'tag-source'])
    const remainingBlocker = {
      ...initial,
      affixes: [...initial.affixes, { modId: 'tag-source', lines: ['tag-source 5'] }],
    }
    const result = applyCraftOperation(source, remainingBlocker, {
      currency: 'perfect_chaos',
      removeModId: 'blocker',
      modIds: ['current'],
    })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.value.affixes.map((entry) => entry.modId)).toEqual(['tag-source', 'current'])
  })

  it('升级通货保留容量、移除和数值参数门禁，空池失败不改变装备', () => {
    const full = state({
      rarity: 'rare',
      affixes: ['p1', 'p2', 'p3', 's1', 's2', 's3'].map((modId) => ({
        modId,
        lines: [`${modId} 5`],
      })),
    })
    expect(prepareCraftOperation(catalog(), full, 'perfect_exalted')).toEqual({
      ok: false,
      error: '稀有装备词缀已满。',
    })
    expect(prepareCraftOperation(catalog(), full, 'perfect_chaos')).toMatchObject({
      ok: false,
      error: expect.stringContaining('完美混沌石必须指定'),
    })
    expect(prepareCraftOperation(catalog(), full, 'greater_chaos', 'missing')).toMatchObject({
      ok: false,
      error: expect.stringContaining('不在当前装备'),
    })
    expect(prepareCraftOperation(catalog(), state(), 'greater_transmutation', 'p1')).toMatchObject({
      ok: false,
      error: expect.stringContaining('不接受移除'),
    })
    expect(
      applyCraftOperation(catalog(), full, {
        currency: 'perfect_chaos',
        removeModId: 'p1',
        modIds: ['p4'],
        implicitValues: [],
      }),
    ).toMatchObject({ ok: false })
    expect(
      prepareCraftOperation(catalog({}, []), state({ rarity: 'rare' }), 'perfect_exalted'),
    ).toMatchObject({ ok: false, error: expect.stringContaining('最低词缀等级 50') })
    const snapshot = structuredClone(full)
    expect(
      applyCraftOperation(catalog(), full, {
        currency: 'perfect_chaos',
        removeModId: 'p1',
        modIds: ['missing'],
      }),
    ).toMatchObject({ ok: false })
    expect(full).toEqual(snapshot)
  })

  it.each(upgradedCurrencies)(
    '%s 共享明确的基础操作、层级与等级门槛',
    (currency, base, tier, minModLevel, label) => {
      expect(CRAFT_CURRENCY_RULES?.[currency]).toEqual({ base, tier, minModLevel })
      expect(CRAFT_CURRENCY_LABELS[currency]).toBe(label)
    },
  )

  it.each(upgradedCurrencies)(
    '%s 拒绝装备物等低于门槛并保持原状态',
    (currency, _base, _tier, minimum, label, rarity) => {
      const initial = state({ rarity, itemLevel: minimum - 1 })
      const snapshot = structuredClone(initial)
      expect(prepareCraftOperation(catalog(), initial, currency)).toEqual({
        ok: false,
        error: `${label}要求物品等级至少 ${minimum}，当前为 ${minimum - 1}。`,
      })
      expect(craftCandidates(catalog(), initial, currency)).toEqual([])
      expect(initial).toEqual(snapshot)
    },
  )

  it.each(['greater_chaos', 'perfect_chaos'] as const)(
    '%s 可以选择移除已有低等级词缀，返回副本',
    (currency) => {
      const initial = state({ rarity: 'rare', affixes: [{ modId: 'p1', lines: ['p1 5'] }] })
      const removed = removableCraftAffixes(catalog(), initial, currency)
      expect(removed).toEqual({ ok: true, value: initial.affixes })
      if (removed.ok) expect(removed.value[0]?.lines).not.toBe(initial.affixes[0]?.lines)
      expect(removableCraftAffixes(catalog(), { ...initial, rarity: 'magic' }, currency)).toEqual({
        ok: false,
        error: `${CRAFT_CURRENCY_LABELS[currency]}只能用于稀有装备。`,
      })
    },
  )

  it.each(['unknown', '__proto__', 'constructor'])('未知通货 %s 安全失败', (invalid) => {
    const currency = invalid as CraftCurrency
    const current = state({ rarity: 'rare' })
    expect(craftCandidates(catalog(), current, currency)).toEqual([])
    expect(prepareCraftOperation(catalog(), current, currency)).toEqual({
      ok: false,
      error: '不支持的通货。',
    })
    expect(addCraftAffix(catalog(), current, 'p1', currency)).toMatchObject({ ok: false })
  })
})

describe('制作演练核心', () => {
  it('创建状态时复制输入并保留已有实际数值，不以当前物等拒绝高等级词缀', () => {
    const high = mod('high', 'prefix', 'high', { level: 80, lines: ['High (1-50)'] })
    const input = state({
      rarity: 'rare',
      itemLevel: 70,
      affixes: [{ modId: 'high', lines: ['High 42'] }],
      sourceText: 'original',
    })
    const result = createCraftState(catalog({}, [high]), input)
    expect(result).toEqual({ ok: true, value: input })
    if (!result.ok) return
    expect(result.value).not.toBe(input)
    expect(result.value.affixes).not.toBe(input.affixes)
    expect(result.value.affixes[0]?.lines).not.toBe(input.affixes[0]?.lines)
  })

  it('拒绝未知词缀、重复组和超出单侧容量的状态', () => {
    expect(
      createCraftState(
        catalog(),
        state({ rarity: 'magic', affixes: [{ modId: 'missing', lines: ['x'] }] }),
      ),
    ).toEqual({ ok: false, error: '词缀 missing 不在制作目录中。' })
    expect(
      createCraftState(
        catalog({}, [mod('a', 'prefix', 'same'), mod('b', 'suffix', 'same')]),
        state({
          rarity: 'rare',
          affixes: [
            { modId: 'a', lines: ['a 5'] },
            { modId: 'b', lines: ['b 5'] },
          ],
        }),
      ),
    ).toEqual({ ok: false, error: '词缀组 same 重复。' })
    expect(
      createCraftState(
        catalog(),
        state({
          rarity: 'magic',
          affixes: [
            { modId: 'p1', lines: ['p1 5'] },
            { modId: 'p2', lines: ['p2 5'] },
          ],
        }),
      ),
    ).toEqual({ ok: false, error: '魔法装备最多有 1 条前缀和 1 条后缀。' })
  })

  it.each([
    [{ type: 'Charm' }, '该基底类别暂不支持制作演练。'],
    [{ hidden: true }, '隐藏基底暂不支持制作演练。'],
    [{ variantList: ['A'] as string[] }, '带内部变体的基底暂不支持制作演练。'],
    [{ charmLimit: 2 }, '带特殊容量或跨类别规则的基底暂不支持制作演练。'],
    [{ runeforged: true }, '符文锻造基底暂不支持制作演练。'],
  ] as const)('保守拒绝只读或特殊基底 %#', (baseOverride, error) => {
    expect(createCraftState(catalog(baseOverride), state())).toEqual({ ok: false, error })
  })

  it.each([
    '-1 Suffix Modifier allowed',
    '-1 Prefix Modifier allowed',
    '+1 Prefix Modifier allowed\n-1 Suffix Modifier allowed',
    '-1 Prefix Modifier allowed\n+1 Suffix Modifier allowed',
    'Can roll Ring Modifiers\nCatalysts can be applied to this item',
  ])('拒绝改变词缀容量或跨类别词缀池的固有属性：%s', (implicit) => {
    expect(createCraftState(catalog({ implicit }), state())).toEqual({
      ok: false,
      error: '该基底的固有属性会改变词缀容量或类别规则，暂不支持制作演练。',
    })
  })

  it('允许已消歧 variant 元数据和基础精魂数值', () => {
    const variant = {
      visibility: 'visible' as const,
      declarations: [{ sourcePath: 'src/Data/Bases/focus.lua', index: 1, hidden: false }],
    }
    expect(createCraftState(catalog({ variant, spirit: 100 }), state())).toEqual({
      ok: true,
      value: state(),
    })
  })

  it('整组校验已有词缀行，接受目录范围和范围内实际值并拒绝缺行', () => {
    const multiline = mod('multi', 'prefix', 'multi', {
      lines: ['First (1-10)', 'Second (20-30)'],
      statOrder: [1, 2],
    })
    expect(
      createCraftState(
        catalog({}, [multiline]),
        state({ rarity: 'rare', affixes: [{ modId: 'multi', lines: ['Second 25', 'First 4'] }] }),
      ),
    ).toEqual({
      ok: true,
      value: state({
        rarity: 'rare',
        affixes: [{ modId: 'multi', lines: ['Second 25', 'First 4'] }],
      }),
    })
    expect(
      createCraftState(
        catalog({}, [multiline]),
        state({ rarity: 'rare', affixes: [{ modId: 'multi', lines: ['First 4'] }] }),
      ),
    ).toEqual({ ok: false, error: '词缀 multi 的属性行与制作目录不一致。' })
  })

  it('拒绝词缀属性行中未知的容量或跨类别规则', () => {
    const special = mod('special', 'prefix', 'special', {
      lines: ['+1 Suffix Modifier allowed'],
    })
    expect(
      createCraftState(
        catalog({}, [special]),
        state({
          rarity: 'rare',
          affixes: [{ modId: 'special', lines: ['+1 Suffix Modifier allowed'] }],
        }),
      ),
    ).toEqual({
      ok: false,
      error: '词缀 special 包含未支持的容量或跨类别规则。',
    })
  })

  it('已有负向动态标签不回溯生成资格且不依赖展示顺序', () => {
    const existing = mod('IgniteChanceIncrease1', 'suffix', 'IgniteChanceIncrease', {
      lines: ['(51-60)% increased Flammability Magnitude'],
      addsTags: ['no_cold_spell_mods', 'no_lightning_spell_mods', 'no_chaos_spell_mods'],
      eligibility: [
        { tag: 'no_fire_spell_mods', value: 0 },
        { tag: 'wand', value: 1 },
        { tag: 'default', value: 0 },
      ],
    })
    const added = mod(
      'PhysicalDamagePrefixOnWeapon1',
      'prefix',
      'PhysicalSpellDamageWeaponPrefix',
      {
        lines: ['(25-34)% increased Spell Physical Damage'],
        addsTags: [
          'no_fire_spell_mods',
          'no_cold_spell_mods',
          'no_lightning_spell_mods',
          'no_chaos_spell_mods',
        ],
        eligibility: [
          { tag: 'focus', value: 1 },
          { tag: 'no_physical_spell_mods', value: 0 },
          { tag: 'wand', value: 1 },
          { tag: 'default', value: 0 },
        ],
      },
    )
    const acrid = catalog(
      { id: 'Acrid Wand', name: 'Acrid Wand', type: 'Wand', tags: ['default', 'onehand', 'wand'] },
      [existing, added],
    )
    const initial = state({
      baseId: 'Acrid Wand',
      rarity: 'rare',
      itemLevel: 100,
      affixes: [{ modId: existing.id, lines: ['55% increased Flammability Magnitude'] }],
    })
    const result = applyCraftOperation(acrid, initial, {
      currency: 'exalted',
      modIds: [added.id],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(createCraftState(acrid, result.value)).toEqual({
      ok: true,
      value: result.value,
    })
    expect(
      createCraftState(acrid, { ...result.value, affixes: [...result.value.affixes].reverse() }),
    ).toEqual({
      ok: true,
      value: { ...result.value, affixes: [...result.value.affixes].reverse() },
    })
  })

  it('点金覆盖魔法旧词缀并要求精确新增四条', () => {
    const initial = state({ rarity: 'magic', affixes: [{ modId: 'p1', lines: ['p1 5'] }] })
    expect(prepareCraftOperation(catalog(), initial, 'alchemy')).toEqual({
      ok: true,
      value: { state: { ...initial, rarity: 'rare', affixes: [] }, count: 4 },
    })
    expect(
      applyCraftOperation(catalog(), initial, { currency: 'alchemy', modIds: ['p1'] }),
    ).toEqual({
      ok: false,
      error: '点金石必须指定 4 条词缀。',
    })
    expect(
      applyCraftOperation(catalog(), initial, {
        currency: 'alchemy',
        modIds: ['p1', 's1', 'p2', 's2'],
      }),
    ).toEqual({
      ok: true,
      value: {
        ...initial,
        rarity: 'rare',
        affixes: [
          { modId: 'p1', lines: ['p1 (1-10)'] },
          { modId: 's1', lines: ['s1 (1-10)'] },
          { modId: 'p2', lines: ['p2 (1-10)'] },
          { modId: 's2', lines: ['s2 (1-10)'] },
        ],
      },
    })
  })

  it('富豪保留实际值，新增词缀使用目录范围且多行仍算一条', () => {
    const multiline = mod('multi', 'suffix', 'multi', {
      lines: ['Line one (1-2)', 'Line two (3-4)'],
      statOrder: [1, 2],
    })
    const initial = state({ rarity: 'magic', affixes: [{ modId: 'p1', lines: ['p1 7'] }] })
    const result = applyCraftOperation(catalog({}, [...modifiers, multiline]), initial, {
      currency: 'regal',
      modIds: ['multi'],
    })
    expect(result).toEqual({
      ok: true,
      value: {
        ...initial,
        rarity: 'rare',
        affixes: [
          { modId: 'p1', lines: ['p1 7'] },
          { modId: 'multi', lines: ['Line one (1-2)', 'Line two (3-4)'] },
        ],
      },
    })
  })

  it('增幅只列未满一侧，崇高在双侧满槽时拒绝', () => {
    const magic = state({ rarity: 'magic', affixes: [{ modId: 'p1', lines: ['p1 5'] }] })
    const draft = prepareCraftOperation(catalog(), magic, 'augmentation')
    expect(draft.ok).toBe(true)
    if (draft.ok)
      expect(craftCandidates(catalog(), draft.value.state).map((entry) => entry.id)).toEqual([
        's1',
        's2',
        's3',
        's4',
      ])

    const full = state({
      rarity: 'rare',
      affixes: ['p1', 'p2', 'p3', 's1', 's2', 's3'].map((modId) => ({
        modId,
        lines: [`${modId} 5`],
      })),
    })
    expect(prepareCraftOperation(catalog(), full, 'exalted')).toEqual({
      ok: false,
      error: '稀有装备词缀已满。',
    })
  })

  it('候选保持目录资格顺序，并随负向标签和冲突组动态变化', () => {
    const seed = mod('seed', 'prefix', 'seed', { addsTags: ['no_fire'] })
    const fire = mod('fire', 'suffix', 'fire', {
      eligibility: [
        { tag: 'no_fire', value: 0 },
        { tag: 'focus', value: 1 },
        { tag: 'default', value: 0 },
      ],
    })
    const blockedByOrder = mod('blocked', 'suffix', 'blocked', {
      eligibility: [
        { tag: 'default', value: 0 },
        { tag: 'focus', value: 1 },
      ],
    })
    const grouped = mod('grouped', 'suffix', 'seed')
    const dynamicCatalog = catalog({}, [fire, blockedByOrder, grouped, seed])
    expect(
      craftCandidates(dynamicCatalog, state({ rarity: 'rare' })).map((entry) => entry.id),
    ).toEqual(['fire', 'grouped', 'seed'])
    const added = addCraftAffix(dynamicCatalog, state({ rarity: 'rare' }), 'seed')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(craftCandidates(dynamicCatalog, added.value)).toEqual([])
  })

  it('失败操作不改变输入，且通货稀有度条件明确', () => {
    const initial = state({ rarity: 'rare', affixes: [{ modId: 'p1', lines: ['p1 5'] }] })
    const snapshot = structuredClone(initial)
    expect(
      applyCraftOperation(catalog(), initial, { currency: 'exalted', modIds: ['p2', 's1'] }),
    ).toEqual({ ok: false, error: '崇高石必须指定 1 条词缀。' })
    expect(initial).toEqual(snapshot)
    const ordinary = state()
    const ordinarySnapshot = structuredClone(ordinary)
    expect(
      applyCraftOperation(catalog(), ordinary, {
        currency: 'alchemy',
        modIds: ['p1', 's1', 'p2', 'p1'],
      }),
    ).toEqual({ ok: false, error: '词缀 p1 当前不可添加。' })
    expect(ordinary).toEqual(ordinarySnapshot)
    expect(prepareCraftOperation(catalog(), initial, 'transmutation')).toEqual({
      ok: false,
      error: '蜕变石只能用于普通装备。',
    })
  })

  it('保留八种基础通货的共享中文名称', () => {
    expect(CRAFT_CURRENCY_LABELS).toMatchObject({
      transmutation: '蜕变石',
      augmentation: '增幅石',
      regal: '富豪石',
      alchemy: '点金石',
      exalted: '崇高石',
      chaos: '混沌石',
      annulment: '剥离石',
      divine: '神圣石',
    })
  })

  it('新词缀数值完整写入，保留旧值；旧操作仍保留目录范围', () => {
    const initial = state({ rarity: 'magic', affixes: [{ modId: 'p1', lines: ['p1 5'] }] })
    const result = applyCraftOperation(catalog(), initial, {
      currency: 'regal',
      modIds: ['s1'],
      rolls: [{ modId: 's1', values: [7] }],
    })
    expect(result).toEqual({
      ok: true,
      value: {
        ...initial,
        rarity: 'rare',
        affixes: [...initial.affixes, { modId: 's1', lines: ['s1 7(1-10)'] }],
      },
    })
  })

  it('固有属性必须整组对应基底并复制，可同时包含未掷范围和实值', () => {
    const source = catalog({ implicit: '+(10-20) Life\n15% Light' })
    const input = state({ implicitLines: ['15% Light', '+15(10-20) Life'] })
    const checked = createCraftState(source, input)
    expect(checked).toEqual({ ok: true, value: input })
    if (checked.ok) expect(checked.value.implicitLines).not.toBe(input.implicitLines)
    expect(createCraftState(source, state({ implicitLines: ['+15 Life'] })).ok).toBe(false)
    expect(createCraftState(source, state({ implicitLines: ['+25 Life', '15% Light'] })).ok).toBe(
      false,
    )
    expect(createCraftState(source, state({ implicitLines: ['+15.5 Life', '15% Light'] })).ok).toBe(
      true,
    )
    expect(
      createCraftState(source, state({ implicitLines: ['+(10-20) Life', '15% Light'] })).ok,
    ).toBe(true)
  })

  it('神圣同时改普通固有与显式范围，固定行原样保留，ID稀有度物等来源不变', () => {
    const multi = mod('multi', 'prefix', 'multi', {
      lines: ['First (1-10)', '15% increased Light Radius', 'Second (0.1-0.3)'],
    })
    const fixed = mod('fixed', 'suffix', 'fixed', { lines: ['10% Fixed'] })
    const source = catalog({ implicit: '+(10-20) Life\n15% Light' }, [multi, fixed])
    const initial = state({
      rarity: 'rare',
      sourceText: 'untouched',
      implicitLines: ['+14 Life', '15% Light'],
      affixes: [
        {
          modId: 'multi',
          lines: ['Second 0.2', '15% increased Light Radius (unscalable)', 'First 4'],
        },
        { modId: 'fixed', lines: ['10% Fixed'] },
      ],
    })
    expect(prepareCraftOperation(source, initial, 'divine')).toEqual({
      ok: true,
      value: { state: initial, count: 0 },
    })
    const result = applyCraftOperation(source, initial, {
      currency: 'divine',
      modIds: [],
      rolls: [{ modId: 'multi', values: [8, 0.3] }],
      implicitValues: [19],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      baseId: initial.baseId,
      rarity: initial.rarity,
      itemLevel: initial.itemLevel,
      sourceText: initial.sourceText,
      implicitLines: ['+19(10-20) Life', '15% Light'],
    })
    expect(result.value.affixes).toEqual([
      {
        modId: 'multi',
        lines: ['First 8(1-10)', '15% increased Light Radius (unscalable)', 'Second 0.3(0.1-0.3)'],
      },
      initial.affixes[1],
    ])
  })

  it('重复固定行也逐条保留原文尾注，不用同一行替代两行', () => {
    const source = catalog({ implicit: ['15% Light', '15% Light', '+(10-20) Life'].join('\n') })
    const initial = state({ implicitLines: ['15% Light', '15% Light (unscalable)', '+14 Life'] })
    expect(
      applyCraftOperation(source, initial, {
        currency: 'divine',
        modIds: [],
        implicitValues: [18],
      }),
    ).toEqual({
      ok: true,
      value: state({ implicitLines: ['15% Light', '15% Light (unscalable)', '+18(10-20) Life'] }),
    })
  })

  it('普通装备仅有固有范围也可神圣；无范围及授予技能基底明确拒绝', () => {
    expect(
      prepareCraftOperation(catalog({ implicit: '(5-5) Life' }), state(), 'divine'),
    ).toMatchObject({ ok: false, error: expect.stringContaining('范围') })
    expect(
      applyCraftOperation(catalog({ implicit: '+(10-20) Life' }), state(), {
        currency: 'divine',
        modIds: [],
        rolls: [],
        implicitValues: [12],
      }),
    ).toEqual({ ok: true, value: state({ implicitLines: ['+12(10-20) Life'] }) })
    expect(prepareCraftOperation(catalog(), state(), 'divine')).toMatchObject({
      ok: false,
      error: expect.stringContaining('范围'),
    })
    const wand = catalog({ implicit: 'Grants Skill: Level (1-20) Firebolt' })
    expect(
      prepareCraftOperation(
        wand,
        state({ rarity: 'rare', affixes: [{ modId: 'p1', lines: ['p1 5'] }] }),
        'divine',
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('技能') })
  })

  it('拒绝多余、缺少、重复或非法数值payload且失败不改输入', () => {
    const initial = state({
      rarity: 'rare',
      implicitLines: ['+15 Life'],
      affixes: [{ modId: 'p1', lines: ['p1 5'] }],
    })
    const source = catalog({ implicit: '+(10-20) Life' })
    const snapshot = structuredClone(initial)
    const invalid = [
      { currency: 'exalted', modIds: ['s1'], rolls: [] },
      { currency: 'exalted', modIds: ['s1'], rolls: [{ modId: 'p1', values: [5] }] },
      {
        currency: 'exalted',
        modIds: ['s1'],
        rolls: [
          { modId: 's1', values: [5] },
          { modId: 's1', values: [6] },
        ],
      },
      { currency: 'exalted', modIds: ['s1'], rolls: [{ modId: 's1', values: [Number.NaN] }] },
      { currency: 'exalted', modIds: ['s1'], implicitValues: [] },
      { currency: 'annulment', modIds: [], removeModId: 'p1', rolls: [] },
      { currency: 'annulment', modIds: [], removeModId: 'p1', implicitValues: [] },
      { currency: 'divine', modIds: [], rolls: [], implicitValues: [12] },
      { currency: 'divine', modIds: [], rolls: [{ modId: 'p1', values: [8] }] },
      {
        currency: 'divine',
        modIds: ['s1'],
        rolls: [{ modId: 'p1', values: [8] }],
        implicitValues: [12],
      },
      {
        currency: 'divine',
        modIds: [],
        removeModId: 'p1',
        rolls: [{ modId: 'p1', values: [8] }],
        implicitValues: [12],
      },
    ] as const
    for (const operation of invalid) {
      expect(
        applyCraftOperation(
          source,
          initial,
          structuredClone(operation) as unknown as import('./rehearsal').CraftOperation,
        ).ok,
      ).toBe(false)
      expect(initial).toEqual(snapshot)
    }
  })

  it('可移除列表复制返回已有完整词缀组', () => {
    const initial = state({
      rarity: 'rare',
      affixes: [
        { modId: 'p1', lines: ['p1 4'] },
        { modId: 's1', lines: ['s1 6'] },
      ],
    })
    const result = removableCraftAffixes(catalog(), initial, 'chaos')
    expect(result).toEqual({ ok: true, value: initial.affixes })
    if (!result.ok) return
    expect(result.value).not.toBe(initial.affixes)
    expect(result.value[0]?.lines).not.toBe(initial.affixes[0]?.lines)
  })

  it('剥离移除最后一组后保留原稀有度且不要求新增词缀', () => {
    const initial = state({
      rarity: 'magic',
      affixes: [{ modId: 'p1', lines: ['p1 4'] }],
      sourceText: 'source',
    })
    expect(prepareCraftOperation(catalog(), initial, 'annulment', 'p1')).toEqual({
      ok: true,
      value: { state: { ...initial, affixes: [] }, count: 0 },
    })
    expect(
      applyCraftOperation(catalog(), initial, {
        currency: 'annulment',
        removeModId: 'p1',
        modIds: [],
      }),
    ).toEqual({ ok: true, value: { ...initial, affixes: [] } })
  })

  it('满词缀混沌释放组和动态标签并允许同 ID 以目录范围重加', () => {
    const blocking = mod('p1', 'prefix', 'p1', { addsTags: ['no_fire'] })
    const fire = mod('fire', 'prefix', 'fire', {
      eligibility: [
        { tag: 'no_fire', value: 0 },
        { tag: 'focus', value: 1 },
        { tag: 'default', value: 0 },
      ],
    })
    const chaosCatalog = catalog({}, [blocking, fire, ...modifiers.slice(1)])
    const initial = state({
      rarity: 'rare',
      affixes: ['p1', 'p2', 'p3', 's1', 's2', 's3'].map((modId) => ({
        modId,
        lines: [`${modId} 5`],
      })),
    })
    const prepared = prepareCraftOperation(chaosCatalog, initial, 'chaos', 'p1')
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.value.count).toBe(1)
    expect(craftCandidates(chaosCatalog, prepared.value.state).map((mod) => mod.id)).toEqual([
      'p1',
      'fire',
      'p4',
    ])
    expect(
      applyCraftOperation(chaosCatalog, initial, {
        currency: 'chaos',
        removeModId: 'p1',
        modIds: ['p1'],
      }),
    ).toEqual({
      ok: true,
      value: {
        ...initial,
        affixes: [...initial.affixes.slice(1), { modId: 'p1', lines: ['p1 (1-10)'] }],
      },
    })
  })

  it('移除通货错误与旧通货额外参数均不改变输入', () => {
    const initial = state({ rarity: 'rare', affixes: [{ modId: 'p1', lines: ['p1 5'] }] })
    const snapshot = structuredClone(initial)
    expect(prepareCraftOperation(catalog(), initial, 'chaos')).toEqual({
      ok: false,
      error: '混沌石必须指定一个当前词缀。',
    })
    expect(prepareCraftOperation(catalog(), initial, 'chaos', 'missing')).toEqual({
      ok: false,
      error: '要移除的词缀 missing 不在当前装备上。',
    })
    expect(
      applyCraftOperation(catalog(), initial, {
        currency: 'chaos',
        removeModId: 'p1',
        modIds: ['missing'],
      }),
    ).toEqual({ ok: false, error: '词缀 missing 当前不可添加。' })
    for (const [currency, label] of [
      ['transmutation', '蜕变石'],
      ['augmentation', '增幅石'],
      ['regal', '富豪石'],
      ['alchemy', '点金石'],
      ['exalted', '崇高石'],
    ] as const) {
      expect(
        applyCraftOperation(catalog(), initial, {
          currency,
          removeModId: 'p1',
          modIds: ['p2'],
        }),
      ).toEqual({ ok: false, error: `${label}不接受移除词缀参数。` })
    }
    expect(initial).toEqual(snapshot)
    expect(removableCraftAffixes(catalog(), state({ rarity: 'magic' }), 'annulment')).toEqual({
      ok: false,
      error: '当前装备没有可移除的词缀。',
    })
    expect(removableCraftAffixes(catalog(), state({ rarity: 'magic' }), 'chaos')).toEqual({
      ok: false,
      error: '混沌石只能用于稀有装备。',
    })
  })
})

describe('定向预兆', () => {
  const rare = (ids: string[]) =>
    state({ rarity: 'rare', affixes: ids.map((id) => ({ modId: id, lines: [`${id} (1-10)`] })) })
  it.each(['sinistral', 'dextral'] as const)('%s 限制新增侧，移除后混沌可跨侧新增', (direction) => {
    const side = direction === 'sinistral' ? 'prefix' : 'suffix'
    const id = side === 'prefix' ? 'p1' : 's1'
    const other = side === 'prefix' ? 's2' : 'p2'
    expect(
      craftCandidates(catalog(), rare([]), 'exalted', `${direction}_exaltation`).every(
        (mod) => mod.kind === side,
      ),
    ).toBe(true)
    expect(
      applyCraftOperation(catalog(), rare(['p1', 's1']), {
        currency: 'annulment',
        modIds: [],
        removeModId: id,
        omen: `${direction}_annulment`,
      }).ok,
    ).toBe(true)
    expect(
      applyCraftOperation(catalog(), rare(['p1', 's1']), {
        currency: 'chaos',
        modIds: [other],
        removeModId: id,
        omen: `${direction}_erasure`,
      }).ok,
    ).toBe(true)
    expect(
      applyCraftOperation(catalog(), rare(['p1', 's1']), {
        currency: 'chaos',
        modIds: [other],
        removeModId: id === 'p1' ? 's1' : 'p1',
        omen: `${direction}_erasure`,
      }).ok,
    ).toBe(false)
  })
  it('指定侧满或为空不回退，拒绝非法组合', () => {
    expect(
      prepareCraftOperation(
        catalog(),
        rare(['p1', 'p2', 'p3']),
        'exalted',
        undefined,
        'sinistral_exaltation',
      ).ok,
    ).toBe(false)
    expect(
      removableCraftAffixes(catalog(), rare(['s1']), 'annulment', 'sinistral_annulment').ok,
    ).toBe(false)
    for (const omen of [
      null,
      [],
      'unknown',
      'dextral_erasure',
      ['sinistral_exaltation', 'dextral_exaltation'],
    ]) {
      expect(
        prepareCraftOperation(catalog(), rare([]), 'exalted', undefined, omen as never).ok,
      ).toBe(false)
      expect(craftCandidates(catalog(), rare([]), 'exalted', omen as never)).toEqual([])
    }
    expect(
      prepareCraftOperation(
        catalog(),
        rare([]),
        'perfect_exalted',
        undefined,
        'sinistral_exaltation',
      ).ok,
    ).toBe(false)
    expect(
      applyCraftOperation(catalog(), rare([]), {
        currency: 'exalted',
        modIds: ['s1'],
        omen: 'sinistral_exaltation',
      }).ok,
    ).toBe(false)
  })
})

it('定向混沌重算动态标签与混合组，保留技能品质孔位和旧值', () => {
  const blocking = mod('block', 'prefix', 'block', {
    addsTags: ['no_fire'],
    lines: ['Life (1-10)', 'Mana (1-10)'],
  })
  const fire = mod('fire', 'suffix', 'fire', {
    eligibility: [
      { tag: 'no_fire', value: 0 },
      { tag: 'focus', value: 1 },
    ],
  })
  const source = catalog({ implicit: 'Grants Skill: Level (1-20) Firebolt' }, [
    blocking,
    fire,
    ...modifiers,
  ])
  const initial = state({
    rarity: 'rare',
    quality: 20,
    sockets: [null],
    implicitLines: ['Grants Skill: Level 12 Firebolt'],
    affixes: [
      { modId: 'block', lines: ['Life 5', 'Mana 7'] },
      { modId: 's1', lines: ['s1 8'] },
    ],
  })
  expect(
    craftCandidates(source, initial, 'chaos', 'sinistral_erasure').map((mod) => mod.id),
  ).not.toContain('fire')
  const before = structuredClone(initial)
  const result = applyCraftOperation(source, initial, {
    currency: 'chaos',
    omen: 'sinistral_erasure',
    removeModId: 'block',
    modIds: ['fire'],
    rolls: [{ modId: 'fire', values: [9] }],
  })
  expect(result).toMatchObject({
    ok: true,
    value: {
      quality: 20,
      sockets: [null],
      implicitLines: initial.implicitLines,
      affixes: [{ modId: 's1', lines: ['s1 8'] }, { modId: 'fire' }],
    },
  })
  expect(initial).toEqual(before)
  expect(
    applyCraftOperation(source, initial, {
      currency: 'chaos',
      omen: 'sinistral_erasure',
      removeModId: 'block',
      modIds: ['fire'],
      rolls: [{ modId: 'fire', values: [99] }],
    }).ok,
  ).toBe(false)
  expect(initial).toEqual(before)
})

it('直接应用同样拒绝多预兆额外字段，不改变起点', () => {
  const initial = state({ rarity: 'rare' })
  for (const operation of [
    { currency: 'exalted', modIds: ['p1'], omen: null },
    { currency: 'exalted', modIds: ['p1'], omen: undefined },
    { currency: 'exalted', modIds: ['p1'], omen: ['sinistral_exaltation'] },
    {
      currency: 'exalted',
      modIds: ['p1'],
      omen: 'sinistral_exaltation',
      omens: ['dextral_exaltation'],
    },
    { currency: 'divine', modIds: [], omen: 'sinistral_exaltation' },
  ])
    expect(applyCraftOperation(catalog(), initial, operation as never).ok).toBe(false)
  expect(initial.affixes).toEqual([])
})
