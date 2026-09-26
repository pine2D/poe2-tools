import { readFileSync } from 'node:fs'
import type { Term } from '@poe2-tools/l10n-core'
import { expect, it } from 'vitest'
import { prepareImport } from '../src/adapters/coe-beta/import'

const sample = readFileSync('docs/chrome-extension/fixtures/rattling-sceptre-zh-CN.txt', 'utf8')
const source = JSON.parse(readFileSync('data/dict/zh-CN/stats.json', 'utf8'))
const terms: Term[] = [
  {
    id: 'base',
    en: 'Rattling Sceptre',
    zh: '罪孽权杖',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
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
it('权杖预览保留当前与最高技能等级，不替原站改为自动计算结果', () => {
  for (const level of [1, 12]) {
    const original = sample.replace('等级 12 魔侍', `等级 ${level} 魔侍`)
    const result = prepareImport(original, terms)
    expect(result.original).toBe(original)
    expect(result.english).toContain(
      `Grants Skill: Level ${level} Skeletal Warrior Minion (Max Level 13)`,
    )
    expect(result.english).toContain('Spirit: 100')
    expect(result.ready).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.warnings.join(' ')).toContain('重算')
  }
})
it('两行后缀保持同一高级分组，固定数值不虚构范围', () => {
  const result = prepareImport(sample, terms)
  expect(result.english.match(/Suffix Modifier/g)).toHaveLength(3)
  expect(result.english).toContain(
    '20(18-22)% increased Mana Regeneration Rate\n15% increased Light Radius',
  )
  expect(result.english).toContain('+1 to Level of all Minion Skills')
  expect(result.english).not.toContain('+1(1-1)')
  expect(result.english).not.toContain('15(15-15)')
  expect(result.english).toContain('Allies in your Presence deal 54(45-54)% increased Damage')
  expect(result.english).toContain(
    'Allies in your Presence have 15(15-19)% increased Critical Hit Chance',
  )
})
