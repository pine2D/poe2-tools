// @vitest-environment node
import { FULL_DISCLAIMER } from '@poe2-tools/ui-theme/compliance'
import { expect, it } from 'vitest'
import { FONT_NOTICE, NOTICE_EN, noticeText } from '../scripts/notice.mjs'

it('NOTICE 首行是版本号，随后是完整声明、英文声明与字体许可（spec §7.6、B.12 修订 7）', () => {
  const lines = noticeText('0.3.0').split('\n')
  expect(lines.slice(0, 4)).toEqual([
    'PoE2 中文助手 0.3.0',
    FULL_DISCLAIMER,
    NOTICE_EN,
    FONT_NOTICE,
  ])
  expect(NOTICE_EN).toBe(
    "This product isn't affiliated with or endorsed by Grinding Gear Games, Tencent or Craft of Exile in any way.",
  )
  expect(FONT_NOTICE).toBe(
    '界面字体 Noto Serif SC 以 SIL OFL 1.1 授权，见 NotoSerifSC-OFL.txt；MIT 不覆盖字体文件。',
  )
  expect(noticeText('0.3.0')).not.toContain('预览')
})

it('链接指向主线文档与网站介绍页，不再指向开发分支', () => {
  const notice = noticeText('0.3.0')
  expect(notice).toContain('https://github.com/pine2D/poe2-tools/blob/main/docs/data-sources.md')
  expect(notice).toContain('https://poe2-tools.pine2d.com/extension/')
  expect(notice).not.toContain('feat/coe-chrome-extension')
  expect(notice.endsWith('\n')).toBe(true)
})
