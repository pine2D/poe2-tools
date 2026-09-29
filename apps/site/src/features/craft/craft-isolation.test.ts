// @vitest-environment node
// 工坊隔离（spec §6.6）：只引入冻结的 legacy 样式，不被改版波及；固定深色，没有主题切换
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SITE = 'apps/site'
const CRAFT = `${SITE}/src/features/craft`
const read = (path: string) => readFileSync(path, 'utf8')

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
}

const LEGACY = ['legacy-tokens.css', 'legacy-base.css', 'legacy-site.css']
const FORBIDDEN = [
  'data-theme',
  'prefers-color-scheme: light',
  'color-scheme: dark light',
  'color-scheme: light',
]

describe('工坊隔离（spec §6.6）', () => {
  it('main.tsx 的样式导入恰为 legacy-tokens → legacy-base → craft → import-readiness → legacy-site', () => {
    const imports = [...read(`${CRAFT}/main.tsx`).matchAll(/^import '([^']+\.css)'$/gm)].map(
      (m) => m[1],
    )
    expect(imports).toEqual([
      './legacy-tokens.css',
      './legacy-base.css',
      './craft.css',
      './import-readiness.css',
      './legacy-site.css',
    ])
  })

  it('工坊的任何文件都不引入 shared/styles 与 @poe2-tools/ui-theme', () => {
    for (const file of filesUnder(CRAFT)) {
      if (file.endsWith('craft-isolation.test.ts')) continue
      expect(read(file), file).not.toMatch(
        /(?:from|import|@import)\s*['"][^'"]*(?:shared\/styles|@poe2-tools\/ui-theme)/,
      )
    }
  })

  it('legacy 样式只被工坊入口引入', () => {
    for (const file of filesUnder(`${SITE}/src`)) {
      if (file.startsWith(CRAFT)) continue
      for (const name of LEGACY) expect(read(file), file).not.toContain(name)
    }
  })

  it('没有主题切换：CraftApp 不用 useTheme，craft.css 没有 .theme-control，入口 HTML 没有首帧主题脚本', () => {
    expect(read(`${CRAFT}/CraftApp.tsx`)).not.toContain('useTheme')
    expect(read(`${CRAFT}/craft.css`)).not.toContain('.theme-control')
    expect(read(`${SITE}/craft/index.html`)).not.toContain('poe2-tools.theme')
  })

  it('三份 legacy 文件存在，且不含浅色主题的写法', () => {
    for (const name of LEGACY) {
      const text = read(`${CRAFT}/${name}`)
      for (const word of FORBIDDEN) expect(text, `${name} 含 ${word}`).not.toContain(word)
    }
    expect(read(`${CRAFT}/legacy-tokens.css`)).toContain('color-scheme: dark;')
  })
})
