// 枚举一份 .build 里所有可翻译字段，并把它们对齐成逐行的行模型。
// 顺序 = 预览的显示顺序：构筑说明 → 槽位 → 宝石（含辅助）→ 天赋。
// 概览的未命中清单与各张卡片共用这一份结果，保证「清单里说的第 3 行」
// 和「卡片里高亮的那一行」永远是同一行。
import type { PreviewName, PreviewSlot } from '@poe2-tools/build-core'
import type { TranslatedFile } from '../translate/runTranslation'
import type { MarkupSpan } from './markup'
import { buildRows, type PairRow } from './rows'

export interface FieldEntry {
  /** JSON 路径，与 FieldReport.path 一致 */
  path: string
  /** 人话定位，如「戒指 2」「烈焰冲击 · 深思施法」 */
  label: string
  /** 这个字段的首行按惯例是不是基底名——只有 inventory_slots[*].additional_text 是。
      第二期这条知识散在 Preview 的五处调用里（写死 baseName / baseName={false}），
      筛选与快捷键也要用它，收进字段枚举结果里只此一份。 */
  baseName: boolean
  original: string | null
  translated: string | null
  /** 传奇名的中文译名（只有槽位可能非 null） */
  uniqueText: string | null
}

export interface FieldWithRows {
  entry: FieldEntry
  injected: MarkupSpan[] | null
  rows: PairRow[]
}

// parseBuildFile 是宽松的：数组元素可能是字符串或畸形值，只在是对象且字段为字符串时取值
export function additionalTextAt(list: unknown, i: number): string | null {
  if (!Array.isArray(list)) return null
  const entry: unknown = list[i]
  if (entry === null || typeof entry !== 'object') return null
  const text = (entry as { additional_text?: unknown }).additional_text
  return typeof text === 'string' ? text : null
}

function supportsAt(list: unknown, i: number): unknown {
  if (!Array.isArray(list)) return undefined
  const entry: unknown = list[i]
  if (entry === null || typeof entry !== 'object') return undefined
  return (entry as { support_skills?: unknown }).support_skills
}

export function slotLabel(slot: PreviewSlot): string {
  const name = slot.label ?? slot.inventoryId
  return slot.slotX > 0 ? `${name} #${slot.slotX + 1}` : name
}

function nameOf(name: PreviewName): string {
  return name.text ?? name.en ?? name.id
}

export function listFields(file: TranslatedFile): FieldEntry[] {
  const entries: FieldEntry[] = []
  const { input, build, preview } = file
  if (typeof input.description === 'string' && input.description !== '') {
    entries.push({
      path: 'description',
      label: '构筑说明',
      baseName: false,
      original: input.description,
      translated: typeof build.description === 'string' ? build.description : null,
      uniqueText: null,
    })
  }
  for (const slot of preview.slots) {
    entries.push({
      path: `inventory_slots[${slot.rawIndex}].additional_text`,
      label: slotLabel(slot),
      baseName: true,
      original: additionalTextAt(input.inventory_slots, slot.rawIndex),
      translated: additionalTextAt(build.inventory_slots, slot.rawIndex),
      uniqueText: slot.uniqueText,
    })
  }
  for (const [i, skill] of preview.skills.entries()) {
    entries.push({
      path: `skills[${i}].additional_text`,
      label: nameOf(skill),
      baseName: false,
      original: additionalTextAt(input.skills, i),
      translated: additionalTextAt(build.skills, i),
      uniqueText: null,
    })
    for (const [j, support] of skill.supports.entries()) {
      entries.push({
        path: `skills[${i}].support_skills[${j}].additional_text`,
        label: `${nameOf(skill)} · ${nameOf(support)}`,
        baseName: false,
        original: additionalTextAt(supportsAt(input.skills, i), j),
        translated: additionalTextAt(supportsAt(build.skills, i), j),
        uniqueText: null,
      })
    }
  }
  for (const [i, passive] of preview.passives.entries()) {
    entries.push({
      path: `passives[${i}].additional_text`,
      label: nameOf(passive),
      baseName: false,
      original: additionalTextAt(input.passives, i),
      translated: additionalTextAt(build.passives, i),
      uniqueText: null,
    })
  }
  return entries
}

export function buildFieldRows(file: TranslatedFile, bilingual: boolean): FieldWithRows[] {
  return listFields(file).map((entry) => {
    const field = file.report.fields.find((item) => item.path === entry.path)
    const { injected, rows } = buildRows({
      original: entry.original,
      translated: entry.translated,
      field,
      bilingual,
      uniqueText: entry.uniqueText,
    })
    return { entry, injected, rows }
  })
}
