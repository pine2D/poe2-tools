import type { SettingsValues } from './config'
import { el } from './dom'
import type { Provider } from './engines/openai'
import { originOf } from './store/keys'

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
  /** 清除数据后重新读取 Key、占用与偏好并回填表单 */
  onRefresh(): Promise<void>
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

const PROVIDER_NOTE: Record<Provider, string> = {
  deepseek: 'DeepSeek 的服务条款没有承诺不使用你提交的内容训练模型，请自行评估。',
  custom: '数据如何使用以所选服务商的条款为准。',
}

// 失败原因只取一行短文字，避免把长错误堆进设置页
const shortReason = (error: unknown) =>
  (error instanceof Error && error.message.trim() ? error.message.trim() : '未知错误').slice(0, 80)

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
  const confirmText = el(doc, 'span')
  // 确认框写明实际发送到的来源，随地址输入实时更新
  const updateConfirm = () => {
    const origin = originOf(baseUrl.value.trim())
    confirmText.textContent = `我确认把选中的攻略段落发送到${origin ? ` ${origin}` : '（地址无效）'}`
  }
  baseUrl.addEventListener('input', updateConfirm)
  const customFields = el(
    doc,
    'div',
    { class: 'custom-fields', hidden: true },
    field('接口地址（Base URL）', baseUrl),
    field('模型名', model),
    field('额外请求参数（高级）', extra),
    el(doc, 'label', { class: 'field-check' }, confirm, confirmText),
  )
  const apiKey = el(doc, 'input', {
    name: 'apiKey',
    type: 'password',
    autocomplete: 'off',
    spellcheck: 'false',
  })
  const message = el(doc, 'p', { class: 'settings-message', role: 'status' })
  const providerNote = el(doc, 'p', { class: 'note provider-note' })
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
  // 按钮操作：成功时写结果，失败时写“操作失败：原因”，不留未处理的 Promise
  const act = (task: () => Promise<string>) => () =>
    void task().then(
      (text) => (message.textContent = text),
      (error: unknown) => (message.textContent = `操作失败：${shortReason(error)}`),
    )
  const form = el(doc, 'form', { class: 'settings-form' })
  const values = (): SettingsValues => ({
    // 逐个读 checked 属性，不用 :checked 选择器（happy-dom 会缓存伪类查询结果）
    provider:
      ([...form.querySelectorAll<HTMLInputElement>('input[name="provider"]')].find((r) => r.checked)
        ?.value as Provider) ?? 'deepseek',
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
      providerNote,
    ),
    customFields,
    field('Key', apiKey),
    el(
      doc,
      'p',
      { class: 'note key-note' },
      '扩展不内置任何 Key。Key 只保存在本机扩展存储，未加密；网页和本扩展注入网页的脚本都读不到。建议为本扩展单独创建 Key 并设置额度上限。',
    ),
    el(
      doc,
      'div',
      { class: 'settings-actions' },
      button(
        '测试连接',
        'pt-btn--quiet test',
        act(() => h.onTest(values())),
      ),
      button(
        '保存',
        'save',
        act(async () => {
          const error = await h.onSave(values())
          if (!error) apiKey.value = ''
          return error ?? '已保存。'
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
        act(async () => {
          await h.onSaveLimits(Number(charLimit.value), Number(cacheLimit.value))
          return '限额已保存，重新打开侧边栏后缓存上限生效。'
        }),
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
        'pt-btn--quiet clear-cache',
        act(async () => {
          await h.onClearCache()
          await h.onRefresh()
          return '缓存已清除。'
        }),
      ),
      button(
        '清除全部数据（含 Key）',
        'pt-btn--quiet clear-all',
        act(async () => {
          await h.onClearAll()
          await h.onRefresh()
          return '已清除 Key、译文缓存、自定义接口的地址、模型与额外参数，以及已确认的发送地址。'
        }),
      ),
    ),
  )
  const updateProvider = () => {
    const provider = values().provider
    customFields.hidden = provider !== 'custom'
    providerNote.textContent = PROVIDER_NOTE[provider]
  }
  form.addEventListener('change', updateProvider)
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
      updateProvider()
      updateConfirm()
      usage.textContent = `译文缓存约 ${Math.ceil(usageBytes / 1024)} KB`
    },
    setMessage(text) {
      message.textContent = text
    },
  }
}
