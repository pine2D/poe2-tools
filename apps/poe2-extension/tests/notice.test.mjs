// @vitest-environment node
import { expect, it } from 'vitest'
import { noticeText } from '../scripts/notice.mjs'

it('NOTICE 首行是版本号，不再写“开发预览版”，保留非官方声明', () => {
  const notice = noticeText('0.2.0')
  expect(notice.split('\n')[0]).toBe('PoE2 中文助手 0.2.0')
  expect(notice).not.toContain('预览')
  expect(notice).toContain(
    '这是非官方扩展，与 Craft of Exile、Grinding Gear Games、腾讯无隶属关系。',
  )
})

it('链接指向主线文档与网站介绍页，不再指向开发分支', () => {
  const notice = noticeText('0.2.0')
  expect(notice).toContain('https://github.com/pine2D/poe2-tools/blob/main/docs/data-sources.md')
  expect(notice).toContain('https://poe2-tools.pine2d.com/extension/')
  expect(notice).not.toContain('feat/coe-chrome-extension')
  expect(notice.endsWith('\n')).toBe(true)
})
