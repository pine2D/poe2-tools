import { describe, expect, it } from 'vitest'
import { createMatcher } from './matcher'
import { sentenceInitial } from './text'
import type { GuideDictionary, GuideEntry } from './types'

const e = (
  id: string,
  en: string,
  zh: string,
  kind: GuideEntry['kind'],
  tier: GuideEntry['tier'] = 'gray',
  aliasesEn?: string[],
): GuideEntry => (aliasesEn ? { id, en, zh, kind, tier, aliasesEn } : { id, en, zh, kind, tier })

const dict: GuideDictionary = {
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'test',
  entries: [
    e('gem:Contagion', 'Contagion', '瘟疫', 'gem'),
    e('gem:EssenceDrain', 'Essence Drain', '精华吸取', 'gem'),
    e('gem:Essence', 'Essence', '精华', 'gem'),
    e('passive:A', 'Spirit', '精神', 'passive'),
    e('passive:B', 'Spirit', '精魂', 'passive'),
    e('kw:spirit', 'Spirit', '精魂', 'keyword', 'manual'),
    e('passive:L', 'Life', '生命', 'passive'),
    e('passive:K', "Kelari's Brutality", '凯拉里的残暴', 'passive'),
    e('passive:U', 'Unbreakable', '坚韧', 'passive'),
    e('gem:U', 'Unbreakable', '不摧', 'gem'),
    e('kw:ignite', 'Ignite', '点燃', 'keyword', 'manual'),
    e('kw:freeze', 'Freeze', '冰冻', 'keyword', 'manual', ['Frozen']),
    e('kw:life', 'Life', '生命', 'keyword', 'manual'),
    e('kw:slow', 'Slow', '减速', 'keyword', 'manual'),
    e('kw:energy-shield', 'Energy Shield', '能量护盾', 'keyword', 'manual'),
    e('jg:exalted-orb', 'Exalted Orb', '崇高石', 'jargon', 'manual', ['exalt']),
  ],
  abbreviations: [{ en: 'ES', note: 'Energy Shield，能量护盾' }],
}
const m = createMatcher(dict)
const brief = (text: string, ctx?: Parameters<typeof m.find>[1]) =>
  m.find(text, ctx).map((s) => `${text.slice(s.start, s.end)}:${s.zh}:${s.status}`)

describe('createMatcher', () => {
  it('最长匹配优先并给出正确偏移', () => {
    const text = 'Use Essence Drain and Contagion.'
    const spans = m.find(text)
    expect(spans.map((s) => [s.start, s.end, s.entryId])).toEqual([
      [4, 17, 'gem:EssenceDrain'],
      [22, 31, 'gem:Contagion'],
    ])
  })
  it('标点会打断多词名称', () => {
    expect(brief('Get Essence, Drain later')).toEqual(['Essence:精华:confirmed'])
  })
  it('统一弯撇号', () => {
    expect(brief('Take Kelari’s Brutality early')).toEqual([
      'Kelari’s Brutality:凯拉里的残暴:confirmed',
    ])
  })
  it('手工条目压过 gray 歧义（Spirit=精魂）', () => {
    const [span] = m.find('Allocate Spirit nodes')
    expect(span).toMatchObject({
      zh: '精魂',
      entryId: 'kw:spirit',
      tier: 'manual',
      status: 'confirmed',
    })
  })
  it('单词型名称：句首或小写只作提示，句中首字母大写才确认', () => {
    expect(brief('Life is hard. Get more life. Stack Life on gear.')).toEqual([
      'Life:生命:hint',
      'life:生命:hint',
      'Life:生命:confirmed',
    ])
  })
  it('多词名称不论大小写、是否句首都确认', () => {
    expect(brief('essence drain first. Essence Drain later')).toEqual([
      'essence drain:精华吸取:confirmed',
      'Essence Drain:精华吸取:confirmed',
    ])
  })
  it('站点实体范围与强调范围内即确认', () => {
    expect(brief('use life here', { entities: [[4, 8]] })).toEqual(['life:生命:confirmed'])
    expect(brief('use life here', { emphasis: [[0, 13]] })).toEqual(['life:生命:confirmed'])
  })
  it('跨表同名给出候选；后接 Support 时取宝石', () => {
    const [cand] = m.find('Take Unbreakable now')
    expect(cand).toMatchObject({ status: 'candidates', candidates: ['坚韧', '不摧'] })
    expect(brief('Link Unbreakable Support here')).toEqual(['Unbreakable:不摧:confirmed'])
  })
  it('词形变体与手工别名', () => {
    expect(brief('All Ignited enemies explode; igniting is key')).toEqual([
      'Ignited:点燃:confirmed',
      'igniting:点燃:hint',
    ])
    expect(brief('Ignited enemies explode')).toEqual(['Ignited:点燃:hint'])
    expect(brief('Hit Frozen targets')).toEqual(['Frozen:冰冻:confirmed'])
  })
  it('单词型手工关键词与非手工单词同一道门槛：句中首字母大写或站点范围内才确认', () => {
    expect(brief('clear is slow')).toEqual(['slow:减速:hint'])
    expect(brief('Stack Slow on bosses')).toEqual(['Slow:减速:confirmed'])
    expect(brief('quality of life')).toEqual(['life:生命:hint'])
    expect(brief('in essence')).toEqual(['essence:精华:hint'])
    expect(brief('stack spirit and more Spirits')).toEqual([
      'spirit:精魂:hint',
      'Spirits:精魂:confirmed',
    ])
    expect(brief('use slow here', { entities: [[4, 8]] })).toEqual(['slow:减速:confirmed'])
    expect(brief('a spirited defence')).toEqual(['spirited:精魂:hint'])
    expect(brief('freezes and freezing')).toEqual(['freezes:冰冻:hint', 'freezing:冰冻:hint'])
    // 派生形另需首字母大写：站点范围内的小写派生形仍只作提示
    expect(brief('use freezing here', { emphasis: [[0, 17]] })).toEqual(['freezing:冰冻:hint'])
  })
  it('专有名词归为手工关键词后同样按大小写确认（Essence）', () => {
    const mk = createMatcher({
      ...dict,
      entries: [
        e('gem:Essence', 'Essence', '精华', 'gem'),
        e('kw:essence', 'Essence', '精华', 'keyword', 'manual'),
      ],
    })
    const show = (text: string) =>
      mk.find(text).map((s) => `${text.slice(s.start, s.end)}:${s.entryId}:${s.status}`)
    expect(show('in essence, the build scales')).toEqual(['essence:kw:essence:hint'])
    expect(show('Use an Essence of Haste here')).toEqual(['Essence:kw:essence:confirmed'])
  })
  it('多词手工关键词与行话：原形不论大小写都确认，派生形只在首字母大写时确认', () => {
    expect(brief('Energy Shield first. stack energy shield')).toEqual([
      'Energy Shield:能量护盾:confirmed',
      'energy shield:能量护盾:confirmed',
    ])
    expect(brief('exalt it')).toEqual(['exalt:崇高石:confirmed'])
    expect(brief('then exalting it')).toEqual(['exalting:崇高石:hint'])
  })
  it("所有格：去掉 's 再查，命中范围不含后缀", () => {
    const text = "Contagion's damage and Contagion’s spread"
    const spans = m.find(text)
    expect(spans.map((s) => [text.slice(s.start, s.end), s.entryId])).toEqual([
      ['Contagion', 'gem:Contagion'],
      ['Contagion', 'gem:Contagion'],
    ])
    expect(brief("Essence Drain's duration")).toEqual(['Essence Drain:精华吸取:confirmed'])
    expect(brief('Take Kelari’s Brutality early')).toEqual([
      'Kelari’s Brutality:凯拉里的残暴:confirmed',
    ])
  })
  it('简称只匹配原样大小写的整词', () => {
    expect(m.abbreviations('Stack ES, not es or ESX')).toEqual([
      { start: 6, end: 8, en: 'ES', note: 'Energy Shield，能量护盾' },
    ])
  })
})

describe('sentenceInitial', () => {
  it('文本开头、句号、冒号、换行与列表符号后视为句首', () => {
    const t = 'Life. Then: Life\n- Life and Life'
    expect(sentenceInitial(t, 0)).toBe(true)
    expect(sentenceInitial(t, t.indexOf('Then'))).toBe(true)
    expect(sentenceInitial(t, t.indexOf('Life', 7))).toBe(true)
    expect(sentenceInitial(t, t.indexOf('Life', 17))).toBe(true)
    expect(sentenceInitial(t, t.lastIndexOf('Life'))).toBe(false)
  })
})

it('仅显式人工例外的原形和复数跳过大小写门槛，不放行派生形或其他常见词', () => {
  const mk = createMatcher({
    ...dict,
    entries: [
      ...dict.entries,
      {
        ...e('kw:waystone', 'Waystone', '引路石', 'keyword', 'manual'),
        matchWithoutContext: true,
      },
    ],
  })
  expect(
    mk.find('a waystone and waystones; waystoned; life and spirit').map((s) => s.status),
  ).toEqual(['confirmed', 'confirmed', 'hint', 'hint', 'hint'])
  const untrusted = createMatcher({
    ...dict,
    entries: [
      {
        ...e('gem:W', 'Waystone', '引路石', 'gem'),
        matchWithoutContext: true,
      },
    ],
  })
  expect(untrusted.find('a waystone')[0]?.status).toBe('hint')
})

describe('未知复合名称中的单词', () => {
  it('单词后连续两个未收录的大写词不足以确认其是独立术语', () => {
    expect(brief('Use Frozen Ground Trail here')).toEqual(['Frozen:冰冻:hint'])
    expect(brief('Use Spirit Amber Crown here')).toEqual(['Spirit:精魂:hint'])
    expect(brief('Hit Frozen targets')).toEqual(['Frozen:冰冻:confirmed'])
    expect(brief('Get Spirit Skill now')).toEqual(['Spirit:精魂:confirmed'])
    expect(brief('Hit Frozen. Ground Trail follows')).toEqual(['Frozen:冰冻:confirmed'])
  })
  it('完整词条和精确实体标记可确认，整个未知名称的强调不能证明其中单词', () => {
    const named = createMatcher({
      ...dict,
      entries: [...dict.entries, e('g:full', 'Frozen Ground Trail', '完整名称', 'gem')],
    })
    expect(named.find('Use Frozen Ground Trail')[0]).toMatchObject({
      en: 'Frozen Ground Trail',
      status: 'confirmed',
    })
    expect(brief('Use Frozen Ground Trail', { entities: [[4, 10]] })).toEqual([
      'Frozen:冰冻:confirmed',
    ])
    expect(brief('Use Frozen Ground Trail', { emphasis: [[4, 23]] })).toEqual(['Frozen:冰冻:hint'])
    expect(brief('Use Frozen Ground Trail', { entities: [[4, 23]] })).toEqual(['Frozen:冰冻:hint'])
    expect(brief('Use Frozen Energy Shield')).toEqual([
      'Frozen:冰冻:confirmed',
      'Energy Shield:能量护盾:confirmed',
    ])
  })
})

it('疑似名称规则不覆盖 Support、人工例外与行话', () => {
  const mk = createMatcher({
    ...dict,
    entries: [
      ...dict.entries,
      { ...e('kw:w', 'Waystone', '引路石', 'keyword', 'manual'), matchWithoutContext: true },
    ],
  })
  expect(mk.find('Use Contagion Support Tomorrow')[0]?.status).toBe('confirmed')
  expect(mk.find('Use Waystone Amber Crown')[0]?.status).toBe('confirmed')
  expect(mk.find('Then Exalt Amber Crown')[0]?.status).toBe('confirmed')
})
