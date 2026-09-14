import type { CatalogMod } from './catalog'

export const JEWEL_EFFECT_EMOTION_ID = 'Metadata/Items/Currency/EndgameDistilledEmotion2'

/** 精确工艺身份声明；相似语句不能打开侧别增效。 */
export function jewelEffectModKind(mod: CatalogMod): 'prefix' | 'suffix' | null {
  if (mod.jewelOnly !== true || mod.craftedOnly !== true || mod.desecratedOnly === true) return null
  for (const kind of ['prefix', 'suffix'] as const) {
    const opposite = kind === 'prefix' ? 'Suffix' : 'Prefix'
    if (
      mod.id === `CraftedJewel${opposite}Effect` &&
      mod.kind === kind &&
      mod.group === `Local${opposite}Effect` &&
      mod.lines.length === 1 &&
      mod.lines[0] === `(40-60)% increased Effect of ${opposite}es`
    )
      return kind
  }
  return null
}
