import { describe, expect, it } from 'vitest'
import { bundleUrl, findTreeBundleFile, findTreeVersion } from './poe2dbTree'

describe('poe2db 天赋树发现', () => {
  it('从页面 HTML 找到 bundle 文件名', () => {
    const html =
      '<script src="https://cdn.poe2db.tw/js/passive-skill-tree.e0cc6da0156e37d5.js"></script>'
    expect(findTreeBundleFile(html)).toBe('passive-skill-tree.e0cc6da0156e37d5.js')
    expect(bundleUrl('passive-skill-tree.e0cc6da0156e37d5.js')).toBe(
      'https://cdn.poe2db.tw/js/passive-skill-tree.e0cc6da0156e37d5.js',
    )
  })
  it('从 bundle 找到模板版本', () => {
    expect(
      findTreeVersion('new PassiveSkillTree({poe1version:"3.29",poe2version:"4.5",x:1})'),
    ).toBe('4.5')
  })
  it('找不到时返回 null', () => {
    expect(findTreeBundleFile('<html></html>')).toBeNull()
    expect(findTreeVersion('nothing here')).toBeNull()
  })
})
