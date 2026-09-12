import { boneCatalog } from './boneTestFixture'
import type { CatalogBase } from './catalog'
import { type ItemDictionary, inspectItem } from './export'
import { parseItem } from './parse'
import type { CraftState } from './rehearsal'

export function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('合成夹具缺失')
  return value
}

/** 纯合成腰带，复用合成词缀，不包含真实目录记录。 */
export function beltCatalog(fixed = false) {
  const catalog = boneCatalog('Belt')
  const base: CatalogBase = required(catalog.bases[0])
  base.charmLimit = 0
  base.socketLimit = 0
  base.implicit = `${fixed ? 'Has 1 Charm Slot' : 'Has (1-3) Charm Slot'}\n(10-20)% increased Flask Charges gained`
  return catalog
}

export function beltSource(
  locale: 'en' | 'zh-CN' | 'zh-TW' = 'en',
  slot = '2(1-2)',
  itemLevel = 80,
) {
  const english = locale === 'en'
  const tw = locale === 'zh-TW'
  const slotLine = english
    ? `Has ${slot} Charm Slots`
    : tw
      ? `有 ${slot} 個護符欄位`
      : `具有 ${slot} 个咒符栏`
  const other = english
    ? '15(10-20)% increased Flask Charges gained'
    : tw
      ? '增加 15(10-20)% 藥劑充能獲取'
      : '药剂充能获取提高 15(10-20)%'
  const dictionary: ItemDictionary = {
    items: { bases: { 'Synthetic Base': tw ? '合成腰帶' : '合成腰带' }, uniques: {} },
    stats: {
      entries: [
        { id: 'charm', en: 'Has # Charm Slot', text: tw ? '有 # 個護符欄位' : '具有 # 个咒符栏' },
        {
          id: 'flask',
          en: '#% increased Flask Charges gained',
          text: tw ? '增加 #% 藥劑充能獲取' : '药剂充能获取提高 #%',
        },
      ],
    },
  }
  const text = english
    ? `Item Class: Belts\nRarity: Normal\nSynthetic Base\n--------\nItem Level: ${itemLevel}\n--------\n{ Implicit Modifier }\n${slotLine}\n${other}`
    : `${tw ? '物品種類: 腰帶\n稀有度: 普通\n合成腰帶' : '物品类别: 腰带\n稀有度: 普通\n合成腰带'}\n--------\n${tw ? '物品等級' : '物品等级'}: ${itemLevel}\n--------\n{ ${tw ? '基底屬性' : '基底属性'} }\n${slotLine}\n${other}`
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  return { item: parsed.item, inspection: inspectItem(parsed.item, dictionary), dictionary }
}
export function beltState(itemLevel = 30): CraftState {
  return {
    baseId: 'Synthetic Base',
    itemLevel,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
    implicitLines: [
      `Has 1(1-${itemLevel < 30 ? 1 : itemLevel < 60 ? 2 : 3}) Charm Slot`,
      '(10-20)% increased Flask Charges gained',
    ],
  }
}
