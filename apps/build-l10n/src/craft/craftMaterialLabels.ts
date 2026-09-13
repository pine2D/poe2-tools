import { type CraftCatalog, type CraftMaterial, craftMaterials } from '@poe2-tools/item-core'

// 译名相同不代表同一种材料；报价与费用清单使用同一套可区分名称。
export function craftMaterialLabels(catalog: CraftCatalog, translations: Record<string, string>) {
  const groups = new Map<string, CraftMaterial[]>()
  for (const material of craftMaterials(catalog)) {
    const label =
      translations[material.name] ??
      catalog.localizedNames?.['zh-CN']?.[material.name] ??
      material.name
    groups.set(label, [...(groups.get(label) ?? []), material])
  }
  const labels = new Map<string, string>()
  for (const [label, materials] of groups) {
    for (const material of materials) {
      const discriminator =
        materials.filter((m) => m.name === material.name).length > 1 ? material.id : material.name
      labels.set(material.id, materials.length > 1 ? `${label}（${discriminator}）` : label)
    }
  }
  return (material: CraftMaterial) => labels.get(material.id) ?? material.name
}
