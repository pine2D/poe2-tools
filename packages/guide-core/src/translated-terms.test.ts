import { expect, it } from 'vitest'
import { translatedTerms } from './translated-terms'
import type { TermSpan } from './types'

const term = (en: string, zh: string, status: TermSpan['status'] = 'confirmed'): TermSpan => ({
  start: 0,
  end: en.length,
  en,
  zh,
  entryId: en,
  tier: 'primary',
  status,
})
it('只标注本段确认的译名，长词优先，每词首次出现，保留准确偏移', () => {
  const text = '能量护盾先于护盾。能量护盾不会再次标注。'
  expect(
    translatedTerms(text, [
      term('Shield', '护盾'),
      term('Energy Shield', '能量护盾'),
      term('Life', '生命'),
    ]),
  ).toEqual([
    { start: 0, end: 4, en: 'Energy Shield', zh: '能量护盾' },
    { start: 6, end: 8, en: 'Shield', zh: '护盾' },
  ])
})
it('歧义和提示项不冒充已确认，同中文的不同英文也不武断选一个', () => {
  expect(
    translatedTerms('火花、能量护盾、生命。', [
      term('Spark', '火花', 'candidates'),
      term('Energy Shield', '能量护盾', 'hint'),
      term('Life', '生命'),
      term('Lifespan', '生命'),
    ]),
  ).toEqual([])
})
it('标注限长，不改变未知原文或混合 HTML 字符', () => {
  expect(translatedTerms('<img>生命', [term('Life', '生命')])).toEqual([
    { start: 5, end: 7, en: 'Life', zh: '生命' },
  ])
  expect(translatedTerms('生命', [term('x'.repeat(301), '生命')])).toEqual([])
})

it('同段普通含义和技能名同译名时不凭首次出现推断对应，候选译名也隔离', () => {
  expect(
    translatedTerms('附近出现了火花。施放火花进行攻击。', [
      term('spark', '火花', 'hint'),
      term('Spark', '火花'),
    ]),
  ).toEqual([])
  expect(
    translatedTerms('施放火花。', [
      { ...term('Spark', '候选', 'candidates'), candidates: ['火花', '电光'] },
      term('Spark', '火花'),
    ]),
  ).toEqual([])
})

it('带出命中条目的类型；旧数据缺少类型时不补猜', () => {
  expect(
    translatedTerms('用瘟疫搭配凯拉里的残暴。', [
      { ...term('Contagion', '瘟疫'), kind: 'gem' },
      term("Kelari's Brutality", '凯拉里的残暴'),
    ]),
  ).toEqual([
    { start: 1, end: 3, en: 'Contagion', zh: '瘟疫', kind: 'gem' },
    { start: 5, end: 11, en: "Kelari's Brutality", zh: '凯拉里的残暴' },
  ])
  const [old] = translatedTerms('瘟疫', [term('Contagion', '瘟疫')])
  expect(old && 'kind' in old).toBe(false)
})
it('同一译名在本段对应不同类型时不着色，只保留标注', () => {
  const [hit] = translatedTerms('坚韧', [
    { ...term('Unbreakable', '坚韧'), kind: 'passive' },
    { ...term('Unbreakable', '坚韧'), kind: 'gem' },
  ])
  expect(hit).toEqual({ start: 0, end: 2, en: 'Unbreakable', zh: '坚韧' })
})
it('引号内整句词缀按词典译名标为词缀类型，长于其中的术语', () => {
  expect(
    translatedTerms(
      '优先找 +60 最大生命 的装备，生命越高越好。',
      [term('Life', '生命')],
      [{ en: '+60 to maximum Life', zh: '+60 最大生命' }],
    ),
  ).toEqual([
    { start: 4, end: 12, en: '+60 to maximum Life', zh: '+60 最大生命', kind: 'stat' },
    { start: 17, end: 19, en: 'Life', zh: '生命' },
  ])
})
