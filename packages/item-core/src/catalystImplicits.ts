import type { CatalogBase } from './catalog'
import type { CraftResult, CraftState } from './rehearsal'
import { isSkillVariantAmulet, resolveSkillVariantImplicitPatterns } from './skillVariantAmulets'

/** 技能项链只投影当前唯一技能；固定容量与技能状态均不接受催化缩放。 */
export function catalystImplicitPatterns(
  base: CatalogBase,
  state: Pick<CraftState, 'implicitLines'>,
): CraftResult<{ patterns: string[]; tags: string[][]; fixed: boolean }> {
  if (isSkillVariantAmulet(base)) {
    const resolved = resolveSkillVariantImplicitPatterns(base, state.implicitLines ?? [])
    return resolved.ok
      ? {
          ok: true,
          value: {
            patterns: resolved.value,
            tags: resolved.value.map(() => []),
            fixed: true,
          },
        }
      : resolved
  }
  return {
    ok: true,
    value: { patterns: base.implicit?.split('\n') ?? [], tags: base.implicitTags, fixed: false },
  }
}
