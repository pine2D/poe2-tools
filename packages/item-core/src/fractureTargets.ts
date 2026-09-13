import type { CraftCatalog } from './catalog'
import type { CraftResult } from './rehearsal'
import type { CraftTargetAlternative } from './targets'

/** 调用方先校验主目标及替代档位；这里只校验破裂要求，不依赖当前装备状态。 */
export function validateCraftFractureTarget(
  catalog: CraftCatalog,
  ids: readonly string[],
  alternatives: readonly CraftTargetAlternative[],
  input: unknown,
): CraftResult<string> {
  if (typeof input !== 'string' || input.length === 0 || !ids.includes(input))
    return { ok: false, error: '破裂要求必须指向一个已选主目标 ID。' }
  const members = [
    input,
    ...(alternatives.find((entry) => entry.targetModId === input)?.modIds ?? []),
  ]
  for (const id of members) {
    const mod = catalog.modifiers.find((entry) => entry.id === id)
    if (!mod) return { ok: false, error: '破裂目标不在制作目录中。' }
    if (mod.desecratedOnly) return { ok: false, error: '亵渎专属目标及其接受档位不能要求破裂。' }
  }
  return { ok: true, value: input }
}
