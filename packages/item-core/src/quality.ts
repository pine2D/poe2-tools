import type { CatalogBase } from './catalog'
import type { CraftResult } from './rehearsal'
import { isRuneforgedArmourBase } from './runeforgedArmour'
import type { ItemDocument } from './types'

const QUALITY_LABEL = /^(?:Quality|品质|品質)\s*[:：]/i
const QUALITY_LINE = /^(?:Quality|品质|品質)\s*[:：]\s*\+?(\d+)%\s*(?:\(augmented\))?\s*$/i
const QUALITY_TYPES = new Set([
  'Helmet',
  'Body Armour',
  'Gloves',
  'Boots',
  'Shield',
  'Focus',
  'Buckler',
])

/** 当前普通品质模型适用的基底；特殊品质规则一律留在模型外。 */
export function supportsItemQuality(base: CatalogBase): boolean {
  return (
    QUALITY_TYPES.has(base.type) &&
    !base.hidden &&
    (!base.runeforged || isRuneforgedArmourBase(base)) &&
    base.variantList === undefined &&
    !/\bquality\b/i.test(base.implicit ?? '')
  )
}

/** 只读取属性区中明确声明的品质，不从面板数值或缺行推断。 */
export function readItemQuality(item: ItemDocument): CraftResult<number | undefined> {
  const lines = item.blocks
    .filter((block) => block.kind === 'properties')
    .flatMap((block) => block.lines)
    .filter((line) => QUALITY_LABEL.test(line.raw.trim()))
  if (lines.length === 0) return { ok: true, value: undefined }
  if (lines.length !== 1) return { ok: false, error: '原文包含重复品质属性，先核对品质信息。' }
  const match = lines[0]?.raw.trim().match(QUALITY_LINE)
  if (!match?.[1]) return { ok: false, error: '原文品质属性格式无效。' }
  const quality = Number(match[1])
  return Number.isInteger(quality) && quality >= 0 && quality <= 30
    ? { ok: true, value: quality }
    : { ok: false, error: '原文品质必须是 0–30 的整数。' }
}
