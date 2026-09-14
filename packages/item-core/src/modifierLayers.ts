import type { CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'

/** 面板读取共用的属性来源；保留层身份，不改变制作池与冲突规则。 */
export function modifierLayers(catalog: CraftCatalog, state: CraftState) {
  return [
    ...state.affixes.map((attribute) => ({
      layer: 'explicit' as const,
      attribute,
      mod: catalog.modifiers.find((mod) => mod.id === attribute.modId),
    })),
    ...(state.corruption
      ? [
          {
            layer: 'corruption' as const,
            attribute: state.corruption,
            mod: catalog.corruptions?.find((mod) => mod.id === state.corruption?.modId),
          },
        ]
      : []),
  ]
}
