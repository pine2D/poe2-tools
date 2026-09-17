import type { CraftCatalog } from './catalog'
import {
  createInfluenceBoneVersionDetector,
  influenceBoneSourceError,
} from './influenceBoneProjectVersion'

export const EXTENDED_INFLUENCE_BONE_RULES_VERSION = 'basic-2026-09-17-v96'

export const requiresExtendedInfluenceBoneProjectVersion = createInfluenceBoneVersionDetector(
  [
    ["Medved's Tending", 'body armour', 'Soul'],
    ["Katla's Gloom", 'gloves', 'Decay'],
    ["Vorana's Carnage", 'helmet', 'Berserking'],
  ],
  /^(?:Soul|Decay|Berserk)Influence\w+$/,
)

export function extendedInfluenceBoneProjectCapabilityError(
  input: unknown,
  catalog: CraftCatalog,
): string | null {
  return requiresExtendedInfluenceBoneProjectVersion(input)
    ? influenceBoneSourceError(input, catalog)
    : null
}
