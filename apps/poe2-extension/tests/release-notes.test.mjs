// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { formatBytes, releaseNotes, releasePlan, SITE } from '../scripts/release-notes.mjs'

const release = {
  version: '0.2.0',
  file: 'poe2-extension-0.2.0.zip',
  bytes: 1666679,
  sha256: 'd5a92cf386fc69b2075e0dbd871624b757ba979fc094cef3d78e7cf98f972941',
  date: '2026-10-02',
}
const CHANGELOG = `# 更新日志

## [0.2.0] - 2026-10-02

### 新增

- 首个公开下载版。

## [0.1.111] - 2026-09-26

### 修复

- 不应出现在 0.2.0 的正文里。
`

it('tag、标题、附件与校验值都来自 release.json', () => {
  expect(releasePlan(release)).toEqual({
    tag: 'ext-v0.2.0',
    title: 'PoE2 中文助手 0.2.0',
    file: 'poe2-extension-0.2.0.zip',
    sha256: release.sha256,
  })
})

it('正文是该版本的 CHANGELOG 段落，加上字节数、SHA-256 与网站下载地址', () => {
  const notes = releaseNotes(release, CHANGELOG)
  expect(notes.startsWith('### 新增\n\n- 首个公开下载版。\n')).toBe(true)
  expect(notes).not.toContain('不应出现')
  expect(notes).toContain(`- 网站下载：${SITE}/downloads/poe2-extension-0.2.0.zip`)
  expect(notes).toContain('https://poe2-tools.pine2d.com/extension/')
  expect(notes).toContain('1,666,679 字节（1.6 MB）')
  expect(notes).toContain(`\`${release.sha256}\``)
  expect(notes).toContain('非官方扩展')
})

it('CHANGELOG 缺该版本段落时拒绝生成正文', () => {
  expect(() => releaseNotes({ ...release, version: '0.3.0' }, CHANGELOG)).toThrow('0.3.0')
})

it('字节数按千分位分组并换算 MB', () => {
  expect(formatBytes(999)).toBe('999 字节（0.0 MB）')
  expect(formatBytes(25 * 1048576)).toBe('26,214,400 字节（25.0 MB）')
})

it('命令行出错时只输出一行中文说明并以 1 退出，不打印堆栈', () => {
  const script = fileURLToPath(new URL('../scripts/release-notes.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('用法')
  expect(result.stderr).not.toContain('    at ')
})
