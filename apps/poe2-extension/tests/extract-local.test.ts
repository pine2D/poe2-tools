import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractPage } from '../src/extract/run'

// 真实页面快照只在本地（data/fixtures/local/ 不入库），CI 上自动跳过。
// 路径按本文件解析，与运行目录无关（happy-dom 环境的全局 URL 不是 Node 的 URL，只把字符串交给 fileURLToPath）。
const dir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../data/fixtures/local/guide',
)
// 去掉外链样式与外部脚本，避免 happy-dom 解析快照时向外发请求；内联 <script>（__PRELOADED_STATE__）保留
const offline = (html: string) =>
  html.replace(/<link\b[^>]*>/gi, '').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, '')
const load = (file: string) =>
  new DOMParser().parseFromString(offline(readFileSync(`${dir}/${file}`, 'utf8')), 'text/html')
const NOW = '2026-10-07T00:00:00.000Z'

describe.skipIf(!existsSync(`${dir}/mobalytics-naviras.html`))('Mobalytics 本地快照', () => {
  it('8 个阶段、作者文字与词缀行都在', () => {
    const r = extractPage(
      load('mobalytics-naviras.html'),
      {
        hostname: 'mobalytics.gg',
        pathname: '/poe-2/builds/naviras-fracturing-varashta-league-starter',
        href: 'https://mobalytics.gg/poe-2/builds/naviras-fracturing-varashta-league-starter',
      },
      '',
      NOW,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.doc.stages).toHaveLength(8)
    // 阶段内容组件归到各自阶段（2026-10-07 实测 782 块中无阶段的总述 94 块）
    expect(r.doc.blocks.filter((b) => b.stageId === undefined).length).toBeLessThan(200)
    expect(r.doc.blocks.filter((b) => b.kind === 'modline').length).toBeGreaterThan(100)
    expect(r.doc.blocks.some((b) => b.text.includes('REGEX'))).toBe(true)
  })
})

describe.skipIf(!existsSync(`${dir}/poe2com-monster-rarity.html`))('poe2.com 本地快照', () => {
  it('取到正文与步骤，不含评分区', () => {
    const r = extractPage(
      load('poe2com-monster-rarity.html'),
      {
        hostname: 'www.poe2.com',
        pathname: '/juice-box/monster-rarity-craft',
        href: 'https://www.poe2.com/juice-box/monster-rarity-craft',
      },
      '',
      NOW,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.doc.blocks.length).toBeGreaterThan(10)
    expect(r.doc.blocks.some((b) => /rate this|rating/i.test(b.text))).toBe(false)
  })
})
