import { strFromU8, unzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveBlob, textBlob, uniqueNames, zipBlob, zipName } from './download'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('uniqueNames', () => {
  it('同名加序号，扩展名保留', () => {
    expect(uniqueNames(['a.build', 'a.build', 'b', 'a.build', 'b'])).toEqual([
      'a.build',
      'a (2).build',
      'b',
      'a (3).build',
      'b (2)',
    ])
  })
})

describe('zipBlob', () => {
  it('zip 内含全部文件，内容逐字节相同', async () => {
    const blob = zipBlob([
      { name: 'a.build', output: '{"a":1}' },
      { name: 'a.build', output: '{"a":2}' },
      { name: '中文.build', output: '{\n  "x": "值"\n}' },
    ])
    expect(blob.type).toBe('application/zip')
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(entries)).toEqual(['a.build', 'a (2).build', '中文.build'])
    expect(strFromU8(entries['a (2).build'] ?? new Uint8Array())).toBe('{"a":2}')
    expect(strFromU8(entries['中文.build'] ?? new Uint8Array())).toBe('{\n  "x": "值"\n}')
  })
})

describe('textBlob / zipName', () => {
  it('文本 Blob 内容与类型；zip 名带 locale', async () => {
    const blob = textBlob('{"a":1}')
    expect(await blob.text()).toBe('{"a":1}')
    expect(blob.type).toBe('application/json;charset=utf-8')
    expect(zipName('zh-TW')).toBe('build-l10n-zh-TW.zip')
  })
})

describe('saveBlob', () => {
  it('创建对象 URL、点击下载链接、延迟释放 URL（Firefox 同步 revoke 会掐断下载）', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    saveBlob(textBlob('{}'), 'x.build')
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(document.querySelector('a[download]')).toBeNull()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
})
