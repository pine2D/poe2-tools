// 尺寸阶梯（2026-10-03 方案 §3.3）：取值、单调性，以及扩展不引入（第一期不改变扩展 zip）
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { rootTokens } from './testing/css'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const FONT = {
  '--fs-micro': '12px',
  '--fs-small': '13px',
  '--fs-body': '14px',
  '--fs-data': '15px',
  '--fs-lead': '17px',
  '--fs-title': '21px',
  '--fs-display-s': '28px',
  '--fs-display': '36px',
  '--fs-display-l': '54px',
}
const SPACE = {
  '--sp-1': '4px',
  '--sp-2': '8px',
  '--sp-3': '12px',
  '--sp-4': '16px',
  '--sp-5': '24px',
  '--sp-6': '32px',
  '--sp-7': '48px',
  '--sp-8': '64px',
}

describe('scale.css', () => {
  const { count, tokens } = rootTokens(read('./scale.css'))

  it('只有一个 :root 块，恰好是字号 9 档与间距 8 档', () => {
    expect(count).toBe(1)
    expect(Object.fromEntries(tokens)).toEqual({ ...FONT, ...SPACE })
  })

  it('两组阶梯都严格递增，间距是 4 的倍数', () => {
    const px = (list: Record<string, string>) =>
      Object.values(list).map((v) => Number.parseInt(v, 10))
    for (const list of [px(FONT), px(SPACE)]) {
      expect(list).toEqual([...list].sort((a, b) => a - b))
      expect(new Set(list).size).toBe(list.length)
    }
    expect(px(SPACE).every((v) => v % 4 === 0)).toBe(true)
  })

  it('扩展的弹窗与 L1 样式不引入 scale.css，tokens.css 不含尺寸阶梯', () => {
    const popup = readFileSync(
      fileURLToPath(new URL('../../../apps/poe2-extension/src/popup/popup.css', import.meta.url)),
      'utf8',
    )
    expect(popup).not.toContain('scale.css')
    expect(read('./l1.css')).not.toContain('scale.css')
    expect(read('./tokens.css')).not.toMatch(/--(fs|sp)-/)
  })
})
