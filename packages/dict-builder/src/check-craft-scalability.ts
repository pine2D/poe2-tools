import {
  type CraftCatalog,
  STAT_SCALABILITY_SOURCE,
  statScalabilitySourceHash,
} from '@poe2-tools/item-core'

/** 独立审计已落盘目录，缺少对应时仍保留缺失，不猜测格式。 */
export function checkCraftScalability(catalog: CraftCatalog): { matched: number; missing: number } {
  const declarations = catalog.scalability ?? {}
  const matched = Object.keys(declarations).length
  const patterns = new Set([
    ...catalog.modifiers.flatMap((mod) => mod.lines),
    ...(catalog.corruptions ?? []).flatMap((mod) => mod.lines),
    ...(catalog.augments ?? []).flatMap((augment) => augment.lines),
    ...catalog.bases.flatMap((base) => base.implicit?.split('\n') ?? []),
  ])
  const missing = [...patterns].filter((line) => !Object.hasOwn(declarations, line)).length
  if (
    statScalabilitySourceHash(catalog) !== STAT_SCALABILITY_SOURCE.sha256 ||
    matched !== 3550 ||
    missing !== 288
  )
    throw new Error('缩放目录缺少固定来源或 3550 条对应／288 条未对应审计不匹配')
  for (const value of ['0.35', '0.4', '0.45', '0.5']) {
    const scalars = declarations[`Regenerate ${value}% of maximum Life per second`]
    if (
      scalars?.length !== 1 ||
      scalars[0]?.scalable !== true ||
      scalars[0].formats.length !== 1 ||
      scalars[0].formats[0] !== 'per_minute_to_per_second_2dp_if_required'
    )
      throw new Error(`重生符文 ${value} 缺少精确每分钟转每秒两位小数声明`)
  }
  return { matched, missing }
}
