import type { CraftCatalog } from './catalog'
import { matchCatalogLineOrder } from './catalogMatch'
import { isBasicFlaskBase } from './flasks'
import { readNumericValues } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

/** 仅为固定PoB模型的本件估算；条件效果与角色属性不计入这些数值。 */
export interface FlaskEstimate {
  resource: 'life' | 'mana'
  quality: number | null
  amountRecovered: number | null
  recoveryRateIncreased: number | null
  duration: number | null
  instantPercent: number | null
  instantRecovered: number | null
  gradualRecovered: number | null
  chargesMax: number | null
  chargesUsed: number | null
  chargesGainedIncreased: number | null
  chargesPerSecond: number | null
  notes: string[]
  unknown: string[]
}

type Effect = 'recovery' | 'rate' | 'instant' | 'maximum' | 'used' | 'gained'
interface EffectRule {
  lines: readonly string[]
  effect?: Effect
  negative?: true
  notes?: readonly number[]
}
// 组与完整模板同时匹配；未知本地语义不能默认按零处理。
const RULES: Readonly<Record<string, EffectRule>> = {
  FlaskIncreasedChargesAdded: { lines: ['#% increased Charges gained'], effect: 'gained' },
  FlaskIncreasedMaxCharges: { lines: ['#% increased Charges'], effect: 'maximum' },
  FlaskChargesUsed: { lines: ['#% reduced Charges per use'], effect: 'used', negative: true },
  FlaskIncreasedRecoverySpeed: { lines: ['#% increased Recovery rate'], effect: 'rate' },
  FlaskIncreasedRecoveryAmount: { lines: ['#% increased Amount Recovered'], effect: 'recovery' },
  FlaskPartialInstantRecovery: { lines: ['#% of Recovery applied Instantly'], effect: 'instant' },
  FlaskExtraLifeCostsMana: {
    lines: ['#% increased Life Recovered', 'Removes 15% of Life Recovered from Mana when used'],
    effect: 'recovery',
    notes: [1],
  },
  FlaskExtraManaCostsLife: {
    lines: ['#% increased Mana Recovered', 'Removes 15% of Mana Recovered from Life when used'],
    effect: 'recovery',
    notes: [1],
  },
  FlaskIncreasedRecoveryOnLowLife: {
    lines: ['#% more Recovery if used while on Low Life'],
    notes: [0],
  },
  FlaskIncreasedRecoveryOnLowMana: {
    lines: ['#% more Recovery if used while on Low Mana'],
    notes: [0],
  },
  FlaskHealsMinions: { lines: ['Grants #% of Life Recovery to Minions'], notes: [0] },
  FlaskChanceRechargeOnKill: {
    lines: ['#% Chance to gain a Charge when you kill an enemy'],
    notes: [0],
  },
  FlaskFullInstantRecovery: { lines: ['50% reduced Amount Recovered', 'Instant Recovery'] },
}
const template = (line: string) => line.replace(/\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\)/g, '#')
const fail = (error: string): CraftResult<FlaskEstimate> => ({ ok: false, error })
// 只消除二进制浮点显示噪声；回复量与最大充能不额外取整。
const display = (value: number) => Number(value.toFixed(10))

/** 当前效果来自基底与完整词缀；sourceQuality及导入原文面板不代表当前品质或当前面板。 */
export function estimateFlaskProperties(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<FlaskEstimate> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return fail(checked.error)
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base || !isBasicFlaskBase(base) || !base.flask || state.destroyed)
    return fail('仅能估算已核对的存活普通生命或魔力药剂。')
  const resource = base.subType === 'Life' ? 'life' : 'mana'
  const amountBase = base.flask[resource]
  const durationBase = base.flask.duration
  const maximumBase = base.flask.chargesMax
  const usedBase = base.flask.chargesUsed
  if (
    amountBase === undefined ||
    durationBase === undefined ||
    maximumBase === undefined ||
    usedBase === undefined
  )
    return fail('药剂基础面板缺少已核对数值。')
  const effects: Record<Effect, number | null> = {
    recovery: 0,
    rate: 0,
    instant: 0,
    maximum: 0,
    used: 0,
    gained: 0,
  }
  let generated = 0
  const notes: string[] = []
  const unknown: string[] = state.quality === undefined ? ['当前品质未知'] : []
  for (const affix of checked.value.affixes) {
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (!mod?.flaskOnly) return fail('药剂词缀缺少独立来源身份。')
    const order = matchCatalogLineOrder(mod.lines, affix.lines)
    if (!order) return fail('药剂词缀原文无法唯一对应完整模板。')
    if (mod.group === 'FlaskGainChargePerMinute') {
      const line = mod.lines[0]
      if (
        mod.lines.length !== 1 ||
        ![
          'Gains 0.15 Charges per Second',
          'Gains 0.2 Charges per Second',
          'Gains 0.25 Charges per Second',
        ].includes(line ?? '')
      )
        return fail('被动充能模板尚未核对。')
      generated += Number(line?.split(' ')[1])
      continue
    }
    const rule = RULES[mod.group]
    if (!rule || JSON.stringify(mod.lines.map(template)) !== JSON.stringify(rule.lines))
      return fail('药剂含尚未核对的本地面板模板。')
    for (const index of rule.notes ?? []) {
      const line = affix.lines[order[index] ?? -1]
      if (line !== undefined) notes.push(line)
    }
    if (mod.group === 'FlaskFullInstantRecovery') {
      effects.recovery = -50
      effects.instant = 100
    } else if (rule.effect) {
      const values = readNumericValues(mod.lines, affix.lines)
      if (!values.ok || values.value.length !== 1) return fail('药剂本地数值无法对应。')
      const value = values.value[0] ?? null
      if (value === null) {
        effects[rule.effect] = null
        unknown.push(`${mod.name}数值未知`)
      } else {
        const previous = effects[rule.effect]
        if (previous !== null) effects[rule.effect] = previous + value * (rule.negative ? -1 : 1)
      }
    }
  }
  const quality = state.quality ?? null
  const amount =
    quality === null || effects.recovery === null
      ? null
      : display(amountBase * (1 + quality / 100) * (1 + effects.recovery / 100))
  const instant = effects.instant
  return {
    ok: true,
    value: {
      resource,
      quality,
      amountRecovered: amount,
      recoveryRateIncreased: effects.rate,
      // 当前67条词缀没有无条件duration增减；恢复速率只改变持续时间。
      duration:
        effects.rate === null
          ? null
          : Math.round((durationBase / (1 + effects.rate / 100)) * 10) / 10,
      instantPercent: instant,
      instantRecovered:
        amount === null || instant === null ? null : display((amount * instant) / 100),
      gradualRecovered:
        amount === null || instant === null ? null : display(amount * (1 - instant / 100)),
      chargesMax:
        effects.maximum === null ? null : display(maximumBase * (1 + effects.maximum / 100)),
      chargesUsed: effects.used === null ? null : Math.floor(usedBase * (1 + effects.used / 100)),
      chargesGainedIncreased: effects.gained,
      chargesPerSecond: generated,
      notes,
      unknown,
    },
  }
}
