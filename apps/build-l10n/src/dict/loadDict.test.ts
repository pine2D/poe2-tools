// @vitest-environment node
import type { DictBundle } from '@poe2-tools/build-core'
import { describe, expect, it } from 'vitest'
import { miniBundle } from '../../../../packages/build-core/src/testing/miniDict'
import { fakeDictFetch } from '../testing/fakeDictFetch'
import { createDictLoader, dictUrl, loadDict } from './loadDict'

describe('dictUrl', () => {
  it('拼接 base 与路径，base 有无尾斜杠都行', () => {
    expect(dictUrl('/', 'zh-CN', 'stats.json')).toBe('/dict/zh-CN/stats.json')
    expect(dictUrl('/poe2-tools', 'zh-TW', 'meta.json')).toBe('/poe2-tools/dict/zh-TW/meta.json')
  })
})

describe('loadDict', () => {
  it('七张表 + meta 全部加载并建立索引', async () => {
    const result = await loadDict('zh-CN', '/', fakeDictFetch(miniBundle))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dict.locale).toBe('zh-CN')
    expect(result.dict.bundle.stats?.entries).toHaveLength(11)
    expect(result.dict.index.gems.get('SkillGemFlameblast')?.text).toBe('烈焰冲击')
    expect(result.dict.index.bases.get('Ruby Ring')).toBe('红宝石戒指')
    expect(result.dict.info).toEqual({ gameVersion: '0.0.0', leagueName: '测试联盟' })
    expect(result.dict.missing).toEqual([])
  })

  it('灰区表 404 只降级并记录', async () => {
    const result = await loadDict(
      'zh-CN',
      '/',
      fakeDictFetch(miniBundle, { omit: ['gems', 'passives'] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dict.missing).toEqual(['gems', 'passives'])
    expect(result.dict.index.gems.size).toBe(0)
    expect(result.dict.index.bases.get('Ruby Ring')).toBe('红宝石戒指')
  })

  it('primary 表 404 → 失败并指出文件', async () => {
    expect(await loadDict('zh-CN', '/', fakeDictFetch(miniBundle, { omit: ['stats'] }))).toEqual({
      ok: false,
      error: 'zh-CN/stats.json：HTTP 404',
    })
  })

  it('表形态错误 → 失败（错误来自 parseDictBundle）', async () => {
    const broken = { ...miniBundle, classes: { bad: true } } as unknown as DictBundle
    const result = await loadDict('zh-CN', '/', fakeDictFetch(broken))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('classes')
  })

  it('请求抛错或非 JSON → 失败并带原因', async () => {
    const throwing = await loadDict('zh-CN', '/', async () => {
      throw new Error('网络断了')
    })
    expect(throwing).toEqual({ ok: false, error: 'zh-CN/stats.json：请求失败（网络断了）' })
    const inner = fakeDictFetch(miniBundle)
    const notJson = await loadDict('zh-CN', '/', async (url) =>
      url.endsWith('/items.json')
        ? {
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError('Unexpected token')
            },
          }
        : inner(url),
    )
    expect(notJson.ok).toBe(false)
    if (notJson.ok) return
    expect(notJson.error).toContain('zh-CN/items.json：不是合法 JSON')
  })

  it('meta.json 缺失时版本信息为空', async () => {
    const result = await loadDict('zh-CN', '/', fakeDictFetch(miniBundle, { omit: ['meta'] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.dict.info).toEqual({ gameVersion: null, leagueName: null })
  })
})

describe('createDictLoader', () => {
  it('同一 locale 只请求一次（8 个文件）；失败不缓存，下次重试', async () => {
    const calls: string[] = []
    const inner = fakeDictFetch(miniBundle)
    const loader = createDictLoader('/', async (url) => {
      calls.push(url)
      return inner(url)
    })
    await loader('zh-CN')
    await loader('zh-CN')
    expect(calls).toHaveLength(8)

    let failing = true
    const flaky = createDictLoader('/', async (url) =>
      failing ? { ok: false, status: 500, json: async () => null } : inner(url),
    )
    expect((await flaky('zh-TW')).ok).toBe(false)
    failing = false
    expect((await flaky('zh-TW')).ok).toBe(true)
  })
})
