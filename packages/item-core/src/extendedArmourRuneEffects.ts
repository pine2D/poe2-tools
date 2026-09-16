import type { CatalogAugment } from './catalog'

const REBIRTH_NAMES = [
  'Lesser Rebirth Rune',
  'Rebirth Rune',
  'Greater Rebirth Rune',
  'Perfect Rebirth Rune',
]
const REBIRTH = /^Regenerate (\d+(?:\.\d{1,2})?)% of maximum Life per second$/
const WARD = /^([1-9]\d*)% increased Runic Ward$/
type ExtendedKey = 'LifeRegeneration' | 'WardIncreased'

/** 百分数直接保存显示单位；小数仅允许已核对的生命再生。 */
export function readExtendedArmourRuneLine(
  line: string,
): Partial<Record<ExtendedKey, number>> | null {
  const rebirth = REBIRTH.exec(line)
  if (rebirth) {
    const value = Number(rebirth[1])
    const point = Math.round(value * 100)
    return value > 0 && Number.isSafeInteger(point) && point / 100 === value
      ? { LifeRegeneration: value }
      : null
  }
  const ward = WARD.exec(line)
  return ward && Number.isSafeInteger(Number(ward[1])) ? { WardIncreased: Number(ward[1]) } : null
}

/** 名称与普通防具分支同时授权，绑定附加行不参与。 */
export function isExtendedArmourRune(augment: CatalogAugment): boolean {
  if (
    augment.type !== 'Rune' ||
    augment.category !== 'armour' ||
    augment.limit !== undefined ||
    augment.limitId !== undefined ||
    augment.isSocketBound === true ||
    augment.lines.length !== 1
  )
    return false
  const effects = readExtendedArmourRuneLine(augment.lines[0] as string)
  if (!effects) return false
  return REBIRTH_NAMES.includes(augment.name)
    ? augment.localMod === false && effects.LifeRegeneration !== undefined
    : augment.name === 'Warding Rune of Reinforcement' &&
        augment.localMod === true &&
        effects.WardIncreased !== undefined
}

export function isRebirthArmourRune(augment: CatalogAugment): boolean {
  return REBIRTH_NAMES.includes(augment.name) && isExtendedArmourRune(augment)
}
