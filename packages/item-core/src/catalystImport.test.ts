import { describe, expect, it } from 'vitest'
import { estimateCatalystEffects } from './catalystEffects'
import { CATALYSTS, readCatalystQuality } from './catalystQuality'
import { catalog, dictionary, imported, parse, raw } from './catalystTestFixture'
import { inspectItem } from './export'
import { type CraftState, createCraftState } from './rehearsal'

describe('已有催化品质的高级文本', () => {
  it('品质属性独立分类并读取类型与数值，倍率不污染标签', () => {
    const item = parse()
    expect(item.diagnostics).toEqual([])
    expect(readCatalystQuality(item)).toMatchObject({
      ok: true,
      value: { id: 'Flesh', quality: 20 },
    })
    expect(item.mods[1]?.tags).toEqual(['Life'])
    expect(inspectItem(item, dictionary).exportText).toContain('— 20% Increased }')
    expect(inspectItem(item, dictionary).bridgeReasons).toContain(
      '催化品质或属性增效的 CoE 转接尚未验证。',
    )
  })

  it('导入基础值并只施加一次品质，品质不能成为普通防具品质', () => {
    const result = imported()
    if (!result.ok) throw new Error(result.error)
    expect(result.value.catalyst).toEqual({ id: 'Flesh', quality: 20 })
    expect(result.value.quality).toBeUndefined()
    expect(result.value.affixes[0]?.lines).toEqual(['+19(10-19) to maximum Life'])
    const estimate = estimateCatalystEffects(catalog, result.value, 'Flesh', 20)
    expect(estimate).toMatchObject({
      ok: true,
      value: {
        groups: expect.arrayContaining([
          expect.objectContaining({
            id: 'IncreasedLife1',
            lines: [expect.objectContaining({ after: '+22 to maximum Life' })],
          }),
        ]),
      },
    })
  })

  it('未知中文品质描述符保留，用户核对类型后才能导入', () => {
    const text = raw
      .replace('Item Class: Rings', '物品类别: 戒指')
      .replace('Rarity: Rare', '稀有度: 稀有')
      .replace('Quality (Life Modifiers)', '品质（待核对的生命类型）')
      .replace('+19(10-19) to maximum Life', '+19(10-19) 生命上限')
    expect(readCatalystQuality(parse(text))).toMatchObject({
      ok: true,
      value: { id: null, quality: 20 },
    })
    expect(imported(text)).toMatchObject({ ok: false, error: expect.stringContaining('类型') })
    expect(imported(text, 'Flesh')).toMatchObject({
      ok: true,
      value: { catalyst: { id: 'Flesh', quality: 20, declared: true } },
    })
    expect(imported(text, 'Bogus').ok).toBe(false)
    expect(imported(raw, 'Neural').ok).toBe(false)
  })

  it.each([
    raw.replace('+20%', '+21%'),
    raw.replace(
      'Quality (Life Modifiers): +20% (augmented)',
      'Quality (Life Modifiers): +20%\nQuality (Life Modifiers): +20%',
    ),
    raw.replace(
      'Quality (Life Modifiers): +20% (augmented)',
      'Quality (Life Modifiers): +20%\nQuality: +20%',
    ),
    raw.replace('20% Increased', '40% Increased'),
    raw.replace('20% Increased', '20% Other'),
    raw.replace('+19(10-19)', '+19'),
  ])('拒绝未核对的品质、叠加增效和缺基础范围', (text) => {
    expect(imported(text).ok).toBe(false)
  })

  it('13 类英文品质独立识别，未知描述符不猜测', () => {
    for (const definition of CATALYSTS) {
      expect(
        readCatalystQuality(
          parse(raw.replace('Life Modifiers', `${definition.descriptor} Modifiers`)),
        ),
      ).toMatchObject({
        ok: true,
        value: { id: definition.id, quality: 20 },
      })
    }
  })

  it('删除品质头不能掩盖增效，畸形词缀输入返回失败而不抛异常', () => {
    expect(
      imported(raw.replace('Quality (Life Modifiers): +20% (augmented)\n--------\n', '')).ok,
    ).toBe(false)
    const result = imported()
    if (!result.ok) throw new Error(result.error)
    expect(
      createCraftState(catalog, { ...result.value, affixes: [null] } as unknown as CraftState).ok,
    ).toBe(false)
  })

  it('相同基础起点可声明已有催化品质，类别、字段、上限严格校验', () => {
    const state = {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'normal' as const,
      sourceText: null,
      affixes: [],
      catalyst: { id: 'Flesh', quality: 20, declared: true as const },
    }
    expect(createCraftState(catalog, state).ok).toBe(true)
    for (const catalyst of [
      { id: 'Bogus', quality: 20 },
      { id: 'Flesh', quality: 51 },
      { id: 'Flesh', quality: 20, declared: false },
      { id: 'Flesh', quality: 20, extra: 1 },
    ]) {
      expect(
        createCraftState(catalog, {
          ...state,
          catalyst: catalyst as NonNullable<CraftState['catalyst']>,
        }).ok,
      ).toBe(false)
    }
    expect(createCraftState(catalog, { ...state, quality: 0 }).ok).toBe(false)
    expect(
      createCraftState(catalog, {
        ...state,
        baseId: 'Breach Ring',
        catalyst: { id: 'Flesh', quality: 40, declared: true },
      }).ok,
    ).toBe(true)
    expect(
      createCraftState(catalog, {
        ...state,
        baseId: 'Breach Ring',
        catalyst: { id: 'Flesh', quality: 71, declared: true },
      }).ok,
    ).toBe(false)
    expect(createCraftState(catalog, { ...state, baseId: 'Ruby' }).ok).toBe(true)
    expect(createCraftState(catalog, { ...state, baseId: 'Iron Hat' }).ok).toBe(false)
  })
})
