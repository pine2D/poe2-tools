import { describe, expect, it } from 'vitest'
import { resolveConfig, type SettingsValues } from '../src/guide/config'

const deepseek: SettingsValues = {
  provider: 'deepseek',
  baseUrl: '',
  model: '',
  apiKey: 'sk-1',
  extraBody: '',
  confirmOrigin: false,
}
const custom: SettingsValues = {
  provider: 'custom',
  baseUrl: 'https://a.example/v1',
  model: 'm',
  apiKey: 'k',
  extraBody: '{"top_p":0.9}',
  confirmOrigin: true,
}
const saved = {
  provider: 'custom' as const,
  baseUrl: 'https://a.example/v1',
  origin: 'https://a.example',
  model: 'm',
  apiKey: 'old',
}

describe('resolveConfig', () => {
  it('DeepSeek 用固定地址与模型', () => {
    const r = resolveConfig(deepseek, null, [])
    expect(r.ok && r.config).toEqual({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKey: 'sk-1',
    })
  })
  it('自定义接口校验地址、模型与额外参数', () => {
    expect(resolveConfig({ ...custom, baseUrl: 'http://a.example' }, null, []).ok).toBe(false)
    expect(resolveConfig({ ...custom, model: ' ' }, null, []).ok).toBe(false)
    expect(resolveConfig({ ...custom, extraBody: '[1]' }, null, []).ok).toBe(false)
    const r = resolveConfig(custom, null, [])
    expect(r.ok && r.config.extraBody).toEqual({ top_p: 0.9 })
  })
  it('首次使用某个自定义地址必须勾选确认', () => {
    expect(resolveConfig({ ...custom, confirmOrigin: false }, null, [])).toEqual({
      ok: false,
      error: '首次使用这个地址，请勾选确认发送。',
    })
    expect(resolveConfig({ ...custom, confirmOrigin: false }, null, ['https://a.example']).ok).toBe(
      true,
    )
  })
  it('Key 留空时沿用同一来源的旧 Key；换了域名必须重填', () => {
    const same = resolveConfig({ ...custom, apiKey: '', baseUrl: 'https://a.example/v2' }, saved, [
      'https://a.example',
    ])
    expect(same.ok && same.config.apiKey).toBe('old')
    expect(
      resolveConfig({ ...custom, apiKey: '', baseUrl: 'https://b.example/v1' }, saved, [
        'https://b.example',
      ]),
    ).toEqual({ ok: false, error: '请填写 Key。' })
  })
})
