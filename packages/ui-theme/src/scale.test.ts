// 尺寸阶梯（2026-10-03 方案 §3.3）：取值与单调性；第三期起阶梯在 tokens.css 的唯一 :root 里（scale.css 已删除），
// 网站经 index.css、扩展弹窗经 popup.css 引入的 tokens.css 取得；L1 不往原站文档写令牌，只在 l1.css 的 :host 声明所用子集
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRules, rootTokens } from './testing/css'

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const read = (path: string) => readFileSync(at(path), 'utf8')

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
const LADDER = /^--(fs|sp)-/
/** 声明值里引用的阶梯令牌名 */
const ladderRefs = (css: string): string[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/var\((--(?:fs|sp)-[\w-]+)\)/g)].map(
    (match) => match[1] ?? '',
  )

describe('尺寸阶梯（tokens.css）', () => {
  const { count, tokens } = rootTokens(read('./tokens.css'))
  const ladder = Object.fromEntries([...tokens].filter(([name]) => LADDER.test(name)))

  it('tokens.css 只有一个 :root，其中的 --fs-* / --sp-* 恰好是字号 9 档与间距 8 档', () => {
    expect(count).toBe(1)
    expect(ladder).toEqual({ ...FONT, ...SPACE })
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

  it('scale.css 已并入 tokens.css：文件与 ./scale.css 导出都不存在，源码与脚本里没有任何引用', () => {
    expect(existsSync(at('./scale.css'))).toBe(false)
    const pkg = JSON.parse(read('../package.json')) as { exports: Record<string, unknown> }
    expect(Object.keys(pkg.exports)).not.toContain('./scale.css')
    const roots = [
      '../../../apps/site/src',
      '../../../apps/site/scripts',
      '../../../apps/poe2-extension/src',
      '../../../apps/poe2-extension/scripts',
      '../src',
      '../scripts',
    ]
    const hits: string[] = []
    for (const root of roots) {
      for (const name of readdirSync(at(root), { recursive: true, encoding: 'utf8' })) {
        if (!/\.(ts|tsx|mts|mjs|js|css|html|json)$/.test(name)) continue
        if (/ui-theme\/(src\/)?scale\.css/.test(read(`${root}/${name}`)))
          hits.push(`${root}/${name}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('扩展弹窗经 tokens.css 取阶梯：popup.css 引入 tokens.css，用到的阶梯令牌都在 tokens.css 里', () => {
    const popup = read('../../../apps/poe2-extension/src/popup/popup.css')
    expect(popup).toContain('@import "@poe2-tools/ui-theme/tokens.css";')
    for (const name of ladderRefs(popup)) expect(tokens.has(name), name).toBe(true)
  })

  it('L1 在 :host 恰好声明它用到的阶梯令牌（不多不少；值与 tokens.css 相同由 l1.test.ts 断言）', () => {
    const l1 = read('./l1.css')
    const host = parseRules(l1).find(
      (rule) => rule.selectors.length === 1 && rule.selectors[0] === ':host',
    )
    const declared = [...(host?.declarations.keys() ?? [])].filter((name) => LADDER.test(name))
    expect(declared.length).toBeGreaterThan(0)
    expect(declared.sort()).toEqual([...new Set(ladderRefs(l1))].sort())
  })
})
