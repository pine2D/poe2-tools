import { describe, expect, it } from 'vitest'
import { formatLine, parseLine } from './lines'

describe('parseLine', () => {
  it('编号行拆出标号与正文', () => {
    expect(parseLine('1. +175 to maximum Life')).toEqual({
      numbered: true,
      marker: '1. ',
      body: '+175 to maximum Life',
      trailing: '',
    })
  })

  it('编号行保留前导空白与尾随空白', () => {
    expect(parseLine('  12.  Adds 2 to 4 Physical Damage  ')).toEqual({
      numbered: true,
      marker: '  12.  ',
      body: 'Adds 2 to 4 Physical Damage',
      trailing: '  ',
    })
  })

  it('普通行', () => {
    expect(parseLine('Ruby Ring')).toEqual({
      numbered: false,
      marker: '',
      body: 'Ruby Ring',
      trailing: '',
    })
    expect(parseLine('  Ruby Ring \r')).toEqual({
      numbered: false,
      marker: '  ',
      body: 'Ruby Ring',
      trailing: ' \r',
    })
  })

  it('空行与纯空白行', () => {
    expect(parseLine('')).toEqual({ numbered: false, marker: '', body: '', trailing: '' })
    expect(parseLine('   ')).toEqual({ numbered: false, marker: '   ', body: '', trailing: '' })
  })

  it('只有标号没有正文不算编号行', () => {
    expect(parseLine('1.').numbered).toBe(false)
    expect(parseLine('1. ').numbered).toBe(false)
  })
})

describe('formatLine', () => {
  it('往返', () => {
    for (const s of ['1. +175 to maximum Life', '  12.  x  ', 'Ruby Ring', '', '   ', '---']) {
      expect(formatLine(parseLine(s))).toBe(s)
    }
  })
})
