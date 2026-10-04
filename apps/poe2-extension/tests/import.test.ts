import { existsSync, readdirSync, readFileSync } from 'node:fs'
import type { Term } from '@poe2-tools/l10n-core'
import { expect, it } from 'vitest'
import { type PreparedImport, prepareImport } from '../src/adapters/coe-beta/import'

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
// ---- 0.4.0 核对清单：行数统计（裁定 21、22） ----
// Y = 类别行 + 稀有度行 + 名称行 + note/description 以外各块的非空行；X = Y − 带问题的不重复行号
const invariant = (result: PreparedImport) => {
  expect(result.ready).toBe(result.issues.length === 0)
  if (result.ready) expect(result.lines?.recognized).toBe(result.lines?.total)
}
it('行数统计：正常样本 7 行全部识别，不是仅供对照', () => {
  const result = prepareImport(text, terms)
  // 类别、稀有度、2 个名称行、物品等级、词缀标题、属性行；2 条分隔线不计
  expect(result.lines).toEqual({ total: 7, recognized: 7 })
  expect(result.comparisonOnly).toBe(false)
  invariant(result)
})
it.each([
  ['交易备注', `${text}\n--------\n备注: ~b/o 1 divine`],
  ['引号描述', `${text}\n--------\n“测试描述第一行\n第二行”`],
  ['空行与多余分隔线', text.replace('物品等级: 86', '\n物品等级: 86\n\n--------\n--------')],
])('行数统计：%s不计入参与核对的行', (_, source) => {
  const result = prepareImport(source, terms)
  expect(result.lines).toEqual({ total: 7, recognized: 7 })
  expect(result.ready).toBe(true)
  invariant(result)
})
it('行数统计：属性数值越界只减去那一行', () => {
  const result = prepareImport(text.replace('40(36-41)', '42(36-41)'), terms)
  expect(result.issues).toEqual([{ line: 9, message: '数值无效或不在原文范围内。' }])
  expect(result.lines).toEqual({ total: 7, recognized: 6 })
  invariant(result)
})
it('行数统计：同一行两条问题按行号去重，只减 1', () => {
  const result = prepareImport(`${text}\n--------\n未知面板: 123`, terms)
  expect(result.issues.filter((issue) => issue.line === 11)).toHaveLength(2)
  expect(result.lines).toEqual({ total: 8, recognized: 7 })
  invariant(result)
})
it('行数统计：只有无行号问题时分数不变，但不能填入（显不显示分数由面板决定）', () => {
  const result = prepareImport(text.replace('符文法器\n', '不存在的法器\n'), terms)
  expect(result.issues.length).toBeGreaterThan(0)
  expect(result.issues.every((issue) => issue.line === null)).toBe(true)
  expect(result.lines).toEqual({ total: 7, recognized: 7 })
  expect(result.ready).toBe(false)
  invariant(result)
})
it.each([
  [
    '传奇',
    text.replace('稀有度: 稀有', '稀有度: 传奇'),
    '传奇装备仅供解析与中英对照，不开放制作。',
  ],
  ['咒符', text.replace('类别: 法器', '类别: 咒符'), '咒符仅供解析与中英对照，不开放制作。'],
])('%s仅供对照：comparisonOnly 为真，对照原因是第一条无行号问题', (_, source, reason) => {
  const result = prepareImport(source, terms)
  expect(result.comparisonOnly).toBe(true)
  expect(result.issues[0]).toEqual({ line: null, message: reason })
  expect(result.lines).not.toBeNull()
  invariant(result)
})
it('解析失败：lines 为 null，不是仅供对照', () => {
  const result = prepareImport('任意文本', terms)
  expect(result.lines).toBeNull()
  expect(result.comparisonOnly).toBe(false)
  invariant(result)
})
it('CRLF 换行：行数与行号同 LF 版本', () => {
  const crlf = (value: string) => value.replace(/\n/g, '\r\n')
  expect(prepareImport(crlf(text), terms).lines).toEqual({ total: 7, recognized: 7 })
  const broken = prepareImport(crlf(text.replace('40(36-41)', '42(36-41)')), terms)
  expect(broken.issues).toEqual([{ line: 9, message: '数值无效或不在原文范围内。' }])
  expect(broken.lines).toEqual({ total: 7, recognized: 6 })
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
  // 0.4.0 核对清单：既有样本全部识别（已识别 Y / Y 行）
  expect(result.comparisonOnly).toBe(false)
  expect(result.lines?.total).toBeGreaterThan(0)
  expect(result.lines?.recognized).toBe(result.lines?.total)
  if (name === 'rattling-sceptre-zh-CN.txt') expect(result.lines?.total).toBe(17)
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
