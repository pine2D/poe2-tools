import type { CraftCatalog } from './catalog'
import { corruptionEntries } from './corruptionEnchantments'
import type { CraftState } from './rehearsal'

/** 面板读取共用的属性来源；保留层身份，不改变制作池与冲突规则。 */
export function modifierLayers(catalog: CraftCatalog, state: CraftState) {
  return [
    ...state.affixes.map((attribute) => ({
      layer: 'explicit' as const,
      attribute,
      mod: catalog.modifiers.find((mod) => mod.id === attribute.modId),
    })),
    ...corruptionEntries(state).map((attribute) => ({
      layer: 'corruption' as const,
      attribute,
      mod: catalog.corruptions?.find((mod) => mod.id === attribute.modId),
    })),
  ]
}
