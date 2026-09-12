import { describe, expect, it } from 'vitest'
import type { CatalogBase } from './catalog'
import { searchBases } from './catalog'
import { resolveCatalogBase } from './catalogBase'

const base: CatalogBase = {
  id: 'ring:fire-cold',
  name: 'Test Ring',
  type: 'Ring',
  tags: ['ring', 'default'],
  requirements: {},
  properties: {},
  implicit: '+(12-16)% to Fire and Cold Resistances',
  implicitTags: [],
  sourceQuality: null,
  socketLimit: null,
  hidden: false,
  runeforged: false,
}
const variants = [
  base,
  { ...base, id: 'ring:fire-lightning', implicit: '+(12-16)% to Fire and Lightning Resistances' },
]

describe('基底变体搜索与导入定位', () => {
  it('名称与中文译名搜索全部同名变体，不把内容ID作为名称', () => {
    expect(searchBases(variants, '测试戒指', { 'Test Ring': '测试戒指' })).toHaveLength(2)
    expect(searchBases(variants, 'fire-cold', {})).toHaveLength(0)
  })
  it('仅名称保持候选，具体ID代表已选择，完整固有属性可以唯一消歧', () => {
    expect(resolveCatalogBase(variants, 'Test Ring')).toEqual({
      candidates: variants,
      selected: null,
    })
    expect(resolveCatalogBase(variants, base.id).selected).toBe(base)
    expect(
      resolveCatalogBase(variants, 'Test Ring', ['+14(12-16)% to Fire and Cold Resistances'])
        .selected,
    ).toBe(base)
    expect(resolveCatalogBase(variants, 'Test Ring', []).selected).toBeNull()
    expect(resolveCatalogBase(variants, 'Unknown').candidates).toEqual([])
  })
  it('固有属性不对应或不能区分面板变体时保留待选，不用等级猜选', () => {
    expect(
      resolveCatalogBase(variants, 'Test Ring', ['+17(12-16)% to Fire and Cold Resistances'])
        .selected,
    ).toBeNull()
    const numeric = {
      ...base,
      id: 'ring:higher',
      requirements: { level: 50 },
      properties: { Armour: 90 },
    }
    expect(
      resolveCatalogBase([base, numeric], 'Test Ring', ['+14(12-16)% to Fire and Cold Resistances'])
        .candidates,
    ).toHaveLength(2)
  })
  it('隐藏条目不进入普通搜索，但导入现有装备可按完整隐式定位以供对比', () => {
    const hidden = { ...base, hidden: true }
    expect(searchBases([hidden], 'Test Ring', {})).toEqual([])
    expect(resolveCatalogBase([hidden], 'Test Ring').selected).toBe(hidden)
  })
})
