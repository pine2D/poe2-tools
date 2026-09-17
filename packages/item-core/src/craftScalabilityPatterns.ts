import type { CatalogAugment, CraftCatalog } from './catalog'

/** 固定源用同一整数及连续小数 statOrder 标明多行属性，独立属性不能拼接。 */
function effectPatterns(effect: Pick<CatalogAugment, 'lines' | 'statOrder'>): string[] {
  const patterns = [...effect.lines]
  for (let start = 0; start < effect.lines.length; start++) {
    const order = effect.statOrder[start]
    if (order === undefined || !Number.isInteger(order)) continue
    let end = start + 1
    while (
      end < effect.lines.length &&
      end - start < 10 &&
      effect.statOrder[end] === order + (end - start) / 10
    )
      end++
    if (end - start > 1) patterns.push(effect.lines.slice(start, end).join('\n'))
  }
  return patterns
}

/** 生成与离线审计必须覆盖相同文本；多行组补充声明，不删除已有逐行声明。 */
export function craftScalabilityPatterns(
  catalog: Pick<CraftCatalog, 'modifiers' | 'corruptions' | 'augments' | 'bases'>,
): string[] {
  return [
    ...new Set([
      ...catalog.modifiers.flatMap((mod) => mod.lines),
      ...(catalog.corruptions ?? []).flatMap((mod) => mod.lines),
      ...(catalog.augments ?? []).flatMap((augment) => [
        ...effectPatterns(augment),
        ...(augment.bonded ? effectPatterns(augment.bonded) : []),
      ]),
      ...catalog.bases.flatMap((base) => base.implicit?.split('\n') ?? []),
    ]),
  ]
}
