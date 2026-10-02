import { existsSync, readdirSync, readFileSync } from 'node:fs'
import type { Term } from '@poe2-tools/l10n-core'
import { expect, it } from 'vitest'
import { prepareImport } from '../src/adapters/coe-beta/import'

const terms: Term[] = [
  {
    id: 'base',
    en: 'Runed Focus',
    zh: '符文法器',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
  {
    id: 'stat:one',
    sourceId: 'explicit.stat_4052037485',
    en: '+# to maximum Energy Shield',
    zh: '+# 能量护盾上限',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
]
const text = `物品类别: 法器
稀有度: 稀有
测试 样本
符文法器
--------
物品等级: 86
--------
{ 前缀属性 "测试的" (等阶：6) — 能量护盾 }
+40(36-41) 能量护盾上限`
it('转换预览保留原文、词缀分组与范围，不生成携带装备的 URL', () => {
  const result = prepareImport(text, terms)
  expect(result.original).toBe(text)
  expect(result.english).toContain('+40(36-41) to maximum Energy Shield')
  expect(result.english).toContain('Prefix Modifier')
  expect(result.ready).toBe(true)
})

it('传奇和咒符仅供对照，交易备注不提交', () => {
  for (const source of [
    text.replace('稀有度: 稀有', '稀有度: 传奇'),
    text.replace('类别: 法器', '类别: 咒符'),
  ])
    expect(prepareImport(source, terms).ready).toBe(false)
  const original = `${text}\n--------\n备注: ~b/o 1 divine`
  const result = prepareImport(original, terms)
  expect(result.original).toBe(original)
  expect(result.english).not.toContain('~b/o')
})
it('无法解析时保留完整输入和诊断', () => {
  const result = prepareImport('任意文本', terms)
  expect(result.ready).toBe(false)
  expect(result.original).toBe('任意文本')
  expect(result.issues.length).toBeGreaterThan(0)
})
it('未知行诊断能定位原文；缺少范围或等阶不再冒充翻译失败', () => {
  const result = prepareImport(`${text}\n未知词缀 10%`, terms)
  expect(result.ready).toBe(false)
  expect(result.issues.some((issue) => issue.line === 10)).toBe(true)
  expect(prepareImport(text.replace('(36-41)', '').replace(' (等阶：6)', ''), terms).ready).toBe(
    true,
  )
})
it('未知类别、缺失物等、损坏标题及未翻译属性仍提示', () => {
  for (const source of [
    text.replace('类别: 法器', '类别: 未知类别'),
    text.replace('物品等级: 86', ''),
    text.replace('前缀属性 "', '前缀属性 FutureMechanic "'),
    `${text}\n--------\n未知面板: 123`,
  ])
    expect(prepareImport(source, terms).ready).toBe(false)
})
it('品质、孔位、腐化及词缀归属原样转换，不代替原站校验规则', () => {
  const result = prepareImport(
    `${text.replace('前缀属性', '后缀属性')}\n--------\n品质: +21%\n--------\n插槽: S S S\n--------\n被腐化`,
    terms,
  )
  expect(result.ready).toBe(true)
  for (const value of ['Suffix Modifier', 'Quality: +21%', 'Sockets: S S S', 'Corrupted'])
    expect(result.english).toContain(value)
})
// 既有实测装备是回归样本，不是导入资格名单。使用入库词典，避免依赖本地构建产物。
const items = JSON.parse(readFileSync('data/dict/zh-CN/items.json', 'utf8')) as {
  bases: Record<string, string>
}
const stats = JSON.parse(readFileSync('data/dict/zh-CN/stats.json', 'utf8')) as {
  entries: { id: string; en: string; text: string; order?: number[] }[]
}
const ui = JSON.parse(readFileSync('data/l10n/coe-beta/ui.zh-CN.json', 'utf8')).entries as Record<
  string,
  string
>
const dictionary: Term[] = [
  ...Object.entries(ui).map(([en, zh]) => ({
    id: en,
    en,
    zh,
    domain: 'ui' as const,
    source: 'fixture',
    version: 'fixture',
  })),
  ...Object.entries(items.bases).map(([en, zh]) => ({
    id: en,
    en,
    zh,
    domain: 'base' as const,
    source: 'fixture',
    version: 'fixture',
  })),
  ...stats.entries.map(({ id, en, text: zh, order }) => ({
    id,
    en,
    zh,
    ...(order ? { order } : {}),
    domain: 'stat' as const,
    source: 'fixture',
    version: 'fixture',
  })),
]
const folder = 'docs/chrome-extension/fixtures'
const fixtures = readdirSync(folder).filter((name) => name.endsWith('-zh-CN.txt'))
it.each(fixtures)('既有样本保留分组与数值：%s', (name) => {
  const original = readFileSync(`${folder}/${name}`, 'utf8')
  const result = prepareImport(original, dictionary)
  expect(result.issues).toEqual([])
  expect(result.ready).toBe(true)
  expect(result.original).toBe(original)
  const englishFile = `${folder}/${name.replace('-zh-CN.txt', '-en.txt')}`
  if (existsSync(englishFile)) {
    // 原站对照样本使用英文自定义名/词缀名；逐行比较实际属性，分组数另行核对。
    const properties = (value: string) =>
      value
        .slice(value.indexOf('--------'))
        .trim()
        .split('\n')
        .filter((line) => !line.startsWith('{'))
    expect(properties(result.english)).toEqual(properties(readFileSync(englishFile, 'utf8')))
  }
  expect(result.english.match(/^\{/gm)?.length ?? 0).toBe(original.match(/^\{/gm)?.length ?? 0)
  expect(result.english.match(/\d+(?:\.\d+)?(?:\([^)]*\))?/g)).toEqual(
    original.split(/备注[:：]/)[0]?.match(/\d+(?:\.\d+)?(?:\([^)]*\))?/g),
  )
})
