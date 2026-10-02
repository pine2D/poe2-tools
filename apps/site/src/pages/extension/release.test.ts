import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { downloadHref, EXTENSION_RELEASE, formatSize } from './release'

it('发布信息与 apps/poe2-extension/release.json 相同，下载地址指向 /downloads/<文件名>', () => {
  const release = JSON.parse(readFileSync('apps/poe2-extension/release.json', 'utf8'))
  expect(EXTENSION_RELEASE).toEqual(release)
  expect(downloadHref).toBe(`/downloads/${release.file}`)
  expect(release.file).toBe(`poe2-extension-${release.version}.zip`)
})

it('大小按 1024 进位显示', () => {
  expect(formatSize(1667156)).toBe('1.6 MB')
  expect(formatSize(25 * 1024 * 1024)).toBe('25.0 MB')
  expect(formatSize(300 * 1024)).toBe('300 KB')
  expect(formatSize(10)).toBe('1 KB')
  // 四舍五入到 1024 KB 时进位为 MB，不显示“1024 KB”
  expect(formatSize(1048000)).toBe('1023 KB')
  expect(formatSize(1048100)).toBe('1.0 MB')
})
