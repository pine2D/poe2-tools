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
    expect(brief('Ignited enemies explode; igniting is key')).toEqual([
      'Ignited:点燃:confirmed',
      'igniting:点燃:hint',
    ])
    expect(brief('Frozen targets shatter')).toEqual(['Frozen:冰冻:confirmed'])
  })
  it('手工条目：原形与复数不论大小写都确认，-ed/-d/-ing 形只在首字母大写时确认', () => {
    expect(brief('stack spirit; more spirits; Spirits')).toEqual([
      'spirit:精魂:confirmed',
      'spirits:精魂:confirmed',
      'Spirits:精魂:confirmed',
    ])
    expect(brief('a spirited defence')).toEqual(['spirited:精魂:hint'])
    expect(brief('freezes and freezing')).toEqual(['freezes:冰冻:confirmed', 'freezing:冰冻:hint'])
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
