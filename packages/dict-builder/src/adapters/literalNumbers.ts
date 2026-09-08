// 交易站把常量数字写成字面量（"per 10 Dexterity"），而消费端（build-core normalizeNumbers）会把源行
// 所有数字归一化成 '#'，这类条目永远匹配不上。这里把 en 与 text 里的同一个字面数字一并换成 '#'，
// 用 order 把 text 的每个 '#' 对回源行数字的序号，让运行期按普通模板匹配并回填。
import type { StatEntry } from '@poe2-tools/build-core'

export type LiteralOutcome =
  | { kind: 'unchanged' }
  | { kind: 'variant'; entry: StatEntry }
  | { kind: 'skipped'; reason: 'ambiguous' | 'mismatch' }

interface Slot {
  kind: 'placeholder' | 'literal'
  value: string
}

const NUMBER = /\d+(?:\.\d+)?/g
const SLOT = /#|\d+(?:\.\d+)?/g

// 按出现顺序列出模板里的占位符与字面数字；下标就是消费端归一化后源行数字的序号
function slotsOf(template: string): Slot[] {
  const slots: Slot[] = []
  for (const match of template.matchAll(SLOT)) {
    const value = match[0]
    slots.push(value === '#' ? { kind: 'placeholder', value } : { kind: 'literal', value })
  }
  return slots
}

function literalsOf(slots: readonly Slot[]): string[] {
  return slots.filter((slot) => slot.kind === 'literal').map((slot) => slot.value)
}

function sameMultiset(a: readonly string[], b: readonly string[]): boolean {
  return [...a].sort().join('|') === [...b].sort().join('|')
}

export function toLiteralVariant(entry: StatEntry): LiteralOutcome {
  const enSlots = slotsOf(entry.en)
  const literals = literalsOf(enSlots)
  if (literals.length === 0) return { kind: 'unchanged' }
  if (new Set(literals).size !== literals.length) return { kind: 'skipped', reason: 'ambiguous' }
  const textSlots = slotsOf(entry.text)
  if (!sameMultiset(literals, literalsOf(textSlots))) return { kind: 'skipped', reason: 'mismatch' }

  const literalIndex = new Map<string, number>()
  const placeholderIndices: number[] = []
  for (const [i, slot] of enSlots.entries()) {
    if (slot.kind === 'literal') literalIndex.set(slot.value, i)
    else placeholderIndices.push(i)
  }
  // text 原有的 '#' 沿用原 order（缺省为出现顺序）；字面数字按值对应到 en 里的序号
  const baseOrder = entry.order ?? placeholderIndices.map((_, k) => k)
  const order: number[] = []
  let placeholderSeen = 0
  for (const slot of textSlots) {
    if (slot.kind === 'literal') {
      order.push(literalIndex.get(slot.value) ?? -1)
      continue
    }
    const source = baseOrder[placeholderSeen]
    placeholderSeen += 1
    const mapped = source === undefined ? undefined : placeholderIndices[source]
    if (mapped === undefined) return { kind: 'skipped', reason: 'mismatch' }
    order.push(mapped)
  }
  const identity = order.every((value, k) => value === k)
  const variant: StatEntry = {
    id: entry.id,
    en: entry.en.replace(NUMBER, '#'),
    text: entry.text.replace(NUMBER, '#'),
  }
  return { kind: 'variant', entry: identity ? variant : { ...variant, order } }
}
