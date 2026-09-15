import {
  BONE_RULES,
  CRAFT_CURRENCY_LABELS,
  type CraftCatalog,
  type CraftOmen,
  type CraftStep,
  craftOmenMaterials,
  ESSENCE_OMEN_RULES,
  type EssenceOmen,
  FLUXES,
} from '@poe2-tools/item-core'
import { boneOmenLabels, boneRevealOmenLabel } from './boneOmenLabels'

export function craftStepLabel(
  catalog: CraftCatalog,
  translations: Record<string, string>,
  step: CraftStep,
): string {
  const omenLabel = (id: CraftOmen) =>
    craftOmenMaterials(id)
      .map((name) => translations[name] ?? name)
      .join(' + ')
  const essenceOmenLabel = (id: EssenceOmen) =>
    translations[ESSENCE_OMEN_RULES[id].name] ?? ESSENCE_OMEN_RULES[id].name
  const essenceLabel = (id: string) => {
    const name = catalog.essences?.find((entry) => entry.id === id)?.name ?? id
    return translations[name] ?? name
  }
  const fractureLabel =
    translations['Fracturing Orb'] ??
    catalog.localizedNames?.['zh-CN']?.['Fracturing Orb'] ??
    'Fracturing Orb'

  if (!('kind' in step))
    return CRAFT_CURRENCY_LABELS[step.currency] + (step.omen ? ` + ${omenLabel(step.omen)}` : '')
  if (step.kind === 'fracture') return fractureLabel
  if (step.kind === 'extraction') return '萃取石'
  if (step.kind === 'perfect-flux') return '完美溶剂'
  if (step.kind === 'flux') {
    const name = FLUXES.find((f) => f.id === step.fluxId)?.name ?? step.fluxId
    return translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  }
  if (step.kind === 'alloy') {
    const name =
      catalog.alloys?.alloys.find((entry) => entry.id === step.alloyId)?.name ?? step.alloyId
    return translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  }
  if (step.kind === 'liquid-emotion') {
    const name =
      catalog.liquidEmotions?.find((entry) => entry.id === step.emotionId)?.name ?? step.emotionId
    return translations[name] ?? catalog.localizedNames?.['zh-CN']?.[name] ?? name
  }
  if (step.kind === 'essence') {
    return essenceLabel(step.essenceId) + (step.omen ? ` + ${essenceOmenLabel(step.omen)}` : '')
  }
  if (step.kind === 'desecrate')
    return [
      translations[BONE_RULES[step.boneId].name] ??
        catalog.localizedNames?.['zh-CN']?.[BONE_RULES[step.boneId].name] ??
        BONE_RULES[step.boneId].name,
      ...boneOmenLabels(step, catalog, translations).map((entry) => entry.label),
    ].join(' + ')
  if (step.kind === 'desecration-offer')
    return (
      '固定三项亵渎候选' +
      (step.revealOmen ? ` + ${boneRevealOmenLabel(step.revealOmen, catalog, translations)}` : '')
    )
  if (step.kind === 'desecration-reroll') return '重选第二组三项候选'
  if (step.kind === 'desecration-reveal') return '完成亵渎揭示'
  if (step.kind === 'architect')
    return step.outcome === 'destroy' ? '建筑师宝珠：摧毁物品' : '建筑师宝珠：新增腐化强化'
  if (step.kind === 'vaal')
    return `瓦尔石：${step.outcome === 'socket' ? '腐化增加一孔' : step.outcome === 'enchant' ? '新增腐化强化' : step.outcome === 'reroll' ? `重选词缀（${step.replacements.length} 次替换）` : '腐化但属性不变'}`
  if (step.kind === 'artificer') return translations["Artificer's Orb"] ?? '巧匠石'
  const name = catalog.augments?.find((entry) => entry.id === step.augmentId)?.name ?? '符文镶嵌'
  return translations[name] ?? name
}
