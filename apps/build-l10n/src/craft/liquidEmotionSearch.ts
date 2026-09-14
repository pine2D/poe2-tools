import type { LiquidEmotionInspection } from '@poe2-tools/item-core'

/** 目录与制作共用材料、保证属性和来源身份检索，不据检索结果放宽制作资格。 */
export function matchesLiquidEmotion(
  entry: LiquidEmotionInspection,
  query: string,
  localize: (name: string) => string,
  translateLine?: (line: string) => string | null,
): boolean {
  const text = [
    entry.emotion.id,
    entry.emotion.name,
    localize(entry.emotion.name),
    ...entry.outcomes.flatMap((mod) => [
      mod.id,
      mod.name,
      mod.group,
      mod.kind,
      mod.kind === 'prefix' ? '前缀' : '后缀',
      ...mod.tags,
      ...mod.lines.flatMap((line) => [line, translateLine?.(line) ?? '']),
    ]),
  ]
    .join(' ')
    .toLowerCase()
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word))
}
