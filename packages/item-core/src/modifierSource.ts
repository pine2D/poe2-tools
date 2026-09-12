import { FRACTURED_ITEM, readHeaderStates, readStatAnnotations } from './annotations'
import { parseItem } from './parse'
import type { ItemDocument } from './types'

function hasParsedSource(item: ItemDocument): boolean {
  return Boolean(
    item.fractured ||
      item.mods.some(
        (mod) =>
          mod.states?.length ||
          readHeaderStates(mod.header.raw).length ||
          mod.stats.some(
            (stat) => stat.states?.length || readStatAnnotations(stat.raw).states.length,
          ),
      ) ||
      item.blocks.some(
        (block) =>
          block.kind === 'flags' &&
          block.lines.some((line) => FRACTURED_ITEM.test(line.raw.trim())),
      ),
  )
}

/** 复核完整原文的结构上下文，防止删掉派生字段绕过，同时不把备注尾注误当词缀。 */
export function hasSpecialModifierSource(item: ItemDocument): boolean {
  if (hasParsedSource(item)) return true
  const original = parseItem(item.rawText)
  return original.ok && hasParsedSource(original.item)
}
