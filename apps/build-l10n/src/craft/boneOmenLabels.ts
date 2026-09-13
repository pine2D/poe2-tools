import {
  BONE_DIRECTION_OMEN_RULES,
  BONE_LICH_OMEN_RULES,
  BONE_REVEAL_OMEN_RULES,
  type BoneOmenConfig,
  type BoneRevealOmen,
  type CraftCatalog,
} from '@poe2-tools/item-core'

/** 手工草稿、历史与路线读取同一份配置，普通通货预兆不走此分支。 */
export function boneOmenLabels(
  config: BoneOmenConfig,
  catalog: CraftCatalog,
  translations: Record<string, string>,
): { id: string; label: string }[] {
  return [
    ...(config.directionOmen
      ? [{ id: config.directionOmen, name: BONE_DIRECTION_OMEN_RULES[config.directionOmen].name }]
      : []),
    ...(config.lichOmen
      ? [{ id: config.lichOmen, name: BONE_LICH_OMEN_RULES[config.lichOmen].name }]
      : []),
  ].map(({ id, name }) => ({
    id,
    label: translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name,
  }))
}

export function boneRevealOmenLabel(
  omen: BoneRevealOmen,
  catalog: CraftCatalog,
  translations: Record<string, string>,
): string {
  const name = BONE_REVEAL_OMEN_RULES[omen].name
  return translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
}
