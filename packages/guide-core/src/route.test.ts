import { describe, expect, it } from 'vitest'
import { createGameLexicon } from '../../l10n-core/src/index'
import { routeBlock } from './route'
import type { GuideBlock } from './types'

const lex = createGameLexicon([
  {
    id: 'req',
    domain: 'stat',
    en: '#% reduced Attribute Requirements',
    zh: '属性需求降低 #%',
    source: 'primary',
    version: 'unknown',
  },
  {
    id: 'life',
    domain: 'stat',
    en: '+# to maximum Life',
    zh: '+# 生命上限',
    source: 'primary',
    version: 'unknown',
  },
  {
    id: 'fixed',
    domain: 'stat',
    en: 'Gain # Life every 4 seconds',
    zh: '每 4 秒获得 # 生命',
    source: 'primary',
    version: 'unknown',
  },
  {
    id: 'a',
    domain: 'stat',
    en: '#% increased Spirit',
    zh: '精魂提高 #%',
    source: 'primary',
    version: 'unknown',
  },
  {
    id: 'b',
    domain: 'stat',
    en: '#% increased Spirit',
    zh: '该装备精魂提高 #%',
    source: 'primary',
    version: 'unknown',
  },
  {
    id: 'untranslated',
    domain: 'stat',
    en: 'Untranslated stat',
    zh: 'Untranslated stat',
    source: 'primary',
    version: 'unknown',
  },
])
const b = (text: string, extra: Partial<GuideBlock> = {}): GuideBlock => ({
  id: 'b',
  kind: 'paragraph',
  text,
  ...extra,
})

describe('routeBlock', () => {
  it.each(['paragraph', 'list-item', 'table-cell', 'modline'] as const)(
    '完整词缀在 %s 走同一词典路径',
    (kind) => {
      expect(
        routeBlock(b('25% reduced Attribute Requirements', { kind }), lex.resolveStat),
      ).toMatchObject({
        kind: 'dictionary',
        text: '属性需求降低 25%',
        evidence: [{ id: 'req', source: 'primary' }],
      })
    },
  )
  it('固定数字不被占位，词缀引用之外的建议关系不局部替换', () => {
    expect(routeBlock(b('Gain 5 Life every 4 seconds'), lex.resolveStat)).toMatchObject({
      kind: 'dictionary',
      text: '每 4 秒获得 5 生命',
    })
    expect(
      routeBlock(b('Prefer gloves with 25% reduced Attribute Requirements.'), lex.resolveStat),
    ).toEqual({ kind: 'narrative' })
    expect(routeBlock(b('Gain 5 Life every 9 seconds'), lex.resolveStat)).toEqual({
      kind: 'narrative',
    })
  })
  it('只有显式分隔的全部子单元命中才整块翻译，不漏掉混合正文', () => {
    const first = '+80 to maximum Life'
    expect(
      routeBlock(
        b(`${first} 25% reduced Attribute Requirements`, { breaks: [first.length + 1] }),
        lex.resolveStat,
      ),
    ).toMatchObject({ kind: 'dictionary', text: '+80 生命上限\n属性需求降低 25%' })
    expect(
      routeBlock(
        b(`${first} keep this until level 50`, { breaks: [first.length + 1] }),
        lex.resolveStat,
      ),
    ).toEqual({ kind: 'narrative' })
    expect(routeBlock(b(`${first} 25% reduced Attribute Requirements`), lex.resolveStat)).toEqual({
      kind: 'narrative',
    })
  })
  it('明确未知、歧义与来源未译给出不同原因，代码及截断优先保护', () => {
    expect(routeBlock(b('Unknown mod', { kind: 'modline' }), lex.resolveStat)).toEqual({
      kind: 'preserved',
      reason: 'unmatched',
    })
    expect(routeBlock(b('20% increased Spirit'), lex.resolveStat)).toEqual({
      kind: 'preserved',
      reason: 'ambiguous',
    })
    expect(routeBlock(b('Untranslated stat'), lex.resolveStat)).toEqual({
      kind: 'preserved',
      reason: 'source-untranslated',
    })
    expect(routeBlock(b('+80 to maximum Life', { kind: 'verbatim' }), lex.resolveStat)).toEqual({
      kind: 'preserved',
      reason: 'verbatim',
    })
    expect(routeBlock(b('+80 to maximum Life', { truncated: true }), lex.resolveStat)).toEqual({
      kind: 'preserved',
      reason: 'truncated',
    })
    expect(routeBlock(b('+80 to maximum Life', { verbatim: [[0, 19]] }), lex.resolveStat)).toEqual({
      kind: 'narrative',
    })
  })
})
