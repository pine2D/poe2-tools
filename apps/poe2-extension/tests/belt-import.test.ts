import { readFileSync } from 'node:fs'
import type { Term } from '@poe2-tools/l10n-core'
import { expect, it } from 'vitest'
import { prepareImport } from '../src/adapters/coe-beta/import'

const sample = readFileSync(
  'docs/chrome-extension/fixtures/mail-belt-charm-slots-zh-CN.txt',
  'utf8',
)
const source = JSON.parse(readFileSync('data/dict/zh-CN/stats.json', 'utf8'))
const terms: Term[] = [
  { id: 'base', en: 'Mail Belt', zh: '环锁腰带', domain: 'base', source: 'test', version: 'test' },
  ...source.entries.map((entry: { id: string; en: string; text: string; order?: number[] }) => ({
    id: entry.id,
    sourceId: entry.id,
    en: entry.en,
    zh: entry.text,
    order: entry.order,
    domain: 'stat',
    source: 'test',
    version: 'test',
  })),
]
it('国服腰带保留双固有属性与特殊词缀，明确提示原站咒符位兼容性', () => {
  const result = prepareImport(sample, terms)
  expect(result.ready).toBe(true)
  expect(result.issues).toEqual([])
  expect(result.reasons.join(' ')).not.toContain('基底属性数量与已验收结构不符')
  expect(result.original).toBe(sample)
  expect(result.english).toContain('Has 2(1-3) Charm Slot')
  expect(result.english).toContain('14(15-10)% reduced Flask Charges used')
  expect(result.english).toContain('Minions deal 49(45-52)% increased Damage with Command Skills')
  expect(result.english).toContain('Minions have 20(17-20)% increased Area of Effect')
  expect(result.warnings.join(' ')).toContain('咒符位曾被 CoE 拒绝或丢失')
})
it('咒符位提示跟随已识别属性身份，不凭模糊中文触发', () => {
  expect(
    prepareImport(sample.replace('具有 2(1-3) 个咒符位', '未知咒符位 2'), terms).warnings.some(
      (i) => i.includes('咒符位曾被'),
    ),
  ).toBe(false)
  expect(
    prepareImport(
      sample,
      terms.filter((t) => t.sourceId !== 'implicit.stat_1416292992'),
    ).warnings.some((i) => i.includes('咒符位曾被')),
  ).toBe(false)
})
