import { describe, expect, it } from 'vitest'
import * as core from './index'

const matcher = core.createMatcher({
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'test',
  entries: [],
  abbreviations: [],
})
const block = (text: string) => core.prepareBlock({ id: 'b0', kind: 'paragraph', text }, matcher)

describe('输出格式接纳', () => {
  const prepared = block('Pay 500% more Tribute.')
  it.each([
    '需支付 ⟦0⟧ <m zh="总增">总增</m>贡品。',
    '需支付 ⟦0⟧ &lt;m zh="总增"&gt;总增&lt;/m&gt;贡品。',
    '需支付 ⟦0⟧ &#60;context&#62;其他段落&#60;/context&#62;。',
    '需支付 ⟦0⟧ &amp;lt;quoted-stat&amp;gt;其他段落。',
    '需支付 ⟦0⟧ 总增贡品。<m zh=',
    '需支付 ⟦0⟧ 总增贡品 ⟦999⟧。',
    '需支付 ⟦0⟧ 总增贡品 ⟦wrong⟧。',
    '需支付 ⟦0⟧ 总增贡品 ⟦',
    '需支付总增贡品。',
    '需支付 ⟦0⟧ ⟦0⟧ 总增贡品。',
  ])('拒绝异常协议或占位：%s', (raw) => {
    const result = core.acceptTranslation(prepared, raw, 'stop')
    expect(result.accepted).toBe(false)
    expect('text' in result).toBe(false)
  })
  it('正确恢复数字，术义警告不冒充协议失败', () => {
    const result = core.acceptTranslation(prepared, '需支付 ⟦0⟧ 贡品。', 'stop')
    expect(result).toMatchObject({ accepted: true, text: '需支付 500% 贡品。' })
    if (result.accepted) expect(result.issues.some((i) => i.kind === 'modifier')).toBe(true)
  })
  it.each(['<m zh="总增">more</m>', '&lt;context&gt;example&lt;/context&gt;', '⟦999⟧', '<context'])(
    '源文同形文本完整保护：%s',
    (literal) => {
      const b = block(`Keep ${literal} unchanged.`)
      const result = core.acceptTranslation(
        b,
        b.protectedText.replace('Keep ', '保留 ').replace(' unchanged.', ' 不变。'),
        'stop',
      )
      expect(result.accepted).toBe(true)
      if (result.accepted) {
        expect(result.text).toContain(literal)
        expect(core.acceptCachedTranslation(b, result.text, result.issues).accepted).toBe(true)
      }
    },
  )
  it('缓存残留协议不因没有历史警告而通过', () => {
    expect(
      core.acceptCachedTranslation(prepared, '需支付 500% <m zh="总增">总增</m>贡品。', [])
        .accepted,
    ).toBe(false)
    expect(
      core.acceptCachedTranslation(prepared, '需支付 500% 总增贡品 ⟦999⟧。', []).accepted,
    ).toBe(false)
  })
  it('请求截断不接纳为可缓存结果', () => {
    expect(core.acceptTranslation(prepared, '需支付 ⟦0⟧ 总增贡品。', 'length').accepted).toBe(false)
  })
})

it('缓存缺少源文保护内容不能依赖空历史问题放行', () => {
  const b = block('Keep `x <m>` unchanged.')
  expect(core.acceptCachedTranslation(b, '保持不变。', []).accepted).toBe(false)
})
