import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createLexicon } from '../../../packages/l10n-core/src/index'
import { createGameLexicon } from '../../../packages/l10n-core/src/stats'
import { buildDictionary } from '../scripts/build-dictionary.mjs'
import { prepareImport } from '../src/adapters/coe-beta/import'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'coe-dict-test-'))
  roots.push(root)
  const put = async (p, data) => {
    await mkdir(path.dirname(path.join(root, p)), { recursive: true })
    await writeFile(path.join(root, p), JSON.stringify(data))
  }
  const meta = { tier: 'primary', source: 'synthetic', gameVersion: 'test' }
  const statMeta = (locale) => ({
    ...meta,
    projection: 'source-placeholders',
    decisions: [],
    sources: ['en', locale].map((locale) => ({ locale, sha256: 'a'.repeat(64) })),
  })
  await put('data/l10n/stat-decisions.json', {
    _meta: { source: 'synthetic', updatedAt: 'test' },
    entries: { 'zh-CN': [], 'zh-TW': [] },
  })
  await put('data/l10n/coe-beta/stat-variants.zh-CN.json', {
    _meta: { source: 'synthetic', updatedAt: 'test', gameVersion: 'test' },
    entries: [],
  })
  await put('data/dict/zh-CN/items.json', {
    _meta: { ...meta, tier: 'gray' },
    bases: { 'Runed Focus': '符文法器' },
    uniques: {},
  })
  await put('data/l10n/coe-beta/tablets.zh-CN.json', {
    _meta: { ...meta, tier: 'gray', gameVersion: 'unknown' },
    bases: { 'Expedition Tablet': '先祖秘藏石板' },
    uniques: {},
  })
  await put('data/l10n/stats/zh-CN.json', {
    _meta: statMeta('zh-CN'),
    entries: [{ id: 'res', en: '#% to Lightning Resistance', text: '闪电抗性 #%' }],
  })
  await put('data/dict/zh-TW/items.json', {
    _meta: { ...meta, tier: 'gray' },
    bases: { 'Runed Focus': '臺服自造法器' },
    uniques: {},
  })
  await put('data/l10n/stats/zh-TW.json', {
    _meta: statMeta('zh-TW'),
    entries: [{ id: 'res', en: '#% to Lightning Resistance', text: '#%閃電抗性' }],
  })
  await put('data/craft/catalog.json', {
    _meta: {
      nameSources: [
        { locale: 'en', url: 'synthetic-en', sha256: 'e', gameVersion: null },
        { locale: 'zh-CN', url: 'synthetic-cn', sha256: 'c', gameVersion: null },
      ],
    },
    localizedNames: { 'zh-CN': { 'Exalted Orb': '崇高石' } },
  })
  await put('data/l10n/coe-beta/ui.zh-CN.json', {
    _meta: { ...meta, tier: 'manual' },
    entries: { 'Import an item': '导入装备' },
  })
  await put('data/l10n/aliases.zh-CN.json', { entries: [] })
  return root
}
it('构建实际可显示和检索的资源并保留独立来源哈希', async () => {
  const root = await fixture()
  const output = path.join(root, 'out/dictionary.json')
  await buildDictionary(root, output)
  const data = JSON.parse(await readFile(output, 'utf8'))
  const lex = createLexicon(data.terms)
  expect(lex.translate('Runed Focus')).toBe('符文法器')
  expect(lex.translate('Expedition Tablet')).toBe('先祖秘藏石板')
  expect(lex.translate('+18% to Lightning Resistance')).toBe('闪电抗性 +18%')
  expect(lex.translate('Exalted Orb')).toBe('崇高石')
  expect(lex.translate('Import an item')).toBe('导入装备')
  expect(data.sources.every((x) => /^[a-f0-9]{64}$/.test(x.sha256))).toBe(true)
  expect(data.terms.find((x) => x.en === 'Exalted Orb').version).toBe('unknown')
})
it('关闭 gray 后覆盖旧产物且保留 primary/manual', async () => {
  const root = await fixture()
  const output = path.join(root, 'out/dictionary.json')
  await buildDictionary(root, output)
  await buildDictionary(root, output, { allowGray: false })
  const data = JSON.parse(await readFile(output, 'utf8'))
  const lex = createLexicon(data.terms)
  expect(lex.translate('Runed Focus')).toBeNull()
  expect(lex.translate('Expedition Tablet')).toBeNull()
  expect(lex.translate('Import an item')).toBe('导入装备')
  expect(lex.translate('+18% to Lightning Resistance')).toBe('闪电抗性 +18%')
  expect(data.sources.some((x) => x.tier === 'gray')).toBe(false)
  expect(data.terms.some((x) => x.inputOnly && x.domain === 'base')).toBe(false)
  expect(data.terms.some((x) => x.inputOnly && x.domain === 'stat')).toBe(true)
})
it('独立台服词典用于混合装备输入，页面仍显示国服译名并可追溯来源', async () => {
  const root = await fixture()
  const data = await buildDictionary(root, path.join(root, 'out/dictionary.json'))
  const text = `物品種類: 法器
稀有度: 魔法
臺服自造法器
--------
物品等級: 80
--------
{ 後綴屬性 "自造" (等階：1) }
+18(16-20)%閃電抗性`
  const result = prepareImport(text, data.terms)
  expect(result.ready).toBe(true)
  expect(result.english).toContain('Runed Focus')
  expect(result.english).toContain('+18(16-20)% to Lightning Resistance')
  expect(data.sources.filter((s) => s.path.includes('zh-TW'))).toHaveLength(2)
  const lex = createLexicon(data.terms)
  expect(lex.translate('+18% to Lightning Resistance')).toBe('闪电抗性 +18%')
  expect(lex.translate('Runed Focus')).toBe('符文法器')
  expect(lex.search('臺服', 'base')).toEqual([])
})
it('真实入库词典可加载，保留同一来源 ID 的不同文本形式', async () => {
  const outputRoot = await fixture()
  const root = path.resolve(import.meta.dirname, '../../..')
  const data = await buildDictionary(root, path.join(outputRoot, 'real.json'))
  const lex = createLexicon(data.terms)
  expect(lex.translate('12% increased Gold found in this Area')).toBe(
    '在此区域中可找到的金币数量提高 12%',
  )
  expect(lex.translate('12% increased Gold found in Map')).toBe('地图内找到的金币数量提高 12%')
})

it('真实扩展数据保留固定条件、来源快照和显式裁决，显示与导入拒绝错误条件', async () => {
  const outputRoot = await fixture()
  const root = path.resolve(import.meta.dirname, '../../..')
  const data = await buildDictionary(root, path.join(outputRoot, 'raw.json'))
  expect(
    data.sources.some((s) => s.path === 'data/l10n/stats/zh-CN.json' && s.snapshots?.length === 2),
  ).toBe(true)
  expect(data.terms.some((t) => t.sourceId === 'explicit.stat_1416406066' && t.preferred)).toBe(
    true,
  )
  const lex = createGameLexicon(data.terms)
  const source = 'Create a Fragment of Divinity in your Presence every 4 seconds'
  expect(lex.translate(source, 'stat')).toBe('在你的在场范围内，每 4 秒创造一个神圣碎片')
  expect(lex.translate(source.replace('4', '999'), 'stat')).toBeNull()
  expect(lex.resolveStat('在你的在场范围内，每 999 秒创造一个神圣碎片', 'toEnglish').status).toBe(
    'unmatched',
  )
  expect(lex.translate('20% increased Spirit', 'stat')).toBe('精魂提高 20%')
})
