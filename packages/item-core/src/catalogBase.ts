import type { CatalogBase } from './catalog'
import { matchesGrantedSkillImplicitLines } from './grantedSkills'

export function resolveCatalogBase(
  bases: readonly CatalogBase[],
  identifier: string,
  implicitLines: readonly string[] = [],
): { candidates: CatalogBase[]; selected: CatalogBase | null } {
  const exact = bases.find((base) => base.id === identifier)
  if (exact) return { candidates: [exact], selected: exact }
  let candidates = bases.filter((base) => base.name === identifier)
  if (candidates.length > 1 && implicitLines.length > 0) {
    const matches = candidates.filter((base) =>
      matchesGrantedSkillImplicitLines(
        base.implicit?.split('\n').filter((line) => line.trim()) ?? [],
        implicitLines,
      ),
    )
    // 当前快照可能与外来装备不同；不丢掉名字已识别、属性尚未对应的候选。
    if (matches.length > 0) candidates = matches
  }
  return { candidates, selected: candidates.length === 1 ? (candidates[0] ?? null) : null }
}
