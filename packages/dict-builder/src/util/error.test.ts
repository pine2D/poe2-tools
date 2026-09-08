import { describe, expect, it } from 'vitest'
import { errorMessage } from './error'

describe('errorMessage', () => {
  it('Error 取 message，其余值转字符串', () => {
    expect(errorMessage(new Error('坏了'))).toBe('坏了')
    expect(errorMessage('原始字符串')).toBe('原始字符串')
    expect(errorMessage(42)).toBe('42')
  })
})
