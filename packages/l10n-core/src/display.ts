import type { Term } from './types'

export const normalize = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase()
const escapePattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// 范围作为同一个数值保留；固定数字不归一化，避免把条件秒数当掷值。
const number = String.raw`[+-]?\d+(?:\.\d+)?`
const range = String.raw`\(${number}-${number}\)`
const value = `([+-]?#|[+-]?${range}|${number}(?:${range})?)`
export function compileTerm(term: Term): (text: string) => string | null {
  const source = normalize(term.en).replace(/^\+(?=#)/, '')
  const pattern = new RegExp(`^${source.split('#').map(escapePattern).join(value)}$`, 'i')
  return (text) => {
    const match = pattern.exec(normalize(text))
    if (!match) return null
    const numbers = match.slice(1)
    let index = 0
    return term.zh.replace(/([+-]?)#/g, (_all, sign: string) => {
      const number = numbers[term.order?.[index] ?? index]
      index++
      if (number === undefined) return '#'
      return /^[+-]/.test(number) ? number : sign + number
    })
  }
}
