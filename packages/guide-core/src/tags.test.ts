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

it('兼容实测的 s 开头 t 结尾，并在任意流式边界保持段号映射', () => {
  const raw = '<t id="a">甲</t><s id="b">乙</t><s id="c">丙</t>'
  for (let at = 0; at <= raw.length; at++) {
    const got: string[] = []
    const s = createTagSplitter(['a', 'b', 'c'], (id, text) => got.push(`${id}=${text}`))
    s.push(raw.slice(0, at))
    s.push(raw.slice(at))
    expect(got).toEqual(['a=甲', 'b=乙', 'c=丙'])
    expect(s.end()).toEqual([])
  }
})

it('不把输入 s/s 回显、嵌套段落或未知段号当作有效译文', () => {
  const got: string[] = []
  const s = createTagSplitter(['a', 'b', 'c'], (id, text) => got.push(`${id}=${text}`))
  s.push('<s id="a">source</s><s id="unknown">伪造</t><t id="b">外层<s id="c">丙</t>')
  s.push('<s id="c">重复</t>')
  expect(got).toEqual(['c=丙'])
  expect(s.end()).toEqual(['a', 'b'])
})
