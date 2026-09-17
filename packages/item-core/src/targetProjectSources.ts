import { type CraftCatalog, hasExistingModEligibility } from './catalog'
import type { CraftProject } from './craftProject'
import { desecrationSourceHash } from './desecration'
import { essenceSourceHash, inspectEssences, supportedEssenceId } from './essences'
import { flaskSourceHash } from './flaskSource'
import { fluxEligibleModIds } from './fluxes'
import { jewelSourceHash } from './jewels'
import { liquidEmotionSourceHash } from './liquidEmotions'
import type { CraftResult } from './rehearsal'

type TargetSourceHashes = Partial<
  Pick<
    CraftProject,
    | 'flaskSourceHash'
    | 'essenceSourceHash'
    | 'desecrationSourceHash'
    | 'jewelSourceHash'
    | 'liquidEmotionSourceHash'
  >
>

/** 仅用于已验证输入的显式升级与方案移植；严格读取不补指纹。 */
export function targetProjectSourceHashes(
  catalog: CraftCatalog,
  baseId: string,
  ids: readonly string[],
): CraftResult<TargetSourceHashes> {
  const usage = targetProjectSourceUsage(catalog, baseId, ids)
  const hashes: TargetSourceHashes = {}
  for (const [required, key, hash] of [
    [usage.essence, 'essenceSourceHash', essenceSourceHash(catalog)],
    [usage.desecration, 'desecrationSourceHash', desecrationSourceHash(catalog)],
    [usage.liquid, 'liquidEmotionSourceHash', liquidEmotionSourceHash(catalog)],
    [usage.jewel, 'jewelSourceHash', jewelSourceHash(catalog)],
    [usage.flask, 'flaskSourceHash', flaskSourceHash(catalog)],
  ] as const) {
    if (!required) continue
    if (hash === null) return { ok: false, error: `目标项目缺少 ${key} 对应目录来源。` }
    hashes[key] = hash
  }
  return { ok: true, value: hashes }
}

/** 目标与失联引用的类型来源需求；判定不能依赖待核对指纹是否存在。 */
export function targetProjectSourceUsage(
  catalog: CraftCatalog,
  baseId: unknown,
  targetIds: readonly string[],
): { essence: boolean; desecration: boolean; liquid: boolean; jewel: boolean; flask: boolean } {
  const base = catalog.bases.find((entry) => entry.id === baseId)
  if (targetIds.length === 0)
    return {
      essence: false,
      desecration: false,
      liquid: false,
      jewel: false,
      flask: base?.type === 'Flask',
    }
  const referenced = new Set(targetIds)
  const mods = catalog.modifiers.filter((mod) => referenced.has(mod.id))
  const amulet = catalog.bases.find((entry) => entry.type === 'Amulet')
  const essenceIds = new Set([
    ...(catalog.essences ?? [])
      .filter((entry) => supportedEssenceId(entry.id))
      .flatMap((entry) => Object.values(entry.mods)),
    ...(amulet
      ? inspectEssences(catalog, amulet)
          .filter((entry) => supportedEssenceId(entry.essence.id) && entry.mod !== null)
          .map((entry) => entry.modId)
      : []),
  ])
  const flux = base ? fluxEligibleModIds(catalog, base) : null
  return {
    essence:
      base !== undefined &&
      mods.some((mod) => essenceIds.has(mod.id) && !hasExistingModEligibility(base, mod)),
    desecration: mods.some((mod) => mod.desecratedOnly),
    liquid: mods.some((mod) => mod.jewelOnly && mod.craftedOnly && !flux?.ordinary.has(mod.id)),
    jewel: mods.some((mod) => mod.jewelOnly),
    flask: base?.type === 'Flask' || mods.some((mod) => mod.flaskOnly),
  }
}
