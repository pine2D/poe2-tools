// @vitest-environment node
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildGuideDictionary } from '../scripts/build-guide-dictionary.mjs'

async function fixture({ terms } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'guide-dict-'))
  const write = async (file, value) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), JSON.stringify(value))
  }
  await write('data/dict/zh-CN/gems.json', {
    _meta: { tier: 'gray', gameVersion: '0.5.5' },
    entries: {
      SkillGemContagion: { en: 'Contagion', text: '瘟疫' },
      SkillGemX: { en: 'Same', text: 'Same' },
    },
  })
  await write('data/dict/zh-CN/passives.json', {
    _meta: { tier: 'gray', gameVersion: '0.5.5' },
    entries: {
      A: { en: 'Spirit', text: '精神' },
      B: { en: 'Spirit', text: '精魂' },
      C: { en: 'SIX', text: '六' },
      D: { en: 'Wiki', text: '[[x]]' },
      E: { en: ' Padded ', text: ' 留白 ' },
      F: { en: 'contagion', text: '瘟疫' },
      G: { en: 'Deadeye', text: '锐眼' }, // 与升华同名同译的天赋节点（真实数据里每个升华都有一个）
    },
  })
  await write('data/dict/zh-CN/items.json', {
    _meta: { tier: 'gray', gameVersion: '0.5.5' },
    bases: { 'Amethyst Charm': '紫晶咒符' },
    uniques: { 'Ab Aeterno': '无始之时' },
  })
  await write('data/dict/_overrides/ascendancies.json', {
    _meta: {},
    entries: { Ranger1: { en: 'Deadeye', class: 'Ranger', 'zh-CN': '锐眼', 'zh-TW': '銳眼' } },
  })
  await write('data/dict/_overrides/classes.json', {
    _meta: {},
    entries: { Ranger: { en: 'Ranger', 'zh-CN': '游侠', 'zh-TW': '遊俠' } },
  })
  await write(
    'data/l10n/guide/terms.zh-CN.json',
    terms ?? {
      _meta: { tier: 'manual' },
      entries: [{ id: 'kw:spirit', en: 'Spirit', zh: '精魂', kind: 'keyword' }],
    },
  )
  await write('data/l10n/guide/abbreviations.zh-CN.json', {
    _meta: { tier: 'manual' },
    entries: [{ en: 'ES', note: 'Energy Shield，能量护盾' }],
  })
  return root
}

describe('buildGuideDictionary', () => {
  it('合并各表、过滤脏数据、保留歧义、写入哈希与来源', async () => {
    const root = await fixture()
    const out = path.join(root, 'out/guide-dictionary.json')
    await buildGuideDictionary(root, out)
    const dict = JSON.parse(await readFile(out, 'utf8'))
    expect(dict.schemaVersion).toBe(1)
    expect(dict.locale).toBe('zh-CN')
    expect(dict.hash).toMatch(/^[0-9a-f]{16}$/)
    const ids = dict.entries.map((e) => e.id)
    expect(ids).toContain('gem:SkillGemContagion')
    expect(ids).not.toContain('gem:SkillGemX') // zh === en
    expect(ids).not.toContain('passive:C') // 全大写
    expect(ids).not.toContain('passive:D') // wiki 标记
    expect(ids).not.toContain('passive:F') // 与 gem 同 en（忽略大小写）同 zh，去重
    expect(ids).toContain('asc:Ranger1') // 手工升华先读，同名同译的 gray 天赋被去重
    expect(ids).not.toContain('passive:G')
    expect(dict.entries.find((e) => e.id === 'passive:E')).toMatchObject({
      en: 'Padded',
      zh: '留白',
    })
    expect(
      dict.entries
        .filter((e) => e.en === 'Spirit')
        .map((e) => `${e.id}=${e.zh}`)
        .sort(),
    ).toEqual(['kw:spirit=精魂', 'passive:A=精神', 'passive:B=精魂'])
    expect(dict.entries.find((e) => e.id === 'kw:spirit')).toMatchObject({
      kind: 'keyword',
      tier: 'manual',
    })
    expect(dict.entries.find((e) => e.id === 'asc:Ranger1')).toMatchObject({
      en: 'Deadeye',
      zh: '锐眼',
      tier: 'manual',
    })
    expect(dict.entries.find((e) => e.id === 'class:Ranger')).toMatchObject({ zh: '游侠' })
    expect(dict.entries.find((e) => e.id === 'base:Amethyst Charm')).toMatchObject({
      kind: 'base',
      tier: 'gray',
    })
    expect(dict.abbreviations).toEqual([{ en: 'ES', note: 'Energy Shield，能量护盾' }])
    expect(dict.sources.every((s) => /^[0-9a-f]{64}$/.test(s.sha256))).toBe(true)
  })

  it('--no-gray 跳过 gray 表但保留手工与升华', async () => {
    const root = await fixture()
    const out = path.join(root, 'out/g.json')
    await buildGuideDictionary(root, out, { allowGray: false })
    const dict = JSON.parse(await readFile(out, 'utf8'))
    expect(dict.allowGray).toBe(false)
    expect(dict.entries.some((e) => e.tier === 'gray')).toBe(false)
    expect(dict.entries.map((e) => e.id).sort()).toEqual([
      'asc:Ranger1',
      'class:Ranger',
      'kw:spirit',
    ])
  })

  it('exclude 名单去掉同名（忽略大小写）的非手工条目，手工条目保留', async () => {
    const root = await fixture({
      terms: {
        _meta: { tier: 'manual' },
        exclude: ['spirit', 'Contagion'],
        entries: [{ id: 'kw:spirit', en: 'Spirit', zh: '精魂', kind: 'keyword' }],
      },
    })
    const base = await buildGuideDictionary(await fixture(), path.join(root, 'base.json'))
    const out = path.join(root, 'out/g.json')
    const result = await buildGuideDictionary(root, out)
    const dict = JSON.parse(await readFile(out, 'utf8'))
    const ids = dict.entries.map((e) => e.id)
    expect(ids).not.toContain('passive:A')
    expect(ids).not.toContain('passive:B')
    expect(ids).not.toContain('gem:SkillGemContagion')
    expect(ids).toContain('kw:spirit')
    expect(ids).toContain('base:Amethyst Charm')
    expect(result.excluded).toBe(3)
    expect(dict).not.toHaveProperty('excluded')
    expect(dict.hash).not.toBe(base.hash)
  })

  it('exclude 不是字符串数组时报错', async () => {
    const root = await fixture({
      terms: { _meta: { tier: 'manual' }, exclude: 'Spirit', entries: [] },
    })
    await expect(buildGuideDictionary(root, path.join(root, 'g.json'))).rejects.toThrow('排除名单')
  })

  it('相同输入两次构建结果逐字节相同', async () => {
    const root = await fixture()
    await buildGuideDictionary(root, path.join(root, 'a.json'))
    await buildGuideDictionary(root, path.join(root, 'b.json'))
    expect(await readFile(path.join(root, 'a.json'), 'utf8')).toBe(
      await readFile(path.join(root, 'b.json'), 'utf8'),
    )
  })
})
