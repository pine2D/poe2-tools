import type { ModifierState } from './types'

// 结构解析和词典匹配共用，不让同一种高级描述尾注在两条路径上出现不同结果。
export const UNSCALABLE_SUFFIX =
  /\s*(?:\(unscalable\)|（(?:不可缩放|不可縮放|不可調整)）|[—–-]\s*(?:数值不可估量|數值不可估量|Unscalable Value))\s*$/i

export const RUNE_SUFFIX = /\s+\(rune\)\s*$/

const STATE_SUFFIX = /\s*\((crafted|desecrated|fractured)\)\s*$/i
export const FRACTURED_ITEM = /^Fractured Item$/i

/** 仅消费连续的已知尾注；未知括号及其左侧文本始终保留。 */
export function readStatAnnotations(raw: string): {
  text: string
  states: ModifierState[]
  unscalable: boolean
} {
  let text = raw
  const reversed: ModifierState[] = []
  let unscalable = false
  while (true) {
    const state = text.match(STATE_SUFFIX)
    if (state?.[1]) {
      reversed.push(state[1].toLowerCase() as ModifierState)
      text = text.slice(0, state.index)
    } else if (UNSCALABLE_SUFFIX.test(text)) {
      unscalable = true
      text = text.replace(UNSCALABLE_SUFFIX, '')
    } else break
  }
  return { text, states: [...new Set(reversed.reverse())], unscalable }
}

export function readHeaderStates(raw: string): ModifierState[] {
  const state = raw.match(
    /^\s*\{\s*(crafted|desecrated|fractured)\s+(?:Prefix|Suffix) Modifier\b/i,
  )?.[1]
  return state ? [state.toLowerCase() as ModifierState] : []
}

/** 只剥除已知来源状态，不改写同时存在的不可缩放尾注排版。 */
export function stripModifierStateAnnotations(raw: string): string {
  let text = raw
  let retained = ''
  while (true) {
    const state = text.match(STATE_SUFFIX)
    const unscalable = text.match(UNSCALABLE_SUFFIX)
    if (state) {
      text = text.slice(0, state.index)
    } else if (unscalable) {
      retained = unscalable[0] + retained
      text = text.slice(0, unscalable.index)
    } else return text + retained
  }
}
