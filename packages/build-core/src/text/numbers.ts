// 词缀行的数字归一化：数字（含小数）→ '#'。符号留在模板里，由 leadingSign 单独处理。

export interface Normalized {
  template: string
  numbers: string[]
}

export type Sign = '+' | '-' | ''

const NUMBER = /\d+(?:\.\d+)?/g

export function normalizeNumbers(text: string): Normalized {
  const numbers: string[] = []
  const template = text.replace(NUMBER, (match) => {
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
  return stripLeadingSign(template).trim().toLowerCase()
}

// 把源行的正负号搬到译文模板第一个 '#' 前：该处已有符号则替换，没有则插入。
// 中文模板的符号常在句尾（"所有火焰法术技能等级 +#"），不能只看句首。
export function applySign(template: string, sign: Sign): string {
  const at = template.indexOf('#')
  if (at === -1) return template
  const prev = at > 0 ? template.charAt(at - 1) : ''
  const head = prev === '+' || prev === '-' ? template.slice(0, at - 1) : template.slice(0, at)
  return `${head}${sign}${template.slice(at)}`
}
