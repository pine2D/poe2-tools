import { describe, expect, it } from 'vitest'
import { createTagSplitter } from './tags'

describe('createTagSplitter', () => {
  it('跨多次推送拼接完整段落', () => {
    const got: string[] = []
    const s = createTagSplitter(['b1', 'b2'], (id, text) => got.push(`${id}=${text}`))
    for (const piece of ['<t id="b', '1">你', '好</t>\n<t id="b2">再', '见</t>']) s.push(piece)
    expect(got).toEqual(['b1=你好', 'b2=再见'])
    expect(s.end()).toEqual([])
  })
  it('忽略未请求的段号与重复段号，报告缺失段', () => {
    const got: string[] = []
    const s = createTagSplitter(['b1', 'b2', 'b3'], (id, text) => got.push(`${id}=${text}`))
    s.push('<t id="x9">伪造</t><t id="b1">一</t><t id="b1">二</t><t id="b3">三</t>')
    expect(got).toEqual(['b1=一', 'b3=三'])
    expect(s.end()).toEqual(['b2'])
  })
  it('去掉段首尾空白', () => {
    const got: string[] = []
    const s = createTagSplitter(['a'], (_, text) => got.push(text))
    s.push('<t id="a">\n  文本  \n</t>')
    expect(got).toEqual(['文本'])
  })
})
