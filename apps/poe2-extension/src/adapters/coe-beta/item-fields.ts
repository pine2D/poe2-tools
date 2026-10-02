import type { ItemDocument, ItemInspection } from '@poe2-tools/item-core/text'
import type { Term } from '@poe2-tools/l10n-core'

// 字段名称是输入语法，不限制基底或词缀资格；译名复用随包词典。
const classes = new Set([
  'Amulets',
  'Belts',
  'Rings',
  'Bucklers',
  'Foci',
  'Quivers',
  'Shields',
  'Claws',
  'Daggers',
  'Flails',
  'One Hand Axes',
  'One Hand Maces',
  'One Hand Swords',
  'Sceptres',
  'Spears',
  'Wands',
  'Bows',
  'Crossbows',
  'Quarterstaves',
  'Staves',
  'Talismans',
  'Two Hand Axes',
  'Two Hand Maces',
  'Two Hand Swords',
  'Helmets',
  'Body Armours',
  'Gloves',
  'Boots',
  'Jewels',
  'Charms',
])
const properties = new Set(['Armour', 'Evasion Rating', 'Block chance'])
const number = String.raw`[+-]?\d+(?:\.\d+)?(?:\([+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?\))?`
const property = new RegExp(String.raw`^([^:：]+)\s*[:：]\s*(${number}%?(?:\s+\(augmented\))?)$`)
const catalyst =
  /^Quality \((?:Life|Mana|Defence|Physical|Fire|Cold|Lightning|Chaos|Attack|Caster|Speed|Attribute|Minion) Modifiers\):\s*\+?\d+%(?:\s+\(augmented\))?$/

export function completeItemFields(
  item: ItemDocument,
  inspection: ItemInspection,
  terms: readonly Term[],
) {
  const resolve = (label: string, allowed: ReadonlySet<string>) => {
    const values = new Set(
      terms
        .filter(
          (term) =>
            term.domain === 'ui' &&
            allowed.has(term.en) &&
            (term.zh === label || term.en === label),
        )
        .map((term) => term.en),
    )
    return values.size > 1 ? null : [...values][0]
  }
  const fields: Record<number, string> = {}
  for (const block of item.blocks) {
    if (!['properties', 'unknown'].includes(block.kind)) continue
    for (const line of block.lines) {
      const raw = line.raw.trim()
      const match = raw.match(property)
      const label = match?.[1] ? resolve(match[1].trim(), properties) : undefined
      if (label) fields[line.line] = `${label}: ${match?.[2]}`
      else if (catalyst.test(raw)) fields[line.line] = raw
    }
  }
  const header = inspection.exportText.split('\n').slice(0, 2 + item.nameLines.length)
  const translatedClass = item.locale === 'zh-CN' ? resolve(item.itemClass, classes) : undefined
  if (translatedClass) header[0] = `Item Class: ${translatedClass}`
  else if (translatedClass === null) header[0] = `Item Class: ${item.itemClass}`
  const output = [...header]
  for (const block of item.blocks) {
    if (['note', 'description'].includes(block.kind)) continue
    if (block.lines.length)
      output.push(
        '--------',
        ...block.lines.map(
          (line) => fields[line.line] ?? inspection.englishByLine[line.line] ?? line.raw,
        ),
      )
  }
  return { english: output.join('\n'), fields }
}
