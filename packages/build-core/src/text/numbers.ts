// 将单值和完整的括号掷值范围各归一化为一个 '#'，前导符号仍由 leadingSign 处理。

export interface Normalized {
  template: string
  numbers: string[]
}

export type Sign = '+' | '-' | ''

const NUMBER = /\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)|\d+(?:\.\d+)?/g

// 按十进制文本比较，避免浮点舍入让倒置的端点看起来相等。回填仍使用原串。
function orderedRange(low: string, high: string): boolean {
  const [lowInteger = '', lowFraction = ''] = low.replace(/^0+/, '').split('.')
  const [highInteger = '', highFraction = ''] = high.replace(/^0+/, '').split('.')
  if (lowInteger.length !== highInteger.length) return lowInteger.length < highInteger.length
  if (lowInteger !== highInteger) return lowInteger < highInteger
  return lowFraction.replace(/0+$/, '') <= highFraction.replace(/0+$/, '')
}

export function normalizeNumbers(text: string): Normalized {
  const numbers: string[] = []
  const template = text.replace(NUMBER, (match, low?: string, high?: string) => {
    // 倒置范围留在模板中，不能按一个数值占位符查词典。
    if (low !== undefined && high !== undefined && !orderedRange(low, high)) return match
    numbers.push(match)
    return '#'
  })
  return { template, numbers }
}

export function fillNumbers(template: string, numbers: readonly string[]): string | null {
  let used = 0
  const filled = template.replace(/#/g, () => {
    const value = numbers[used]
    used += 1
    return value ?? '#'
  })
  return used === numbers.length ? filled : null
}

export function leadingSign(template: string): Sign {
  const first = template.trimStart().charAt(0)
  return first === '+' || first === '-' ? first : ''
}

export function stripLeadingSign(template: string): string {
  const trimmed = template.trimStart()
  return leadingSign(trimmed) === '' ? trimmed : trimmed.slice(1)
}

export function templateKey(template: string): string {
  return stripLeadingSign(template).trim().replace(/\s+/g, ' ').toLowerCase()
}

// 返回 text 中第 n 个（0 起）char 出现处的下标；不存在则返回 -1。
function nthIndexOf(text: string, char: string, n: number): number {
  let index = -1
  for (let seen = 0; seen <= n; seen += 1) {
    index = text.indexOf(char, index + 1)
    if (index === -1) return -1
  }
  return index
}

// 把源行的正负号搬到译文模板第 placeholderIndex 个（0 起）'#' 前：该处已有符号则替换，没有则插入。
// 中文模板的符号常在句尾（"所有火焰法术技能等级 +#"），不能只看句首。
// placeholderIndex 缺省为 0：源行第一个数字对应译文第一个占位符时（未声明 order，或 order 本就是恒等
// 置换）就是这个位置；order 非恒等时（如字面数字变体）由调用方按 order.indexOf(0) 算出接收源行首个
// 数字的目标占位符序号再传入。
// 源行没有前导符号（sign === ''）时不动译文模板：模板里可能本就带着符号（如 "+#% 火焰抗性"），
// 不能因为源行漏写符号就把模板里已有的符号剥掉。
export function applySign(template: string, sign: Sign, placeholderIndex = 0): string {
  if (sign === '') return template
  const at = nthIndexOf(template, '#', placeholderIndex)
  if (at === -1) return template
  const prev = at > 0 ? template.charAt(at - 1) : ''
  const head = prev === '+' || prev === '-' ? template.slice(0, at - 1) : template.slice(0, at)
  return `${head}${sign}${template.slice(at)}`
}
