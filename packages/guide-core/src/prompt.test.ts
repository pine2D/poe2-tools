import { describe, expect, it } from 'vitest'
import { createMatcher } from './matcher'
import { prepareBlock } from './prepare'
import { buildMessages, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt'
import type { GuideDictionary } from './types'

const dict: GuideDictionary = {
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'h',
  entries: [
    { id: 'gem:C', en: 'Contagion', zh: '瘟疫', kind: 'gem', tier: 'gray' },
    { id: 'p:U', en: 'Unbreakable', zh: '坚韧', kind: 'passive', tier: 'gray' },
    { id: 'g:U', en: 'Unbreakable', zh: '不摧', kind: 'gem', tier: 'gray' },
    { id: 'p:L', en: 'Life', zh: '生命', kind: 'passive', tier: 'gray' },
  ],
  abbreviations: [{ en: 'ES', note: 'Energy Shield' }],
}
const m = createMatcher(dict)

describe('buildMessages', () => {
  it('系统提示固定，用户消息含术语表、修饰词、简称与带段号的原文', () => {
    const blocks = [
      prepareBlock({ id: 'b1', kind: 'paragraph', text: 'Cast Contagion for 30% more ES.' }, m),
      prepareBlock(
        { id: 'b2', kind: 'paragraph', text: 'Take Unbreakable. life matters. REGEX: "a|b"' },
        m,
      ),
    ]
    const [system, user] = buildMessages(blocks, 'D7')
    expect(PROMPT_VERSION).toBe('guide-v1')
    expect(system).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    expect(user?.role).toBe('user')
    const c = user?.content ?? ''
    expect(c).toContain('- Contagion → 瘟疫')
    expect(c).toContain('- Unbreakable → 坚韧 或 不摧（按语境选择）')
    expect(c).not.toContain('Life → 生命') // hint 不注入
    expect(c).toContain('- b1：「30% more」→ 总增')
    expect(c).toContain('ES')
    expect(c).toContain(
      '<<<D7>>>\n<s id="b1">Cast Contagion for 30% more ES.</s>\n<s id="b2">Take Unbreakable. life matters. REGEX: ⟦0⟧</s>\n<<<END-D7>>>',
    )
  })
  it('同一术语在多段出现只列一次', () => {
    const blocks = [
      prepareBlock({ id: 'a', kind: 'paragraph', text: 'Use Contagion' }, m),
      prepareBlock({ id: 'b', kind: 'paragraph', text: 'Use Contagion again' }, m),
    ]
    const c = buildMessages(blocks, 'X')[1]?.content ?? ''
    expect(c.split('Contagion → 瘟疫').length - 1).toBe(1)
  })
})
