import { describe, expect, it } from 'vitest'
import { renderMarkup, tokenizeMarkup } from './tokenize'

describe('tokenizeMarkup', () => {
  it('纯文本只有一个 text 节点', () => {
    expect(tokenizeMarkup('Ruby Ring\n1. +10 to maximum Life')).toEqual([
      { kind: 'text', value: 'Ruby Ring\n1. +10 to maximum Life' },
    ])
  })

  it('单个标记', () => {
    expect(tokenizeMarkup('<red>{Armour}')).toEqual([
      { kind: 'tag', tag: 'red', children: [{ kind: 'text', value: 'Armour' }] },
    ])
  })

  it('嵌套与同级混合', () => {
    expect(tokenizeMarkup('<m>{<red>{Strength +5}} and <b>{more}')).toEqual([
      {
        kind: 'tag',
        tag: 'm',
        children: [{ kind: 'tag', tag: 'red', children: [{ kind: 'text', value: 'Strength +5' }] }],
      },
      { kind: 'text', value: ' and ' },
      { kind: 'tag', tag: 'b', children: [{ kind: 'text', value: 'more' }] },
    ])
  })

  it('rgb 标记带空格与逗号', () => {
    expect(tokenizeMarkup('<rgb(255, 128, 0)>{x}')).toEqual([
      { kind: 'tag', tag: 'rgb(255, 128, 0)', children: [{ kind: 'text', value: 'x' }] },
    ])
  })

  it('标记内可含换行', () => {
    const text = '<grey>{Stat Priority\n---\n1. Life}'
    expect(tokenizeMarkup(text)).toEqual([
      {
        kind: 'tag',
        tag: 'grey',
        children: [{ kind: 'text', value: 'Stat Priority\n---\n1. Life' }],
      },
    ])
  })

  it('标记外的花括号是普通文本', () => {
    expect(tokenizeMarkup('a { b } c')).toEqual([{ kind: 'text', value: 'a { b } c' }])
  })

  it('未闭合标记整段透传', () => {
    expect(tokenizeMarkup('<red>{unclosed')).toEqual([{ kind: 'text', value: '<red>{unclosed' }])
    expect(tokenizeMarkup('<m>{<red>{inner} outer')).toEqual([
      { kind: 'text', value: '<m>{<red>{inner} outer' },
    ])
  })

  it('不合法的标记头按文本处理', () => {
    expect(tokenizeMarkup('<not a tag>{x}')).toEqual([{ kind: 'text', value: '<not a tag>{x}' }])
    expect(tokenizeMarkup('a < b')).toEqual([{ kind: 'text', value: 'a < b' }])
  })
})

describe('renderMarkup', () => {
  const samples = [
    '',
    'plain',
    '<red>{Armour}',
    '<m>{<red>{Strength +5}} and <b>{more}',
    '<silver>{Any Charm}\n\n<grey>{Stat Priority\n-------------------\n1. +10 to maximum Life}',
    '<red>{unclosed',
    'a { b } c',
    '<rgb(1,2,3)>{x}',
  ]
  it('分词后还原与原文逐字相同', () => {
    for (const s of samples) expect(renderMarkup(tokenizeMarkup(s))).toBe(s)
  })
})
