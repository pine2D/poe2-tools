import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createLexicon } from '../../../packages/l10n-core/src/index'
import { buildDictionary } from '../scripts/build-dictionary.mjs'

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
  await put('data/dict/zh-CN/items.json', {
    _meta: { ...meta, tier: 'gray' },
    bases: { 'Runed Focus': '符文法器' },
    uniques: {},
  })
  await put('data/dict/zh-CN/stats.json', {
    _meta: meta,
    entries: [{ id: 'res', en: '#% to Lightning Resistance', text: '闪电抗性 #%' }],
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
  expect(lex.translate('Import an item')).toBe('导入装备')
  expect(lex.translate('+18% to Lightning Resistance')).toBe('闪电抗性 +18%')
  expect(data.sources.some((x) => x.tier === 'gray')).toBe(false)
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
