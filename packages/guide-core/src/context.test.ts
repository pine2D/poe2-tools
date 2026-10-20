import { describe, expect, it } from 'vitest'
import { buildContexts } from './context'
import type { GuideBlock } from './types'

const p = (id: string, text: string, extra: Partial<GuideBlock> = {}): GuideBlock => ({
  id,
  text,
  kind: 'paragraph',
  ...extra,
})

describe('buildContexts', () => {
  it('只取选定范围，同一段的语境不随请求批次变化，并隔离其他阶段', async () => {
    const blocks = [
      p('h', 'Crafting', { kind: 'heading' }),
      p('a', 'Remove one suffix.', { stageId: 's1' }),
      p('b', 'Then add it again.', { stageId: 's1' }),
      p('secret', 'Never selected stage.', { stageId: 's2' }),
    ]
    const contexts = await buildContexts(blocks)
    expect(contexts.get('b')?.text).toContain('Remove one suffix.')
    expect(contexts.get('b')?.text).not.toContain('Never selected')
    expect(contexts.get('h')?.text).not.toContain('Remove one suffix.')
    expect((await buildContexts(blocks.filter((b) => b.id === 'b'))).get('b')?.text).not.toContain(
      'Remove one suffix.',
    )
    expect(contexts.get('b')?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect((await buildContexts(blocks)).get('b')).toEqual(contexts.get('b'))
    const changed = await buildContexts(
      blocks.map((b) => (b.id === 'a' ? { ...b, text: 'Keep the suffix.' } : b)),
    )
    expect(changed.get('b')?.fingerprint).not.toBe(contexts.get('b')?.fingerprint)
  })
  it('表格以同行、列标题和已选标题关联提供语境，长度有界且不取代码或截断片段', async () => {
    const blocks = [
      p('h', 'Gear', { kind: 'heading' }),
      p('head', 'Target', {
        kind: 'table-cell',
        context: { tableId: 't', rowId: 'r0', column: 1, header: true },
      }),
      p('row', 'Gloves', { kind: 'table-cell', context: { tableId: 't', rowId: 'r1', column: 0 } }),
      p('cell', 'Life', {
        kind: 'table-cell',
        context: { tableId: 't', rowId: 'r1', column: 1, headingIds: ['h'] },
      }),
      p('code', 'DO NOT SEND THIS CODE', { kind: 'verbatim' }),
      p('cut', 'TRUNCATED SECRET', { truncated: true }),
      p('long', 'word '.repeat(2000)),
    ]
    const contexts = await buildContexts(blocks)
    const text = contexts.get('cell')?.text ?? ''
    expect(text).toContain('Target')
    expect(text).toContain('Gloves')
    expect(text).toContain('Gear')
    expect(text).not.toContain('DO NOT SEND')
    expect(text).not.toContain('TRUNCATED')
    for (const c of contexts.values()) expect(c.text.length).toBeLessThanOrEqual(1400)
  })
})
