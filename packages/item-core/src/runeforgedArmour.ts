import type { CatalogBase } from './catalog'

const CLASS_TAGS: Readonly<Record<string, string>> = {
  Helmet: 'helmet',
  'Body Armour': 'body_armour',
  Gloves: 'gloves',
  Boots: 'boots',
  Shield: 'shield',
  Buckler: 'buckler',
  Focus: 'focus',
}

/** 只核对已有防具身份，不从名称构造锻造转换关系。 */
export function isRuneforgedArmourBase(base: CatalogBase): boolean {
  const tag = CLASS_TAGS[base.type]
  return (
    base.runeforged &&
    !base.hidden &&
    base.variantList === undefined &&
    tag !== undefined &&
    base.tags.includes(tag) &&
    base.tags.includes('armour') &&
    base.tags.includes('runeforged') &&
    !/Can roll .+ Modifiers|Catalysts can be applied|Quality has/i.test(base.implicit ?? '')
  )
}
