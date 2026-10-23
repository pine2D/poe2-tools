import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseTabId } from '../src/guide/chrome'
import { createSettingsView, type SettingsHandlers } from '../src/guide/view-settings'

const handlers = (over: Partial<SettingsHandlers> = {}): SettingsHandlers => ({
  onSave: vi.fn(async () => null),
  onSaveLimits: vi.fn(async () => {}),
  onTest: vi.fn(async () => '连接正常。'),
  onClearCache: vi.fn(async () => {}),
  onClearAll: vi.fn(async () => {}),
  onRefresh: vi.fn(async () => {}),
  onClose: vi.fn(),
  ...over,
})
const mountSettings = (h: SettingsHandlers, provider: 'deepseek' | 'custom' = 'deepseek') => {
  const v = createSettingsView(document, h)
  document.body.append(v.root)
  v.fill(
    { provider, baseUrl: '', model: '', extraBody: '' },
    { charLimit: 20000, cacheLimitMb: 50 },
    false,
    0,
  )
  return v
}
const text = (selector: string) => document.querySelector(selector)?.textContent
const click = (selector: string) => document.querySelector<HTMLElement>(selector)?.click()
const message = () =>
  [...document.querySelectorAll('.settings-message')]
    .map((p) => p.textContent)
    .filter(Boolean)
    .join('')

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
      onRefresh: vi.fn(),
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
      onRefresh: vi.fn(),
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

describe('设置页文案（M2）', () => {
  it('首次使用确认显示目标来源，随地址实时更新，地址无效时注明', () => {
    mountSettings(handlers(), 'custom')
    const url = document.querySelector<HTMLInputElement>('input[name="baseUrl"]')
    const confirmText = () => text('.field-check')
    expect(confirmText()).toBe('我确认把选中的攻略段落发送到（地址无效）')
    if (url) url.value = 'https://a.example/v1'
    url?.dispatchEvent(new Event('input', { bubbles: true }))
    expect(confirmText()).toBe('我确认把选中的攻略段落发送到 https://a.example')
    if (url) url.value = 'http://evil.example/v1'
    url?.dispatchEvent(new Event('input', { bubbles: true }))
    expect(confirmText()).toBe('我确认把选中的攻略段落发送到（地址无效）')
  })
  it('Key 说明与服务商数据用途说明', () => {
    mountSettings(handlers())
    expect(text('.key-note')).toBe(
      '扩展不内置任何 Key。Key 只保存在本机扩展存储，未加密；网页和本扩展注入网页的脚本都读不到。建议为本扩展单独创建 Key 并设置额度上限。',
    )
    expect(text('.provider-note')).toBe(
      'DeepSeek 的服务条款没有承诺不使用你提交的内容训练模型，请自行评估。',
    )
    click('input[value="custom"]')
    expect(text('.provider-note')).toBe('数据如何使用以所选服务商的条款为准。')
    click('input[value="deepseek"]')
    expect(text('.provider-note')).toContain('DeepSeek 的服务条款')
  })
})

describe('设置页按钮（S2、S3）', () => {
  it('仅清除翻译数据后刷新服务表单，清缓存保留草稿，提示如实列出清掉的内容', async () => {
    const h = handlers()
    mountSettings(h)
    click('.clear-cache')
    await vi.waitFor(() => expect(message()).toBe('缓存已清除。'))
    expect(h.onRefresh).not.toHaveBeenCalled()
    click('.clear-all')
    expect(h.onClearAll).not.toHaveBeenCalled()
    click('.confirm-clear')
    await vi.waitFor(() =>
      expect(message()).toBe(
        '已清除 Key、译文缓存、自定义接口的地址、模型与额外参数，以及已确认的发送地址。',
      ),
    )
    expect(h.onClearAll).toHaveBeenCalledTimes(1)
    expect(h.onRefresh).toHaveBeenCalledTimes(1)
  })
  it('按钮操作失败时显示“操作失败：原因”', async () => {
    const boom = () => Promise.reject(new Error('IndexedDB 不可用'))
    mountSettings(
      handlers({
        onTest: vi.fn(boom),
        onSave: vi.fn(boom),
        onSaveLimits: vi.fn(boom),
        onClearCache: vi.fn(boom),
        onClearAll: vi.fn(boom),
      }),
    )
    for (const selector of ['.test', '.save', '.save-limits', '.clear-cache', '.clear-all']) {
      for (const node of document.querySelectorAll('.settings-message')) node.textContent = ''
      click(selector)
      if (selector === '.clear-all') click('.confirm-clear')
      await vi.waitFor(() => expect(message()).toBe('操作失败：IndexedDB 不可用'))
    }
  })
})

describe('parseTabId（S1）', () => {
  it('只接受纯数字的 tab 参数', () => {
    expect(parseTabId('chrome-extension://x/guide.html?tab=42')).toBe(42)
    expect(parseTabId('chrome-extension://x/guide.html?tab=0')).toBe(0)
    for (const href of [
      'chrome-extension://x/guide.html',
      'chrome-extension://x/guide.html?tab=',
      'chrome-extension://x/guide.html?tab=%20',
      'chrome-extension://x/guide.html?tab=1e3',
      'chrome-extension://x/guide.html?tab=-1',
      'chrome-extension://x/guide.html?tab=0x10',
      'chrome-extension://x/guide.html?tab=1.5',
      'chrome-extension://x/guide.html?tab=99999999999999999999',
    ])
      expect(parseTabId(href)).toBeNull()
  })
})

describe('guide.css', () => {
  it('设置视图与阅读视图同样留边，字段纵排、控件占满宽，标题与边框走令牌', () => {
    const css = readFileSync('apps/poe2-extension/src/guide/guide.css', 'utf8')
    const rule = (selector: string) =>
      new RegExp(
        `(^|\\n|,\\s*)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,{][^}]*}`,
        'm',
      ).exec(css)?.[0] ?? ''
    expect(rule('.guide-settings')).toContain('padding: var(--sp-3)')
    expect(rule('.guide-settings .field')).toMatch(/flex-direction: column|display: grid/)
    const control = rule('.guide-settings input:not([type="radio"]):not([type="checkbox"])')
    expect(control).toContain('width: 100%')
    expect(control).toContain('box-sizing: border-box')
    expect(rule('.guide-settings h1')).toContain('font-size: var(--fs-title)')
    expect(rule('.guide-settings h2')).toContain('font-size: var(--fs-lead)')
    expect(rule('.guide-settings fieldset')).toContain('border: 1px solid var(--line)')
    expect(rule('.guide-settings .note')).toContain('font-size: var(--fs-small)')
    expect(rule('.guide-settings .note')).toContain('color: var(--ink-2)')
  })
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

describe('复盘第二批：设置页', () => {
  const custom = (confirmed: string[]) => {
    const v = createSettingsView(document, handlers())
    document.body.append(v.root)
    v.fill(
      { provider: 'custom', baseUrl: 'https://a.example/v1', model: 'm', extraBody: '' },
      { charLimit: 20000, cacheLimitMb: 50 },
      true,
      0,
      confirmed,
    )
    return v
  }
  const confirm = () => document.querySelector<HTMLInputElement>('input[name="confirmOrigin"]')
  it('B2-07 已确认地址显示已确认且不误报未保存；改到新地址后重新要求确认', () => {
    custom(['https://a.example'])
    expect(confirm()?.checked).toBe(true)
    expect(confirm()?.disabled).toBe(true)
    expect(text('.field-check')).toBe('已确认把选中的攻略段落发送到 https://a.example')
    expect(document.querySelector<HTMLElement>('.unsaved-service')?.hidden).toBe(true)
    const url = document.querySelector<HTMLInputElement>('input[name="baseUrl"]')
    if (url) url.value = 'https://b.example/v1'
    url?.dispatchEvent(new Event('input', { bubbles: true }))
    expect(confirm()?.checked).toBe(false)
    expect(confirm()?.disabled).toBe(false)
    expect(text('.field-check')).toBe('我确认把选中的攻略段落发送到 https://b.example')
  })
  it('B2-07 测试或保存结束解锁后，已确认地址的确认框仍保持已确认', async () => {
    custom(['https://a.example'])
    click('.test')
    await vi.waitFor(() => expect(message()).toContain('连接正常'))
    expect(confirm()?.checked).toBe(true)
    expect(confirm()?.disabled).toBe(true)
  })
  it('B2-10 确认清除使用共享危险按钮样式', () => {
    mountSettings(handlers())
    const button = document.querySelector('.confirm-clear')
    expect(button?.classList.contains('pt-btn--danger')).toBe(true)
    expect(button?.classList.contains('pt-btn--quiet')).toBe(false)
  })
  it('B2-18 Key 未加密与测试发送说明常驻可见，折叠标记与阅读页一致', () => {
    mountSettings(handlers())
    expect(document.querySelector('.key-note')?.closest('details')).toBeNull()
    expect(text('.test-note')).toBe('测试连接只发送一条简短测试消息。')
    expect(document.querySelector('.test-note')?.closest('details')).toBeNull()
    for (const summary of document.querySelectorAll('.settings-details summary'))
      expect(summary.querySelector('.ui-icon')).not.toBeNull()
  })
})
