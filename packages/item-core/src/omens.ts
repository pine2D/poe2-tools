import type { CraftCurrency } from './rehearsal'

export type CraftOmen =
  | 'sinistral_exaltation'
  | 'dextral_exaltation'
  | 'sinistral_annulment'
  | 'dextral_annulment'
  | 'sinistral_erasure'
  | 'dextral_erasure'

export const CRAFT_OMEN_RULES: Record<
  CraftOmen,
  {
    name: string
    currency: 'exalted' | 'annulment' | 'chaos'
    kind: 'prefix' | 'suffix'
    effect: 'add' | 'remove'
  }
> = {
  sinistral_exaltation: {
    name: 'Omen of Sinistral Exaltation',
    currency: 'exalted',
    kind: 'prefix',
    effect: 'add',
  },
  dextral_exaltation: {
    name: 'Omen of Dextral Exaltation',
    currency: 'exalted',
    kind: 'suffix',
    effect: 'add',
  },
  sinistral_annulment: {
    name: 'Omen of Sinistral Annulment',
    currency: 'annulment',
    kind: 'prefix',
    effect: 'remove',
  },
  dextral_annulment: {
    name: 'Omen of Dextral Annulment',
    currency: 'annulment',
    kind: 'suffix',
    effect: 'remove',
  },
  sinistral_erasure: {
    name: 'Omen of Sinistral Erasure',
    currency: 'chaos',
    kind: 'prefix',
    effect: 'remove',
  },
  dextral_erasure: {
    name: 'Omen of Dextral Erasure',
    currency: 'chaos',
    kind: 'suffix',
    effect: 'remove',
  },
}

export function isCraftOmen(value: unknown): value is CraftOmen {
  return typeof value === 'string' && Object.hasOwn(CRAFT_OMEN_RULES, value)
}

export function craftOmenError(omen: unknown, currency: CraftCurrency | undefined): string | null {
  if (omen === undefined) return null
  if (!isCraftOmen(omen)) return '预兆必须是当前支持的单枚定向预兆。'
  if (CRAFT_OMEN_RULES[omen].currency !== currency) return '该预兆只能搭配对应的基础通货。'
  return null
}
