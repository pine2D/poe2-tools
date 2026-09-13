import type { CatalogLiquidEmotion } from '@poe2-tools/item-core'
import type { LuaTable } from './restrictedLua'

/** 引用核对使用完整 ModJewel 声明，不把材料专属词缀加入普通生成池。 */
export function auditLiquidEmotionMappings(
  emotions: readonly CatalogLiquidEmotion[],
  rawJewelMods: LuaTable,
): {
  basic: number
  radius: number
  mappings: number
  basicMappings: number
  radiusMappings: number
  modIds: string[]
} {
  const modIds = new Set<string>()
  let basicMappings = 0
  let radiusMappings = 0
  for (const emotion of emotions) {
    for (const [category, effects] of Object.entries(emotion.mods)) {
      for (const [kind, id] of Object.entries(effects)) {
        const mod = Object.hasOwn(rawJewelMods, id) ? rawJewelMods[id] : undefined
        if (
          !mod ||
          typeof mod !== 'object' ||
          Array.isArray(mod) ||
          mod.type !== (kind === 'prefix' ? 'Prefix' : 'Suffix') ||
          (!emotion.radiusJewel && mod.nodeType !== undefined)
        )
          throw new Error(`液态情感词缀引用不匹配：${emotion.id} / ${category} / ${kind} / ${id}`)
        modIds.add(id)
        if (emotion.radiusJewel) radiusMappings += 1
        else basicMappings += 1
      }
    }
  }
  const radius = emotions.filter((emotion) => emotion.radiusJewel).length
  return {
    basic: emotions.length - radius,
    radius,
    mappings: basicMappings + radiusMappings,
    basicMappings,
    radiusMappings,
    modIds: [...modIds].sort(),
  }
}
