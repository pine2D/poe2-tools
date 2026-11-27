import { describe, expect, it } from 'vitest'
import { acceptCachedTranslation, acceptTranslation } from './accept'
import { checkTranslation } from './check'
import { createMatcher } from './matcher'
import { prepareBlock } from './prepare'

const matcher = createMatcher({
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'synthetic',
  entries: [],
  abbreviations: [],
})
const prepare = (text: string) => prepareBlock({ id: 'dial', kind: 'paragraph', text }, matcher)
const check = (source: string, output: string) =>
  checkTranslation(prepare(source), output, { missing: [], duplicated: [] }, 'stop')

describe('百分比和计数单位（自造段落）', () => {
  it('数字和百分号均保留时，仍提示核对额外的次数，译文照原样交给阅读器', () => {
    const block = prepare('The dial bonus caps at 37%.')
    expect(acceptTranslation(block, '刻度加成上限为 ⟦0⟧ 次。', 'stop')).toEqual({
      accepted: true,
      text: '刻度加成上限为 37% 次。',
      issues: [{ kind: 'number-unit', detail: expect.stringMatching(/37%.*(?:计数|次数)/) }],
    })
  })

  it.each([
    '刻度加成最多为 12.5％次。',
    '刻度加成最多为 12.5% 的次数。',
    '刻度加成达到 12.5 % 次后，指针会亮。',
    '刻度加成最多可获得 12.5% 次叠加。',
    '刻度加成上限为 12.5% 的重复次数。',
    '刻度加成的次数上限为 12.5%。',
  ])('同一百分比被当作次数或次数上限时提示核对：%s', (output) => {
    expect(check('The dial bonus caps at 12.5%.', output)).toEqual([
      { kind: 'number-unit', detail: expect.stringContaining('12.5%') },
    ])
  })

  it.each([
    ['Cap the dial bonus at 12.5%.', '刻度加成上限为 12.5％。'],
    ['Raise the number of uses by 18%.', '使用次数提升 18%。'],
    ['Grant 18% more uses.', '使用次数总增 18%。'],
    ['Sample 18% of the activations.', '抽查其中 18% 的触发次数。'],
    ['Sample 18% of successful attempts.', '抽查其中 18% 的尝试次数。'],
    ['This occurs in 18% of cases.', '这种情况发生在 18% 的次数里。'],
    ['Sample 18% of all previously failed attempts.', '抽查此前失败记录中 18% 的尝试次数。'],
    [
      'This occurs in 18% of the observed cases.',
      '在已观察的记录中，这种情况发生在 18% 的次数里。',
    ],
    ['Grant an 18% increase in the number of uses.', '增加 18% 的使用次数。'],
    ['The attempt count rose by 18%.', '新增的尝试占原来 18% 的次数。'],
    ['Mark the dial 18% of the time.', '在其中 18% 的次数里标记刻度。'],
    ['Grant a 9% secondary bonus.', '获得 9% 的次要加成。'],
    ['Apply a 9% secondary penalty.', '施加 9% 次级惩罚。'],
    ['Set the bonus to 9%. Allow 3 uses.', '加成为 9%。次数上限为 3。'],
    ['Set the bonus to 9%. Allow 3 uses.', '加成为 9%\n次数上限为 3。'],
    ['Set the bonus to 9%. Raise the count by 8%.', '加成为 9%，次数提升 8%。'],
    ['Turn the dial 3 times to reach 21%.', '旋转 3 次，读数可达 21%。'],
    ['Keep the literal label “13% 次”.', '保留标签“13% 次”。'],
  ])('保留正确的百分比及相邻表述：%s', (source, output) => {
    expect(check(source, output)).toEqual([])
  })

  it('逐个对齐百分比，译序调换后仍只提示没有计数依据的值', () => {
    const source = 'Sample 40% of all successful attempts and cap the dial bonus at 17%.'
    const issues = check(source, '刻度加成最多 17% 次，抽查其中 40% 的次数。')
    expect(issues).toEqual([{ kind: 'number-unit', detail: expect.stringContaining('17%') }])
    expect(issues[0]?.detail).not.toContain('40%')
    expect(check(source, '刻度加成最多 17%，抽查其中 40% 的次数。')).toEqual([])
  })

  it('相邻整数的次数不能充当百分比的计数依据', () => {
    expect(check('Turn the dial 3 times at 21% power.', '转动 3 次，功率为 21% 次。')).toEqual([
      { kind: 'number-unit', detail: expect.stringContaining('21%') },
    ])
  })

  it('同一短语中的两个百分比只有一个表示尝试次数的占比', () => {
    const source = 'Sample 18% of successful attempts at 37% power.'
    const issues = check(source, '在 37% 次的功率下，抽查其中 18% 的尝试次数。')
    expect(issues).toEqual([{ kind: 'number-unit', detail: expect.stringContaining('37%') }])
    expect(issues[0]?.detail).not.toContain('18%')
  })

  it.each([
    [
      'Use 37% of the dial power, then log successful attempts.',
      '刻度消耗 37% 次的能量，再记录成功的尝试。',
    ],
    ['Use 37% of the dial power and count attempts.', '刻度消耗 37% 次的能量，并统计尝试次数。'],
    ['Use 37% of the dial power in 3 cases.', '在 3 种情况下，刻度消耗 37% 次的能量。'],
    ['Log 3 successful attempts at 37% power.', '在 37% 次的功率下记录 3 次成功尝试。'],
  ])('其他分句或数值中的计数不能解释 37%：%s', (source, output) => {
    expect(check(source, output)).toEqual([
      { kind: 'number-unit', detail: expect.stringMatching(/37%.*次数/) },
    ])
  })

  it('再次阅读缓存时移除对合法次数的旧警告，并保留原译文', () => {
    const text = '这种情况发生在 18% 的次数里。'
    const cached = acceptCachedTranslation(prepare('This occurs in 18% of cases.'), text, [
      { kind: 'number-unit', detail: '请核对 18% 是否被译成了次数。' },
    ])
    expect(cached).toEqual({ accepted: true, text, issues: [] })
  })

  it('同值百分比只有一处有计数依据时，不能放过两处计数', () => {
    const source = 'Sample 13% of attempts. The dial bonus caps at 13%.'
    expect(check(source, '抽查其中 13% 的次数。刻度加成上限为 13%。')).toEqual([])
    expect(check(source, '抽查其中 13% 的次数。刻度加成上限为 13% 次。')).toEqual([
      { kind: 'number-unit', detail: expect.stringContaining('13%') },
    ])
  })
})
