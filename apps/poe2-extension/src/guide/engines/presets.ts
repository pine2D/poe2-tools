export const DEEPSEEK = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
} as const
// 价格按 2026-10-07 核实的非峰值、未命中缓存价；只用于界面估算。
export const DEEPSEEK_PRICE = {
  inputPerM: 0.15,
  outputPerM: 0.6,
  usdToCny: 7.1,
  verifiedAt: '2026-10-07',
} as const
export const REQUEST_PARAMS = { temperature: 0.2, max_tokens: 4096 } as const

export function deepseekPeak(now: Date): boolean {
  const day = now.getUTCDay()
  if (day === 0 || day === 6) return false
  const h = now.getUTCHours()
  return (h >= 1 && h < 4) || (h >= 6 && h < 10)
}

// 粗估：英文约 4 字符 1 token，中文约 1 字 0.7 token。
export function estimateTokens(text: string): number {
  let ascii = 0
  let other = 0
  for (const ch of text) ch.charCodeAt(0) < 128 ? ascii++ : other++
  return Math.ceil(ascii / 4 + other * 0.7)
}

export function estimateCost(promptTokens: number, completionTokens: number, peak: boolean) {
  const factor = peak ? 2 : 1
  const usd =
    ((promptTokens * DEEPSEEK_PRICE.inputPerM + completionTokens * DEEPSEEK_PRICE.outputPerM) /
      1_000_000) *
    factor
  return { usd, cny: usd * DEEPSEEK_PRICE.usdToCny }
}
