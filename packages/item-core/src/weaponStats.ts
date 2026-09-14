import type { CatalogBase, CraftCatalog } from './catalog'
import { readNumericValues } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { sumWeaponRuneEffects, weaponSocketKind } from './weaponRuneEffects'

export type WeaponDamageType = 'Physical' | 'Fire' | 'Cold' | 'Lightning' | 'Chaos'
export interface WeaponDamageEstimate {
  baseMin: number
  baseMax: number
  affixMin: number
  affixMax: number
  runeMin: number
  runeMax: number
  affixIncreased: number
  runeIncreased: number
  min: number
  max: number
  dps: number
}
export interface WeaponEstimate {
  damage: Record<WeaponDamageType, WeaponDamageEstimate>
  physicalDps: number
  elementalDps: number
  chaosDps: number
  totalDps: number
  quality: number
  attackSpeed: { base: number; increased: number; value: number }
  criticalChance: { base: number; addedPoints: number; value: number }
  reload?: { base: number; increased: number; value: number }
}
const TYPES = ['Physical', 'Fire', 'Cold', 'Lightning', 'Chaos'] as const
const SPECIAL = /\b(?:quality|sockets?|socketed|augments?|runes?|bonded|infusion)\b/i
/** 仅开放普通攻击武器的起点品质；不改变制作资格。 */
export function supportsWeaponQuality(base: CatalogBase): boolean {
  return (
    weaponSocketKind(base)?.category === 'weapon' &&
    !base.hidden &&
    !base.runeforged &&
    base.variantList === undefined &&
    !base.tags.includes('not_for_sale') &&
    !SPECIAL.test(base.implicit ?? '') &&
    !/Cannot load or fire Ammunition/i.test(base.implicit ?? '')
  )
}
const GROUPS = new Set([
  'LocalPhysicalDamage',
  'LocalFireDamage',
  'LocalColdDamage',
  'LocalLightningDamage',
  'LocalPhysicalDamagePercent',
  'LocalIncreasedPhysicalDamagePercentAndAccuracyRating',
  'LocalIncreasedAttackSpeed',
  'LocalBaseCriticalStrikeChance',
])
// 本地组默认拒绝；仅按组名和完整模板放行已核实的非面板效果。
const NON_PANEL_LOCAL: Readonly<Record<string, string>> = {
  LocalAccuracyRating: '+# to Accuracy Rating',
  LocalCriticalStrikeMultiplier: '+#% to Critical Damage Bonus',
  LocalLightRadiusAndAccuracy: '+# to Accuracy Rating\n#% increased Light Radius',
  LocalAttributeRequirements: '#% reduced Attribute Requirements',
  LocalStunDuration: '#% increased Stun Duration',
  LocalStunDamageIncrease: 'Causes #% increased Stun Buildup',
  LocalMeleeWeaponRange: '+# to Weapon Range',
  LocalAdditionalChainChance: '#% chance to Chain an additional time',
  LocalChaosPenetration: 'Attacks with this Weapon Penetrate #% Chaos Resistance',
}
const normalizeNumbers = (line: string) =>
  line.replace(/\(\d+(?:\.\d+)?[-–—]\d+(?:\.\d+)?\)|\d+(?:\.\d+)?/g, '#')
// 已审计的全局、条件、技能和弹体效果不会参与装备本地面板。
function relevant(line: string): boolean {
  if (SPECIAL.test(line)) return true
  if (
    /^Leeches (?:\d+(?:\.\d+)?|\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\))% of Physical Damage as (?:Life|Mana)$/.test(
      line,
    )
  )
    return false
  const normalized = normalizeNumbers(line)
  if (
    /^#% increased Elemental Damage with Attacks$/.test(normalized) ||
    /^(?:Attacks |Spells )?Gain #% of (?:Damage|Physical Damage|Elemental Damage) as [Ee]xtra (?:Physical|Fire|Cold|Lightning|Chaos) Damage(?: with Spells| against Dazed Enemies| per Rage| while you are missing Runic Ward)?$/.test(
      normalized,
    ) ||
    /^#% increased Attack Speed (?:while missing Runic Ward|if you haven't been Hit Recently)$/.test(
      normalized,
    ) ||
    /^Adds # to # Fire Damage if you've Blocked Recently$/.test(normalized) ||
    /^#% reduced Elemental Damage Taken while stationary$/.test(normalized) ||
    normalized ===
      'Causes Enemies to Explode on Critical kill, for #% of their Life as Physical Damage'
  )
    return false
  return /\b(?:Attack Speed|Attacks per Second|Critical (?:Hit|Strike) Chance|Reload|Physical Damage|Fire Damage|Cold Damage|Lightning Damage|Chaos Damage|Elemental Damage)\b/i.test(
    line,
  )
}
const valid = (value: number) =>
  Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
// 原始十进制输入先转分数，避免乘除中已丢失的半点靠最终舍入猜回。
// 输入来自有限 Number，词缀和孔位数量已有状态门禁；分母为 0 表示无效数值。
type Fraction = readonly [numerator: bigint, denominator: bigint]
function decimal(value: number): Fraction {
  if (!Number.isFinite(value)) return [0n, 0n]
  const [coefficient = '0', exponent = '0'] = String(value).split('e')
  const places = (coefficient.split('.')[1]?.length ?? 0) - Number(exponent)
  const integer = BigInt(coefficient.replace('.', ''))
  return places >= 0 ? [integer, 10n ** BigInt(places)] : [integer * 10n ** BigInt(-places), 1n]
}
const add = (a: Fraction, b: Fraction): Fraction => [a[0] * b[1] + b[0] * a[1], a[1] * b[1]]
const multiply = (a: Fraction, b: Fraction): Fraction => [a[0] * b[0], a[1] * b[1]]
const divide = (a: Fraction, b: Fraction): Fraction => [a[0] * b[1], a[1] * b[0]]
const percentFactor = (increased: Fraction): Fraction =>
  add(decimal(1), divide(increased, decimal(100)))
function round(value: Fraction, digits = 0): number {
  const scale = 10n ** BigInt(digits)
  const numerator = value[0] * scale
  const denominator = value[1]
  if (
    denominator <= 0n ||
    numerator < 0n ||
    numerator > BigInt(Number.MAX_SAFE_INTEGER) * denominator
  )
    return Number.NaN
  const integer = numerator / denominator
  const rounded = integer + (2n * (numerator % denominator) >= denominator ? 1n : 0n)
  return Number(rounded) / Number(scale)
}
const fail = (error: string): CraftResult<WeaponEstimate> => ({ ok: false, error })

/** 只从目录属性、明确词缀与当前孔位派生；来源面板与旧符文行不参与计算。 */
export function estimateWeaponStats(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<WeaponEstimate> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return fail(`当前制作状态无法估算：${checked.error}`)
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return fail('基底不在制作目录中。累积状态无效。')
  if (!supportsWeaponQuality(base)) return fail('该基底类别或特殊规则尚未提供武器面板模型。')
  if (base.implicit?.split('\n').some(relevant))
    return fail('基底固有属性含尚未支持的本地武器效果。')
  if (state.quality === undefined) return fail('当前品质未知；请核对起点品质后重新开始。')
  if (state.sockets === undefined) return fail('当前孔位状态未知；请先明确孔位状态。')
  const runes = sumWeaponRuneEffects(
    state.sockets.flatMap((id) =>
      id === null ? [] : (catalog.augments?.filter((entry) => entry.id === id) ?? []),
    ),
    'weapon',
  )
  if (!runes) return fail('孔内符文效果尚未支持。')
  const apsBase = base.properties.AttackRateBase
  const critBase = base.properties.CritChanceBase
  if (
    apsBase === undefined ||
    !valid(apsBase) ||
    apsBase === 0 ||
    critBase === undefined ||
    !valid(critBase)
  )
    return fail('基底攻速或暴击率无效。')
  const damage = {} as WeaponEstimate['damage']
  const endpoints = {} as Record<WeaponDamageType, { min: Fraction; max: Fraction }>
  for (const type of TYPES) {
    const a = base.properties[`${type}Min`]
    const b = base.properties[`${type}Max`]
    if (
      (a === undefined) !== (b === undefined) ||
      !valid(a ?? 0) ||
      !valid(b ?? 0) ||
      (a ?? 0) > (b ?? 0)
    )
      return fail(`基底 ${type} 伤害端点无效。`)
    damage[type] = {
      baseMin: a ?? 0,
      baseMax: b ?? 0,
      affixMin: 0,
      affixMax: 0,
      runeMin: type === 'Chaos' ? 0 : runes[`${type}Min`],
      runeMax: type === 'Chaos' ? 0 : runes[`${type}Max`],
      affixIncreased: 0,
      runeIncreased: type === 'Physical' ? runes.Physical : 0,
      min: 0,
      max: 0,
      dps: 0,
    }
    endpoints[type] = { min: decimal(a ?? 0), max: decimal(b ?? 0) }
  }
  let attackInc = 0
  let addedPoints = 0
  let exactAttackInc = decimal(0)
  let exactAddedPoints = decimal(0)
  let exactPhysicalInc = decimal(runes.Physical)
  for (const affix of state.affixes) {
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (!mod) return fail(`词缀 ${affix.modId} 不在制作目录中。`)
    if (!GROUPS.has(mod.group)) {
      if (
        (mod.group.startsWith('Local') &&
          NON_PANEL_LOCAL[mod.group] !== mod.lines.map(normalizeNumbers).join('\n')) ||
        SPECIAL.test(mod.group) ||
        mod.lines.some(relevant)
      )
        return fail(`词缀 ${mod.id} 的本地武器语义尚未支持。`)
      continue
    }
    const values = readNumericValues(mod.lines, affix.lines)
    if (!values.ok) return fail(`词缀 ${mod.id} 数值无法读取：${values.error}`)
    let index = 0
    let unresolved = false
    const lines = mod.lines.map((line) =>
      line.replace(/\([+-]?\d+(?:\.\d+)?[-–—][+-]?\d+(?:\.\d+)?\)/g, () => {
        const value = values.value[index++]
        if (value === null || value === undefined) {
          unresolved = true
          return '?'
        }
        return String(value)
      }),
    )
    // 混合组的完整语义一并验证；准确度无需参与计算。
    if (unresolved) return fail(`词缀 ${mod.id} 的范围尚未掷定。`)
    const line = lines[0] ?? ''
    const num = '(\\d+(?:\\.\\d+)?)'
    const flat = new RegExp(`^Adds ${num} to ${num} (Physical|Fire|Cold|Lightning) Damage$`).exec(
      line,
    )
    const phys = new RegExp(`^${num}% increased Physical Damage$`).exec(line)
    const speed = new RegExp(`^${num}% increased Attack Speed$`).exec(line)
    const crit = new RegExp(`^\\+${num}% to Critical Hit Chance$`).exec(line)
    if (flat && mod.group === `Local${flat[3]}Damage` && lines.length === 1) {
      if (Number(flat[1]) > Number(flat[2])) return fail(`词缀 ${mod.id} 的伤害端点倒置。`)
      const entry = damage[flat[3] as WeaponDamageType]
      entry.affixMin += Number(flat[1])
      entry.affixMax += Number(flat[2])
      const endpoint = endpoints[flat[3] as WeaponDamageType]
      endpoint.min = add(endpoint.min, decimal(Number(flat[1])))
      endpoint.max = add(endpoint.max, decimal(Number(flat[2])))
    } else if (
      phys &&
      ((mod.group === 'LocalPhysicalDamagePercent' && lines.length === 1) ||
        (mod.group === 'LocalIncreasedPhysicalDamagePercentAndAccuracyRating' &&
          lines.length === 2 &&
          /^\+\d+(?:\.\d+)? to Accuracy Rating$/.test(lines[1] ?? '')))
    ) {
      damage.Physical.affixIncreased += Number(phys[1])
      exactPhysicalInc = add(exactPhysicalInc, decimal(Number(phys[1])))
    } else if (speed && mod.group === 'LocalIncreasedAttackSpeed' && lines.length === 1) {
      attackInc += Number(speed[1])
      exactAttackInc = add(exactAttackInc, decimal(Number(speed[1])))
    } else if (crit && mod.group === 'LocalBaseCriticalStrikeChance' && lines.length === 1) {
      addedPoints += Number(crit[1])
      exactAddedPoints = add(exactAddedPoints, decimal(Number(crit[1])))
    } else return fail(`词缀 ${mod.id} 的完整本地模板尚未支持。`)
  }
  const attackFactor = percentFactor(exactAttackInc)
  const attackValue = round(multiply(decimal(apsBase), attackFactor), 2)
  const criticalValue = round(add(decimal(critBase), exactAddedPoints), 2)
  const physicalFactor = multiply(
    percentFactor(exactPhysicalInc),
    percentFactor(decimal(state.quality)),
  )
  for (const type of TYPES) {
    const entry = damage[type]
    const factor = type === 'Physical' ? physicalFactor : decimal(1)
    entry.min = round(multiply(add(endpoints[type].min, decimal(entry.runeMin)), factor))
    entry.max = round(multiply(add(endpoints[type].max, decimal(entry.runeMax)), factor))
    entry.dps = ((entry.min + entry.max) / 2) * attackValue
    if (!Object.values(entry).every(valid) || entry.min > entry.max)
      return fail('武器伤害运算超出安全数值范围。')
  }
  const physicalDps = damage.Physical.dps
  const elementalDps = damage.Fire.dps + damage.Cold.dps + damage.Lightning.dps
  const chaosDps = damage.Chaos.dps
  const totalDps = physicalDps + elementalDps + chaosDps
  if (
    ![attackInc, addedPoints, attackValue * 100, criticalValue * 100, totalDps].every(valid) ||
    attackValue <= 0
  )
    return fail('武器面板运算超出安全数值范围。')
  const reloadBase = base.properties.ReloadTimeBase
  if (
    base.type === 'Crossbow' &&
    (reloadBase === undefined || !valid(reloadBase) || reloadBase <= 0)
  )
    return fail('弩的基础装填时间缺失或无效。')
  const reload =
    base.type === 'Crossbow' && reloadBase !== undefined
      ? {
          base: reloadBase,
          increased: attackInc,
          value: round(divide(decimal(reloadBase), attackFactor), 2),
        }
      : undefined
  if (reload && (!valid(reload.value * 100) || reload.value <= 0))
    return fail('弩的装填时间运算无效。')
  return {
    ok: true,
    value: {
      damage,
      physicalDps,
      elementalDps,
      chaosDps,
      totalDps,
      quality: state.quality,
      attackSpeed: { base: apsBase, increased: attackInc, value: attackValue },
      criticalChance: { base: critBase, addedPoints, value: criticalValue },
      ...(reload ? { reload } : {}),
    },
  }
}
