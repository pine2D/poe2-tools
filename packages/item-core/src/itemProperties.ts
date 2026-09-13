import type { CraftCatalog } from './catalog'
import { estimateDefences } from './defences'
import type { CraftResult, CraftState } from './rehearsal'
import { estimateWeaponStats } from './weaponStats'

export const CRAFT_PROPERTY_LABELS = {
  physicalDps: '物理 DPS',
  elementalDps: '元素 DPS',
  totalDps: '总 DPS',
  attackSpeed: '每秒攻击次数',
  criticalChance: '暴击率（%）',
  reload: '装填时间（秒）',
  Armour: '护甲',
  Evasion: '闪避',
  EnergyShield: '能量护盾',
} as const
export type CraftProperty = keyof typeof CRAFT_PROPERTY_LABELS

/** 复用面板模型；缺少属性或无法估算均为未知，不能代入零参与条件。 */
export function readCraftProperty(
  catalog: CraftCatalog,
  state: CraftState,
  property: CraftProperty,
): CraftResult<number> {
  if (state.pendingDesecration) return { ok: false, error: '请先完成亵渎揭示，再判断装备面板。' }
  if (property === 'Armour' || property === 'Evasion' || property === 'EnergyShield') {
    const result = estimateDefences(catalog, state)
    if (!result.ok) return result
    const entry = result.value.find((entry) => entry.stat === property)
    return entry
      ? { ok: true, value: entry.value }
      : { ok: false, error: '该基底没有此项防御属性。' }
  }
  const result = estimateWeaponStats(catalog, state)
  if (!result.ok) return result
  // 整数伤害端点均值 × 两位攻速最多三位小数，与面板一致并消除二进制尾数。
  if (property === 'physicalDps' || property === 'elementalDps' || property === 'totalDps')
    return { ok: true, value: Number(result.value[property].toFixed(3)) }
  const value =
    property === 'attackSpeed'
      ? result.value.attackSpeed.value
      : property === 'criticalChance'
        ? result.value.criticalChance.value
        : property === 'reload'
          ? result.value.reload?.value
          : undefined
  return value === undefined
    ? { ok: false, error: '该武器没有装填时间属性。' }
    : { ok: true, value }
}
