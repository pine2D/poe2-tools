import type { SettingsValues } from './config'
import { el } from './dom'
import type { Provider } from './engines/openai'

export interface Limits {
  charLimit: number
  cacheLimitMb: number
}

export interface SettingsHandlers {
  onSave(values: SettingsValues): Promise<string | null>
  onSaveLimits(charLimit: number, cacheLimitMb: number): Promise<void>
  onTest(values: SettingsValues): Promise<string>
  onClearCache(): Promise<void>
  onClearAll(): Promise<void>
  onClose(): void
}

export interface SettingsView {
  root: HTMLElement
  fill(
    values: Omit<SettingsValues, 'apiKey' | 'confirmOrigin'>,
    limits: Limits,
    hasKey: boolean,
    usageBytes: number,
  ): void
  setMessage(text: string): void
}

export function createSettingsView(doc: Document, h: SettingsHandlers): SettingsView {
  const radio = (value: Provider, label: string) =>
    el(
      doc,
      'label',
      { class: 'provider' },
      el(doc, 'input', { type: 'radio', name: 'provider', value }),
      label,
    )
  const field = (label: string, input: HTMLElement) =>
    el(doc, 'label', { class: 'field' }, el(doc, 'span', {}, label), input)
  const baseUrl = el(doc, 'input', {
    name: 'baseUrl',
    type: 'url',
    placeholder: 'https://…/v1',
    autocomplete: 'off',
  })
  const model = el(doc, 'input', { name: 'model', type: 'text', autocomplete: 'off' })
  const extra = el(doc, 'textarea', {
    name: 'extraBody',
    rows: '3',
    placeholder: '可选，例如 {"top_p": 0.9}',
  })
  const confirm = el(doc, 'input', { type: 'checkbox', name: 'confirmOrigin' })
  const customFields = el(
    doc,
    'div',
    { class: 'custom-fields', hidden: true },
    field('接口地址（Base URL）', baseUrl),
    field('模型名', model),
    field('额外请求参数（高级）', extra),
    el(doc, 'label', { class: 'field-check' }, confirm, '我确认把选中的攻略段落发送到这个地址'),
  )
  const apiKey = el(doc, 'input', {
    name: 'apiKey',
    type: 'password',
    autocomplete: 'off',
    spellcheck: 'false',
  })
  const message = el(doc, 'p', { class: 'settings-message', role: 'status' })
  const usage = el(doc, 'p', { class: 'usage' })
  const charLimit = el(doc, 'input', {
    name: 'charLimit',
    type: 'number',
    min: '1000',
    max: '200000',
    step: '1000',
  })
  const cacheLimit = el(doc, 'input', {
    name: 'cacheLimitMb',
    type: 'number',
    min: '5',
    max: '500',
    step: '5',
  })
  const button = (label: string, cls: string, on: () => void) => {
    const b = el(doc, 'button', { class: `pt-btn ${cls}`, type: 'button' }, label)
    b.addEventListener('click', on)
    return b
  }
  const form = el(doc, 'form', { class: 'settings-form' })
  const values = (): SettingsValues => ({
    provider:
      (form.querySelector<HTMLInputElement>('input[name="provider"]:checked')?.value as Provider) ??
      'deepseek',
    baseUrl: baseUrl.value,
    model: model.value,
    apiKey: apiKey.value,
    extraBody: extra.value,
    confirmOrigin: confirm.checked,
  })
  form.append(
    el(
      doc,
      'fieldset',
      {},
      el(doc, 'legend', {}, '翻译服务'),
      radio('deepseek', 'DeepSeek（默认）'),
      radio('custom', 'OpenAI 兼容自定义接口'),
    ),
    customFields,
    field('Key', apiKey),
    el(
      doc,
      'p',
      { class: 'note' },
      '扩展不内置任何 Key。建议为本扩展单独创建 Key 并设置额度上限。Key 只保存在本机扩展存储，未加密，网页读不到。',
    ),
    el(
      doc,
      'div',
      { class: 'settings-actions' },
      button(
        '测试连接',
        'pt-btn--quiet test',
        () => void h.onTest(values()).then((t) => (message.textContent = t)),
      ),
      button(
        '保存',
        'save',
        () =>
          void h.onSave(values()).then((error) => {
            message.textContent = error ?? '已保存。'
            if (!error) apiKey.value = ''
          }),
      ),
      button('返回', 'pt-btn--quiet', () => h.onClose()),
    ),
    message,
    el(doc, 'h2', {}, '限额'),
    field('单次最多发送的英文字符数（超过先询问）', charLimit),
    field('译文缓存上限（MB）', cacheLimit),
    el(
      doc,
      'div',
      { class: 'settings-actions' },
      button(
        '保存限额',
        'pt-btn--quiet save-limits',
        () =>
          void h
            .onSaveLimits(Number(charLimit.value), Number(cacheLimit.value))
            .then(() => (message.textContent = '限额已保存，重新打开侧边栏后缓存上限生效。')),
      ),
    ),
    el(doc, 'h2', {}, '本机数据'),
    usage,
    el(
      doc,
      'div',
      { class: 'settings-actions' },
      button(
        '清除缓存',
        'pt-btn--quiet',
        () => void h.onClearCache().then(() => (message.textContent = '缓存已清除。')),
      ),
      button(
        '清除全部数据（含 Key）',
        'pt-btn--quiet',
        () => void h.onClearAll().then(() => (message.textContent = '已清除 Key、缓存与偏好。')),
      ),
    ),
  )
  form.addEventListener('change', () => {
    customFields.hidden = values().provider !== 'custom'
  })
  form.addEventListener('submit', (e) => e.preventDefault())
  const root = el(
    doc,
    'section',
    { class: 'guide-settings', hidden: true },
    el(doc, 'h1', {}, '攻略翻译设置'),
    form,
  )
  return {
    root,
    fill(v, limits, hasKey, usageBytes) {
      charLimit.value = String(limits.charLimit)
      cacheLimit.value = String(limits.cacheLimitMb)
      const r = form.querySelector<HTMLInputElement>(
        `input[name="provider"][value="${v.provider}"]`,
      )
      if (r) r.checked = true
      baseUrl.value = v.baseUrl
      model.value = v.model
      extra.value = v.extraBody
      confirm.checked = false
      apiKey.value = ''
      apiKey.placeholder = hasKey ? '已保存，留空表示不修改' : '粘贴你的 Key'
      customFields.hidden = v.provider !== 'custom'
      usage.textContent = `译文缓存约 ${Math.ceil(usageBytes / 1024)} KB`
    },
    setMessage(text) {
      message.textContent = text
    },
  }
}
