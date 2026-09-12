export type EssenceOmen = 'sinistral_crystallisation' | 'dextral_crystallisation'

export const ESSENCE_OMEN_RULES: Record<EssenceOmen, { name: string; kind: 'prefix' | 'suffix' }> =
  {
    sinistral_crystallisation: { name: 'Omen of Sinistral Crystallisation', kind: 'prefix' },
    dextral_crystallisation: { name: 'Omen of Dextral Crystallisation', kind: 'suffix' },
  }

export function isEssenceOmen(value: unknown): value is EssenceOmen {
  return typeof value === 'string' && Object.hasOwn(ESSENCE_OMEN_RULES, value)
}
