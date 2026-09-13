import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog, boneState } from './boneTestFixture'
import { validateCraftFractureTarget } from './fractureTargets'
import { analyzeCraftTargets } from './targets'

it.each([5, 8])('OR 已接受破裂档位数值 %s 的主卡与成员原因一致', (value) => {
  const catalog = boneCatalog()
  required(catalog.modifiers.find((mod) => mod.id === 'prefix2')).group = 'prefix1'
  const state = boneState(['prefix2'])
  required(state.affixes[0]).lines = [`prefix2 ${value}`]
  required(state.affixes[0]).fractured = true
  const result = analyzeCraftTargets(
    catalog,
    state,
    ['prefix1'],
    [{ modId: 'prefix2', bounds: [{ index: 0, min: 8 }] }],
    [{ targetModId: 'prefix1', modIds: ['prefix2'] }],
    undefined,
    [],
    'prefix1',
  )
  expect(result).toMatchObject({
    ok: true,
    value: { targets: [{ matched: value === 8, fracture: { matched: true } }] },
  })
  if (!result.ok) return
  const target = required(result.value.targets[0])
  expect(target.reasons.join('')).not.toContain('其他组')
  for (const member of target.alternatives ?? [])
    expect(member.reasons.join('')).not.toContain('其他组')
  if (value === 5) {
    expect(target.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('下限'),
        expect.stringContaining('不能通过神圣'),
      ]),
    )
    expect(target.alternatives?.[1]?.reasons).toEqual(target.reasons)
  } else expect(target.reasons).toEqual([])
})

it.each(['normal', 'full'] as const)('开启破裂要求仍保留 %s 的准备提示', (kind) => {
  const catalog = boneCatalog()
  const state =
    kind === 'normal'
      ? { ...boneState(), rarity: 'normal' as const }
      : boneState(['prefix2', 'prefix3', 'prefix4', 'suffix1', 'suffix2', 'suffix3'])
  const reason =
    kind === 'normal' ? '普通装备需先使用通货提升稀有度。' : '当前前缀位置已满，需要先移除词缀。'
  const original = analyzeCraftTargets(catalog, state, ['prefix1'])
  expect(original).toMatchObject({ ok: true, value: { targets: [{ reasons: [reason] }] } })
  expect(
    analyzeCraftTargets(catalog, state, ['prefix1'], [], [], undefined, [], 'prefix1'),
  ).toMatchObject({
    ok: true,
    value: {
      targets: [
        {
          matched: false,
          reasons: expect.arrayContaining([reason, expect.stringContaining('破裂')]),
        },
      ],
    },
  })
})

it('独立校验拒绝非法输入及仅为接受项的 ID，不读取当前装备', () => {
  const catalog = boneCatalog()
  for (const input of [undefined, null, false, '', 1, [], {}, 'prefix2', 'missing'])
    expect(
      validateCraftFractureTarget(
        catalog,
        ['prefix1'],
        [{ targetModId: 'prefix1', modIds: ['prefix2'] }],
        input,
      ).ok,
    ).toBe(false)
  expect(validateCraftFractureTarget(catalog, ['prefix1'], [], 'prefix1')).toEqual({
    ok: true,
    value: 'prefix1',
  })
})

it('工艺精华和已有 Genesis 目标均可以破裂，未知数值仍不算完成', () => {
  const catalog = boneCatalog()
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  catalog.essences = [
    {
      id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
      name: 'Perfect Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Helmet: 'prefix1' },
    },
  ]
  const mod = required(catalog.modifiers[0])
  mod.eligibility = [
    { tag: 'genesis_tree_minion', value: 1 },
    { tag: 'default', value: 0 },
  ]
  const state = boneState(['prefix1'])
  required(state.affixes[0]).crafted = true
  required(state.affixes[0]).fractured = true
  const analyze = () =>
    analyzeCraftTargets(catalog, state, ['prefix1'], [], [], undefined, [], 'prefix1')
  expect(analyze()).toMatchObject({ ok: true, value: { targets: [{ matched: true }] } })
  required(catalog.bases[0]).type = 'Ring'
  required(catalog.bases[0]).tags.push('genesis_tree_minion')
  delete required(state.affixes[0]).crafted
  expect(analyze()).toMatchObject({ ok: true, value: { targets: [{ matched: true }] } })
  required(state.affixes[0]).lines = ['prefix1 (1-10)']
  delete required(state.affixes[0]).fractured
  expect(
    analyzeCraftTargets(
      catalog,
      state,
      ['prefix1'],
      [{ modId: 'prefix1', bounds: [{ index: 0, min: 5 }] }],
      [],
      undefined,
      [],
      'prefix1',
    ),
  ).toMatchObject({
    ok: true,
    value: { targets: [{ matched: false, numeric: [{ actual: null, matched: false }] }] },
  })
})

it('数值达标未破裂仍未完成，且不误建议神圣；未指定要求保持旧形状', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1'])
  const values = [{ modId: 'prefix1', bounds: [{ index: 0, min: 5 }] }]
  const old = analyzeCraftTargets(catalog, state, ['prefix1'], values)
  expect(old).toMatchObject({ ok: true, value: { targets: [{ matched: true }] } })
  if (old.ok) expect(old.value.targets[0]).not.toHaveProperty('fracture')
  const result = analyzeCraftTargets(
    catalog,
    state,
    ['prefix1'],
    values,
    [],
    undefined,
    [],
    'prefix1',
  )
  expect(result).toMatchObject({
    ok: true,
    value: {
      targets: [{ matched: false, fracture: { required: true, matched: false } }],
      steps: [],
    },
  })
})

it('OR 接受档位已锁定可以满足主目标，主卡与成员均展示要求', () => {
  const catalog = boneCatalog()
  required(catalog.modifiers.find((m) => m.id === 'prefix2')).group = 'prefix1'
  const state = boneState(['prefix2'])
  required(state.affixes[0]).fractured = true
  const result = analyzeCraftTargets(
    catalog,
    state,
    ['prefix1'],
    [],
    [{ targetModId: 'prefix1', modIds: ['prefix2'] }],
    undefined,
    [],
    'prefix1',
  )
  expect(result).toMatchObject({
    ok: true,
    value: {
      targets: [
        {
          matched: true,
          fracture: { required: true, matched: true },
          alternatives: [
            { matched: false, fracture: { required: true, matched: false } },
            { matched: true, fracture: { required: true, matched: true } },
          ],
        },
      ],
    },
  })
})

it('数值不足未锁定继续建议神圣；已锁错误值和其他组说明不可达', () => {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'suffix1'])
  const analyze = () =>
    analyzeCraftTargets(
      catalog,
      state,
      ['prefix1'],
      [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
      [],
      undefined,
      [],
      'prefix1',
    )
  expect(analyze()).toMatchObject({
    ok: true,
    value: {
      targets: [{ matched: false }],
      steps: expect.arrayContaining([expect.objectContaining({ currency: 'divine' })]),
    },
  })
  required(state.affixes[0]).fractured = true
  expect(analyze()).toMatchObject({
    ok: true,
    value: {
      targets: [
        { matched: false, reasons: expect.arrayContaining([expect.stringContaining('锁定')]) },
      ],
      steps: [],
    },
  })
  delete required(state.affixes[0]).fractured
  required(state.affixes[1]).fractured = true
  expect(analyze()).toMatchObject({
    ok: true,
    value: {
      targets: [
        { matched: false, reasons: expect.arrayContaining([expect.stringContaining('一组')]) },
      ],
    },
  })
})

it('亵渎专属主目标及接受项不能要求破裂，普通身份当前亵渎仅状态受限', () => {
  const catalog = boneCatalog()
  const analyze = (id: string, alternatives: { targetModId: string; modIds: string[] }[] = []) =>
    analyzeCraftTargets(catalog, boneState(), [id], [], alternatives, undefined, [], id)
  expect(analyze('exclusive1')).toMatchObject({ ok: false, error: expect.stringContaining('亵渎') })
  required(catalog.modifiers.find((m) => m.id === 'exclusive1')).group = 'suffix1'
  expect(analyze('suffix1', [{ targetModId: 'suffix1', modIds: ['exclusive1'] }])).toMatchObject({
    ok: false,
    error: expect.stringContaining('亵渎'),
  })
  const state = boneState(['prefix1'])
  required(state.affixes[0]).desecrated = true
  expect(
    analyzeCraftTargets(catalog, state, ['prefix1'], [], [], undefined, [], 'prefix1'),
  ).toMatchObject({
    ok: true,
    value: {
      targets: [
        { matched: false, reasons: expect.arrayContaining([expect.stringContaining('亵渎')]) },
      ],
    },
  })
})
