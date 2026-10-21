const required = <T>(value: T | null | undefined): T => {
  if (value == null) throw Error('fixture missing')
  return value
}

import { describe, expect, it } from 'vitest'
import {
  normalizeSite,
  PRESET_SITES,
  readSites,
  siteMatches,
  sitePermission,
} from '../src/selection/sites'

describe('自动划词的精确站点和目录边界', () => {
  it('自定义目录在规范化后仍保持边界，不进入其他游戏或相似域名', () => {
    const site = required(normalizeSite('https://Example.COM/poe2/?sort=1#top'))
    expect(site).toEqual({ origin: 'https://example.com', path: '/poe2' })
    expect(siteMatches(site, 'https://example.com/poe2/builds/a')).toBe(true)
    for (const url of [
      'https://example.com/poe20',
      'https://example.com/poe',
      'https://example.com.evil/poe2',
      'http://example.com/poe2',
    ])
      expect(siteMatches(site, url)).toBe(false)
    expect(sitePermission(site)).toBe('https://example.com/*')
  })
  it('拒绝通配符、敏感URL和非网页协议，CoE仍走自己的本地翻译', () => {
    for (const url of [
      'file:///tmp/a',
      'javascript:alert(1)',
      'chrome://settings',
      'https://u:p@example.com/',
      'https://*.example.com/',
      'https://beta.craftofexile.com/',
      'https://craftofexile.com/',
      'not a url',
    ])
      expect(normalizeSite(url)).toBeNull()
  })
  it('可添加完整页面或全站，页面匹配不误包含同名前缀', () => {
    const site = required(normalizeSite('https://example.com/guide.html'))
    expect(siteMatches(site, 'https://example.com/guide.html?mode=1')).toBe(true)
    expect(siteMatches(site, 'https://example.com/guide.html2')).toBe(false)
    expect(
      siteMatches(required(normalizeSite('https://example.com')), 'https://example.com/anything'),
    ).toBe(true)
  })
  it('本地规则清洗去重并限制数量，预设每条都是有效且仅PoE2目录', () => {
    expect(
      readSites([
        { origin: 'https://example.com', path: '/poe2' },
        { origin: 'https://example.com', path: '/poe2' },
        {},
        null,
      ]),
    ).toHaveLength(1)
    expect(
      readSites(
        Array.from({ length: 101 }, (_, i) => ({ origin: `https://s${i}.example.com`, path: '/' })),
      ),
    ).toHaveLength(100)
    for (const p of PRESET_SITES)
      expect(normalizeSite(p.origin + p.path)).toEqual({ origin: p.origin, path: p.path })
  })
})
