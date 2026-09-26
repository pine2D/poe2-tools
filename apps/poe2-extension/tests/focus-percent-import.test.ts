import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Term } from '@poe2-tools/l10n-core'
import { expect, it } from 'vitest'
import { prepareImport } from '../src/adapters/coe-beta/import'

const fixture = (name: string) =>
  readFileSync(
    path.resolve(import.meta.dirname, '../../../docs/chrome-extension/fixtures', name),
    'utf8',
  )
const terms: Term[] = [
  {
    id: 'focus',
    en: 'Runed Focus',
    zh: '符文法器',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
  ...[
    ['explicit.stat_4015621042', '#% increased Energy Shield', '能量护盾提高 #%'],
    ['explicit.stat_4052037485', '+# to maximum Energy Shield', '+# 能量护盾上限'],
    ['explicit.stat_1671376347', '+#% to Lightning Resistance', '闪电抗性 +#%'],
    ['explicit.stat_1050105434', '+# to maximum Mana', '+# 魔力上限'],
  ].map(
    ([id, en, zh]) =>
      ({ id, sourceId: id, en, zh, domain: 'stat', source: 'test', version: 'test' }) as Term,
  ),
]
it.each(['magic', 'rare'])('法器独立百分比%s样本按已核对结构转换', (rarity) => {
  const source = fixture(`focus-percent-${rarity}-zh-CN.txt`)
  const result = prepareImport(source, terms)
  expect(result.ready).toBe(true)
  expect(result.issues).toEqual([])
  expect(result.original).toBe(source)
  expect(result.english).toContain('60(56-67)% increased Energy Shield')
  if (rarity === 'rare') expect(result.english).toContain('+40(36-41) to maximum Energy Shield')
})
it.each([
  ['等阶：4', '等阶：1'],
  ['56-67', '51-65'],
  ['60(56-67)', '68(56-67)'],
  ['60(56-67)', '60'],
  ['前缀属性', '后缀属性'],
  ['符文法器', '细枝头冠'],
])('拒绝独立百分比未验收变化 %s→%s', (from, to) => {
  const source = fixture('focus-percent-magic-zh-CN.txt').replaceAll(from, to)
  expect(prepareImport(source, terms).ready).toBe(false)
})
it.each([false, true])('拒绝独立百分比与复合百分比并存，反序=%s', (reversed) => {
  const source = fixture('focus-percent-rare-zh-CN.txt')
  const hybrid = fixture('focus-hybrid-prefix-zh-CN.txt').split('--------\n').at(-1) ?? ''
  const head = source.indexOf('{ 前缀属性')
  const combined = reversed ? source.slice(0, head) + hybrid + source.slice(head) : source + hybrid
  expect(prepareImport(combined, terms).ready).toBe(false)
})
it('拒绝重复独立百分比前缀', () => {
  const source = fixture('focus-percent-rare-zh-CN.txt')
  const mod = fixture('focus-percent-magic-zh-CN.txt').split('--------\n').at(-1)
  expect(prepareImport(source + mod, terms).ready).toBe(false)
})
