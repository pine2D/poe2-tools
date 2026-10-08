import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSettingsView, type SettingsHandlers } from '../src/guide/view-settings'

afterEach(() => {
  document.body.textContent = ''
})

describe('createSettingsView', () => {
  it('Key 输入框为密码类型且不回填，已保存时提示可留空', () => {
    const v = createSettingsView(document, {
      onSave: vi.fn(),
      onSaveLimits: vi.fn(),
      onTest: vi.fn(),
      onClearCache: vi.fn(),
      onClearAll: vi.fn(),
      onClose: vi.fn(),
    })
    document.body.append(v.root)
    v.fill(
      { provider: 'deepseek', baseUrl: '', model: '', extraBody: '' },
      { charLimit: 20000, cacheLimitMb: 50 },
      true,
      2048,
    )
    const key = document.querySelector<HTMLInputElement>('input[name="apiKey"]')
    expect(key?.type).toBe('password')
    expect(key?.value).toBe('')
    expect(key?.getAttribute('autocomplete')).toBe('off')
    expect(key?.placeholder).toContain('已保存')
    expect(document.querySelector('.usage')?.textContent).toContain('2 KB')
  })
  it('保存时提交表单值，选择自定义时显示地址、模型与确认框', async () => {
    const onSave = vi.fn<SettingsHandlers['onSave']>(async () => null)
    const v = createSettingsView(document, {
      onSave,
      onSaveLimits: vi.fn(),
      onTest: vi.fn(),
      onClearCache: vi.fn(),
      onClearAll: vi.fn(),
      onClose: vi.fn(),
    })
    document.body.append(v.root)
    v.fill(
      { provider: 'deepseek', baseUrl: '', model: '', extraBody: '' },
      { charLimit: 20000, cacheLimitMb: 50 },
      false,
      0,
    )
    document.querySelector<HTMLInputElement>('input[value="custom"]')?.click()
    expect(document.querySelector<HTMLElement>('.custom-fields')?.hidden).toBe(false)
    const set = (name: string, value: string) => {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[name="${name}"]`,
      )
      if (input) input.value = value
    }
    set('baseUrl', 'https://a.example/v1')
    set('model', 'm')
    set('apiKey', 'k')
    document.querySelector<HTMLInputElement>('input[name="confirmOrigin"]')?.click()
    document.querySelector<HTMLButtonElement>('.save')?.click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0]?.[0]).toEqual({
      provider: 'custom',
      baseUrl: 'https://a.example/v1',
      model: 'm',
      apiKey: 'k',
      extraBody: '',
      confirmOrigin: true,
    })
  })
})

describe('guide.css', () => {
  it('阅读视图根节点带 hidden 时隐藏（打开设置时切换视图）', () => {
    const style = document.createElement('style')
    style.textContent = readFileSync('apps/poe2-extension/src/guide/guide.css', 'utf8')
    document.head.append(style)
    const root = document.createElement('section')
    root.className = 'guide'
    root.hidden = true
    document.body.append(root)
    expect(getComputedStyle(root).display).toBe('none')
    style.remove()
  })
})
