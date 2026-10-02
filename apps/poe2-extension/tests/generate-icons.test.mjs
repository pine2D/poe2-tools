// @vitest-environment node
import { expect, it } from 'vitest'
import { renderExtGemSvg } from '../../../packages/ui-theme/src/motif-css.ts'
import { ICON_SIZES, iconPage } from '../scripts/generate-icons.mjs'

it('四个尺寸各自渲染', () => {
  expect(ICON_SIZES).toEqual([16, 32, 48, 128])
})

it('图形占画布 88%、居中、透明底（spec §6.10）', () => {
  const page = iconPage(renderExtGemSvg(), 16)
  expect(page).toContain('width="14.08" height="14.08"')
  expect(page).toContain('left:0.96px;top:0.96px')
  expect(page).toContain('background:transparent')
  expect(page).toContain('viewBox="-12.5 -12.5 25 25"')
})
