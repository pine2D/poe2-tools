// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const APP = fileURLToPath(new URL('..', import.meta.url))
const files = (dir) =>
  readdirSync(path.join(APP, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.ts$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name))
const read = (f) => readFileSync(f, 'utf8')

// 取出所有模块说明符：静态 from、裸 import '…'、动态 import(…)、export … from
const specifiers = (src) =>
  [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map((m) => m[1])
// 说明符里出现某个目录名（结尾带不带斜杠都算）
const touches = (spec, dirs) => new RegExp(`(?:^|/)(?:${dirs.join('|')})(?:/|$)`).test(spec)
const COE = ['content', 'adapters']
const GUIDE = ['guide', 'extract', 'popup']
const NETWORK = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/

describe('边界检查器自测', () => {
  it('能认出无尾斜杠、裸 import、动态 import 与 EventSource', () => {
    const src = [
      "import { a } from '../content'",
      "import '../content/boot'",
      "const m = await import('../adapters/x')",
      "export { b } from './adapters'",
      "import { ok } from './dom'",
    ].join('\n')
    expect(specifiers(src).filter((s) => touches(s, COE))).toEqual([
      '../content',
      '../content/boot',
      '../adapters/x',
      './adapters',
    ])
    expect(touches('../guide-core', GUIDE)).toBe(false)
    expect(touches('../guide', GUIDE)).toBe(true)
    expect(touches('./popup/guide-platform', GUIDE)).toBe(true)
    expect(NETWORK.test('new EventSource(url)')).toBe(true)
  })
})

describe('攻略翻译模块边界', () => {
  it('侧边栏与取文脚本不使用 innerHTML 类写法', () => {
    for (const f of [...files('src/guide'), ...files('src/extract')])
      expect(read(f), f).not.toMatch(/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML/)
  })
  it('取文脚本不联网', () => {
    for (const f of files('src/extract')) expect(read(f), f).not.toMatch(NETWORK)
  })
  it('新模块不引用 CoE 内容脚本与适配层', () => {
    for (const f of [...files('src/guide'), ...files('src/extract')])
      expect(
        specifiers(read(f)).filter((s) => touches(s, COE)),
        f,
      ).toEqual([])
  })
  it('CoE 内容脚本及其共用模块不引用攻略模块与弹窗模块', () => {
    // content 入口还会引入 src/ 根下的共用模块（platform 对象会被整体打进 content.js）；新增共用模块时同步加入这里
    const shared = ['src/platform.ts', 'src/protocol.ts', 'src/provenance.ts'].map((f) =>
      path.join(APP, f),
    )
    for (const f of [...files('src/content'), ...files('src/adapters'), ...shared])
      expect(
        specifiers(read(f)).filter((s) => touches(s, GUIDE) || s.includes('guide-core')),
        f,
      ).toEqual([])
  })
})
