const PERCENT = /(?<![\d.])(\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)[^\S\r\n]*[%％]/g

// 只取紧接数值的量词或明确的次数上限。「次要」「次级」和下一句的「次数」均可独立使用。
const COUNTED_ACTION = '(?:触发|使用|施放|命中|尝试|重复|叠加)'
const COUNT_AFTER_ZH = new RegExp(
  String.raw`^[^\S\r\n]*(?:的[^\S\r\n]*)?(?:次|${COUNTED_ACTION}?次数)` +
    String.raw`(?=[^\S\r\n]*(?:$|[\r\n\p{P}]|以上|以下|以内|左右|为止|之后|后|时|里|中|的|${COUNTED_ACTION}))`,
  'u',
)
const COUNT_BEFORE_ZH = /次数(?:的?上限|最多|最高)(?:为|是|可达|达到)?[^\S\r\n]*$/

const COUNT_NOUN =
  '(?:counts?|times|cases|attempts|tries|trials|uses|runs|casts|hits|rolls|attacks|repeats|repetitions|activations|triggers|occurrences)'
const COUNT_ADJECTIVE =
  '(?:successful|unsuccessful|failed|eligible|valid|invalid|recorded|observed|completed|remaining|previous|consecutive|normal|critical|blocked|rare|common)'
// 限定词后可跟带副词的形容词。只在同一名词短语内找计数依据。
const COUNT_NOUN_PREFIX =
  String.raw`(?:(?:more|fewer|less|extra|additional|increased|reduced|(?:increase|decrease|reduction)[ \t]+in)[ \t]+)?` +
  String.raw`(?:(?:of|all|the|your|these|those|total|number)[ \t]+){0,5}` +
  String.raw`(?:(?:(?:[a-z]+ly|very)[ \t]+)?${COUNT_ADJECTIVE}[ \t]+){0,2}`
const COUNT_AFTER_EN = new RegExp(
  String.raw`^[ \t]+(?:of[ \t]+the[ \t]+time|${COUNT_NOUN_PREFIX}${COUNT_NOUN})\b`,
  'i',
)
// 「3 successful attempts at 37%」里的 attempts 已归属 3，同样适用于前一个数值是百分比的情形。
const COUNT_BEFORE_EN = new RegExp(
  String.raw`(?<!\d(?:[ \t]*[%％])?[ \t]+${COUNT_NOUN_PREFIX})\b${COUNT_NOUN}` +
    String.raw`(?:[ \t]+(?:is|are|was|were|rose|fell|increases?|decreases?|increased|reduced|capped|limited|by|to|at|up)){0,4}[ \t]*$`,
  'i',
)

function* percentages(text: string) {
  for (const match of text.matchAll(PERCENT)) {
    yield {
      value: `${match[1]}%`,
      before: text.slice(Math.max(0, match.index - 96), match.index),
      after: text.slice(match.index + match[0].length),
    }
  }
}

const hasChineseCount = ({ before, after }: { before: string; after: string }) =>
  COUNT_AFTER_ZH.test(after) || COUNT_BEFORE_ZH.test(before)

export function unexpectedPercentCounts(source: string, output: string): string[] {
  if (!output.includes('次')) return []
  const counted = [...percentages(output)].filter(hasChineseCount)
  if (!counted.length) return []

  // 两种语言可调换语序。同值有几处明确的计数依据，译文就能使用几处。
  const allowances = new Map<string, number>()
  for (const part of percentages(source)) {
    const hasCount =
      hasChineseCount(part) || COUNT_AFTER_EN.test(part.after) || COUNT_BEFORE_EN.test(part.before)
    allowances.set(part.value, (allowances.get(part.value) ?? 0) + Number(hasCount))
  }
  const unexpected = new Set<string>()
  for (const { value } of counted) {
    const available = allowances.get(value)
    if (available === undefined) continue
    if (available === 0) unexpected.add(value)
    else allowances.set(value, available - 1)
  }
  return [...unexpected]
}
