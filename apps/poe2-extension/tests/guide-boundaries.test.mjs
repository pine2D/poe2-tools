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

describe('攻略翻译模块边界', () => {
  it('侧边栏与取文脚本不使用 innerHTML 类写法', () => {
    for (const f of [...files('src/guide'), ...files('src/extract')])
      expect(read(f), f).not.toMatch(/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML/)
  })
  it('取文脚本不联网', () => {
    for (const f of files('src/extract'))
      expect(read(f), f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/)
  })
  it('新模块不引用 CoE 内容脚本与适配层', () => {
    for (const f of [...files('src/guide'), ...files('src/extract')])
      expect(read(f), f).not.toMatch(/from ['"][^'"]*(?:\/content\/|\/adapters\/)/)
  })
  it('CoE 内容脚本及其共用模块不引用攻略模块与弹窗模块', () => {
    // content 入口还会引入 src/ 根下的共用模块（platform 对象会被整体打进 content.js）；新增共用模块时同步加入这里
    const shared = ['src/platform.ts', 'src/protocol.ts', 'src/provenance.ts'].map((f) =>
      path.join(APP, f),
    )
    for (const f of [...files('src/content'), ...files('src/adapters'), ...shared])
      expect(read(f), f).not.toMatch(
        /from ['"][^'"]*(?:\/guide\/|\/extract\/|guide-core|\/popup\/)/,
      )
  })
})
