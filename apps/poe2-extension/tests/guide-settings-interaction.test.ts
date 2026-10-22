import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSettingsView, type SettingsHandlers } from '../src/guide/view-settings'

const mount = (over: Partial<SettingsHandlers> = {}) => {
  const h: SettingsHandlers = {
    onSave: vi.fn(async () => null),
    onSaveLimits: vi.fn(async () => {}),
    onTest: vi.fn(async () => '连接正常。'),
    onClearCache: vi.fn(async () => {}),
    onClearAll: vi.fn(async () => {}),
    onRefresh: vi.fn(async () => {}),
    onClose: vi.fn(),
    ...over,
  }
  const v = createSettingsView(document, h)
  document.body.append(v.root)
  v.root.hidden = false
  v.fill(
    { provider: 'deepseek', baseUrl: '', model: '', extraBody: '' },
    { charLimit: 20000, cacheLimitMb: 50 },
    false,
    0,
  )
  return { v, h }
}
const required = <T extends HTMLElement>(selector: string): T => {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`missing ${selector}`)
  return node
}
const input = (name: string) => required<HTMLInputElement>(`[name="${name}"]`)
const button = (name: string) => required<HTMLButtonElement>(`.${name}`)
afterEach(() => {
  document.body.textContent = ''
})

describe('设置防错与异步反馈', () => {
  it('保存服务前保护未保存限额，取消保留草稿，确认才单独保存服务', async () => {
    const { h } = mount()
    input('charLimit').value = '21000'
    input('charLimit').dispatchEvent(new Event('input', { bubbles: true }))
    button('save').click()
    expect(h.onSave).not.toHaveBeenCalled()
    expect(required<HTMLElement>('.leave-confirmation').hidden).toBe(false)
    expect(document.activeElement).toBe(button('cancel-leave'))
    button('cancel-leave').click()
    expect(input('charLimit').value).toBe('21000')
    expect(document.activeElement).toBe(button('save'))
    button('save').click()
    button('confirm-leave').click()
    await vi.waitFor(() => expect(h.onSave).toHaveBeenCalledOnce())
    expect(h.onSaveLimits).not.toHaveBeenCalled()
  })
  it('保存限额不抹掉服务草稿，返回时仍确认，Escape 回到返回按钮', async () => {
    const { h } = mount()
    input('apiKey').value = 'draft-only'
    input('charLimit').value = '21000'
    button('save-limits').click()
    await vi.waitFor(() => expect(button('save-limits').disabled).toBe(false))
    button('settings-back').click()
    expect(h.onClose).not.toHaveBeenCalled()
    expect(required<HTMLElement>('.leave-confirmation').textContent).toContain('翻译服务')
    button('cancel-leave').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    expect(document.activeElement).toBe(button('settings-back'))
    expect(input('apiKey').value).toBe('draft-only')
    button('settings-back').click()
    button('confirm-leave').click()
    expect(h.onClose).toHaveBeenCalledOnce()
  })
  it('清除缓存保留正在编辑的服务和限额', async () => {
    const { h } = mount()
    input('apiKey').value = 'draft-only'
    input('charLimit').value = '21000'
    button('clear-cache').click()
    await vi.waitFor(() => expect(button('clear-cache').disabled).toBe(false))
    expect(h.onRefresh).not.toHaveBeenCalled()
    expect(input('apiKey').value).toBe('draft-only')
    expect(input('charLimit').value).toBe('21000')
  })
  it('清除翻译数据后限额草稿仍在，返回仍提示未保存', async () => {
    let refresh = () => {}
    const { v, h } = mount({ onRefresh: async () => refresh() })
    refresh = () =>
      v.fill(
        { provider: 'deepseek', baseUrl: '', model: '', extraBody: '' },
        { charLimit: 20000, cacheLimitMb: 50 },
        false,
        0,
      )
    input('charLimit').value = '21000'
    button('clear-all').click()
    button('confirm-clear').click()
    await vi.waitFor(() => expect(button('clear-all').disabled).toBe(false))
    expect(input('charLimit').value).toBe('21000')
    button('settings-back').click()
    expect(h.onClose).not.toHaveBeenCalled()
    expect(required<HTMLElement>('.leave-confirmation').textContent).toContain('限额')
  })
  it.each([false, true])('异步完成恢复丢失焦点，尊重用户已移动的焦点=%s', async (moveFocus) => {
    let resolve!: (value: string) => void
    mount({
      onTest: () =>
        new Promise((done) => {
          resolve = done
        }),
    })
    const test = button('test')
    test.focus()
    test.click()
    const temporary = document.createElement('button')
    document.body.append(temporary)
    temporary.focus()
    temporary.remove()
    expect(document.activeElement).toBe(document.body)
    const target = button('settings-back')
    if (moveFocus) target.focus()
    resolve('连接正常。')
    await vi.waitFor(() => expect(test.disabled).toBe(false))
    expect(document.activeElement).toBe(moveFocus ? target : test)
  })
  it.each([
    ['charLimit', '500'],
    ['charLimit', '200001'],
    ['charLimit', '1000.5'],
    ['charLimit', ''],
    ['cacheLimitMb', '4'],
    ['cacheLimitMb', '501'],
    ['cacheLimitMb', '5.5'],
  ])('拒绝无效 %s=%s，不写入，并把焦点和错误关联到字段', (name, value) => {
    const { h } = mount()
    input(name).value = value
    button('save-limits').click()
    expect(h.onSaveLimits).not.toHaveBeenCalled()
    expect(input(name).getAttribute('aria-invalid')).toBe('true')
    const error = document.getElementById(input(name).getAttribute('aria-describedby') ?? '')
    expect(error?.textContent).toContain('整数')
    expect(document.activeElement).toBe(input(name))
  })
  it('保存有效整数限额，成功反馈列出实际保存值', async () => {
    const { h } = mount()
    input('charLimit').value = '2500'
    input('cacheLimitMb').value = '51'
    button('save-limits').click()
    await vi.waitFor(() => expect(h.onSaveLimits).toHaveBeenCalledWith(2500, 51))
    await vi.waitFor(() =>
      expect(document.querySelector('.limits-message')?.textContent).toContain('2500'),
    )
    expect(document.querySelector('.limits-message')?.textContent).toContain('51 MB')
  })
  it('连接测试立即显示等待状态，重复点击只发一次，完成后恢复', async () => {
    let resolve!: (value: string) => void
    const onTest = vi.fn<SettingsHandlers['onTest']>(
      () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    )
    mount({ onTest })
    const test = button('test')
    test.click()
    test.click()
    expect(onTest).toHaveBeenCalledTimes(1)
    expect(test.disabled).toBe(true)
    expect(test.getAttribute('aria-busy')).toBe('true')
    expect(document.querySelector('.service-message')?.textContent).toContain('正在测试')
    resolve('连接正常。')
    await vi.waitFor(() => expect(test.disabled).toBe(false))
    expect(test.textContent).toBe('测试连接')
    expect(document.querySelector('.service-message')?.textContent).toBe('连接正常。')
  })
  it('取消连接测试后忽略迟到的结果，不阻塞下一次操作', async () => {
    let resolve!: (value: string) => void
    const onTest = vi.fn<SettingsHandlers['onTest']>(
      () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    )
    mount({ onTest })
    button('test').click()
    button('cancel-test').click()
    expect(onTest.mock.calls[0]?.[1].aborted).toBe(true)
    expect(button('test').disabled).toBe(false)
    resolve('迟到的成功')
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('.service-message')?.textContent).toBe('已取消测试。')
  })
  it('清除 Key 先显示范围，取消或 Escape 不清除；确认才执行一次', async () => {
    const { h } = mount()
    const trigger = button('clear-all')
    trigger.focus()
    trigger.click()
    expect(h.onClearAll).not.toHaveBeenCalled()
    const confirmation = required<HTMLElement>('.clear-confirmation')
    expect(confirmation.hidden).toBe(false)
    expect(confirmation.textContent).toContain('自定义接口')
    expect(document.activeElement).toBe(button('cancel-clear'))
    button('cancel-clear').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    expect(confirmation.hidden).toBe(true)
    expect(document.activeElement).toBe(trigger)
    expect(h.onClearAll).not.toHaveBeenCalled()
    trigger.click()
    button('confirm-clear').click()
    button('confirm-clear').click()
    await vi.waitFor(() => expect(h.onClearAll).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(confirmation.hidden).toBe(true))
  })
})
