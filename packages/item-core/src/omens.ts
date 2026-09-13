import type { CraftCurrency } from './rehearsal'

/** 制作配置 ID；双枚配置的实际材料由 craftOmenMaterials 展开。 */
export type CraftOmen =
  | 'greater_exaltation'
  | 'greater_sinistral_exaltation'
  | 'greater_dextral_exaltation'
  | 'light'
  | 'whittling'
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
    kind: 'prefix' | 'suffix' | null
    effect: 'add' | 'remove'
    addCount?: 2
    materials?: readonly string[]
  }
> = {
  greater_exaltation: {
    name: 'Omen of Greater Exaltation',
    currency: 'exalted',
    kind: null,
    effect: 'add',
    addCount: 2,
  },
  greater_sinistral_exaltation: {
    name: 'Omen of Greater Exaltation + Omen of Sinistral Exaltation',
    currency: 'exalted',
    kind: 'prefix',
    effect: 'add',
    addCount: 2,
    materials: ['Omen of Greater Exaltation', 'Omen of Sinistral Exaltation'],
  },
  greater_dextral_exaltation: {
    name: 'Omen of Greater Exaltation + Omen of Dextral Exaltation',
    currency: 'exalted',
    kind: 'suffix',
    effect: 'add',
    addCount: 2,
    materials: ['Omen of Greater Exaltation', 'Omen of Dextral Exaltation'],
  },
  light: {
    name: 'Omen of Light',
    currency: 'annulment',
    kind: null,
    effect: 'remove',
  },
  whittling: {
    name: 'Omen of Whittling',
    currency: 'chaos',
    kind: null,
    effect: 'remove',
  },
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
  if (!isCraftOmen(omen)) return '预兆必须是当前支持的制作配置。'
  if (
    CRAFT_OMEN_RULES[omen].addCount === 2 &&
    ['exalted', 'greater_exalted', 'perfect_exalted'].includes(currency ?? '')
  )
    return null
  if (CRAFT_OMEN_RULES[omen].currency !== currency) return '该预兆只能搭配对应的基础通货。'
  return null
}

export function craftOmenMaterials(omen: CraftOmen): readonly string[] {
  const rule = CRAFT_OMEN_RULES[omen]
  return rule.materials ?? [rule.name]
}

/** 用同一规则说明预兆候选约束，避免无方向预兆被误说成后缀限定。 */
export function craftOmenDescription(omen: CraftOmen): string {
  if (omen === 'light')
    return '仅移除已揭示且标记为亵渎的完整词缀组，其他组保留。移除后可重新施加骨骼；若该组是已有目标，也会失去该目标。'
  if (omen === 'whittling')
    return '仅移除未破裂词缀中目录等级最低的一组；并列时全部保留为候选，已有目标仍可能被移除。比较出现等级，不按阶级或数值大小选择。'
  const rule = CRAFT_OMEN_RULES[omen]
  if (rule.addCount === 2)
    return `一次新增两组${rule.kind === 'prefix' ? '前缀' : rule.kind === 'suffix' ? '后缀' : '词缀'}，第二组继续核对空位和冲突；已有词缀保留。基础、高级与完美崇高分别沿用自身等级限制。少于两个合法空位的消费行为尚未核实。`
  const side = rule.kind === 'prefix' ? '前缀' : '后缀'
  return rule.effect === 'add'
    ? `仅新增${side}。`
    : `游戏实际在${side}中随机移除；该侧具体词缀没有被保护。`
}
