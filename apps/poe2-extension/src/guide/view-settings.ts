import { disclosure } from '../ui/icons'
import type { SettingsValues } from './config'
import { el } from './dom'
import type { Provider } from './engines/openai'
import { LIMIT_RANGES, limitError } from './prefs'
import { originOf } from './store/keys'

export interface Limits {
  charLimit: number
  cacheLimitMb: number
}
export interface SettingsHandlers {
  onSave(values: SettingsValues): Promise<string | null>
  onSaveLimits(charLimit: number, cacheLimitMb: number): Promise<void>
  onTest(values: SettingsValues, signal: AbortSignal): Promise<string>
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
    /** 已确认过的发送地址；当前地址在内时确认框显示为已确认 */
    confirmedOrigins?: readonly string[],
  ): void
  setMessage(text: string): void
}
const PROVIDER_NOTE: Record<Provider, string> = {
  deepseek: 'DeepSeek 的服务条款没有承诺不使用你提交的内容训练模型，请自行评估。',
  custom: '数据如何使用以所选服务商的条款为准。',
}
const shortReason = (error: unknown) =>
  (error instanceof Error && error.message.trim() ? error.message.trim() : '未知错误').slice(0, 80)

export function createSettingsView(doc: Document, h: SettingsHandlers): SettingsView {
  const radio = (value: Provider, label: string) =>
    el(
      doc,
      'label',
      { class: 'provider' },
      el(doc, 'input', { type: 'radio', name: 'provider', value }),
      el(doc, 'span', {}, label),
    )
  const field = (label: string, input: HTMLElement) =>
    el(doc, 'label', { class: 'field' }, el(doc, 'span', {}, label), input)
  const button = (label: string, cls: string, on: () => void) => {
    const b = el(doc, 'button', { class: `pt-btn ${cls}`, type: 'button' }, label)
    b.addEventListener('click', on)
    return b
  }
  const status = (cls: string) => el(doc, 'p', { class: `settings-message ${cls}`, role: 'status' })
  const message = status('service-message')
  const limitsMessage = status('limits-message')
  const dataMessage = status('data-message')
  const form = el(doc, 'form', { class: 'settings-form' })
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
  const extraSummary = disclosure(doc, '高级参数（可选）')
  const extraDetails = el(
    doc,
    'details',
    { class: 'settings-details' },
    extraSummary,
    field('额外请求参数（JSON 对象）', extra),
  )
  const confirm = el(doc, 'input', { type: 'checkbox', name: 'confirmOrigin', class: 'pt-switch' })
  const confirmText = el(doc, 'span')
  let confirmedOrigins: readonly string[] = []
  // 已确认的地址显示为已勾选且不可取消（取消也不会撤销确认）；改到新地址后重新要求确认。
  const updateConfirm = () => {
    const origin = originOf(baseUrl.value.trim())
    const confirmed = Boolean(origin && confirmedOrigins.includes(origin))
    if (confirmed) confirm.checked = true
    confirm.disabled = confirmed || Boolean(running)
    confirmText.textContent = confirmed
      ? `已确认把选中的攻略段落发送到 ${origin}`
      : `我确认把选中的攻略段落发送到${origin ? ` ${origin}` : '（地址无效）'}`
  }
  baseUrl.addEventListener('input', () => {
    confirm.checked = false
    updateConfirm()
  })
  const customFields = el(
    doc,
    'div',
    { class: 'custom-fields', hidden: true },
    field('接口地址（Base URL）', baseUrl),
    field('模型名', model),
    extraDetails,
    el(doc, 'label', { class: 'field-check' }, confirm, confirmText),
  )
  const apiKey = el(doc, 'input', {
    name: 'apiKey',
    type: 'password',
    autocomplete: 'off',
    spellcheck: 'false',
  })
  const providerNote = el(doc, 'p', { class: 'note provider-note' })
  const usage = el(doc, 'p', { class: 'usage' })
  const limitField = (name: keyof Limits) => {
    const [min, max] = LIMIT_RANGES[name]
    const input = el(doc, 'input', {
      name,
      type: 'number',
      min: String(min),
      max: String(max),
      step: '1',
      required: true,
    })
    const error = el(doc, 'p', { id: `${name}-error`, class: 'field-error', hidden: true })
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid')
      input.removeAttribute('aria-describedby')
      error.hidden = true
      limitsMessage.textContent = ''
    })
    return { input, error }
  }
  const chars = limitField('charLimit')
  const cache = limitField('cacheLimitMb')
  const values = (): SettingsValues => ({
    // 逐个读 checked 属性，避免 DOM 实现缓存伪类查询结果。
    provider:
      ([...form.querySelectorAll<HTMLInputElement>('input[name="provider"]')].find((r) => r.checked)
        ?.value as Provider) ?? 'deepseek',
    baseUrl: baseUrl.value,
    model: model.value,
    apiKey: apiKey.value,
    extraBody: extra.value,
    confirmOrigin: confirm.checked,
  })
  const serviceSnapshot = () => JSON.stringify(values())
  const limitsSnapshot = () => `${chars.input.value}/${cache.input.value}`
  let savedService = '',
    savedLimits = ''
  const serviceDirty = el(
    doc,
    'p',
    { class: 'note unsaved-service', hidden: true },
    '翻译服务有未保存的修改。',
  )
  const limitsDirty = el(
    doc,
    'p',
    { class: 'note unsaved-limits', hidden: true },
    '限额有未保存的修改，请单独保存限额。',
  )
  const updateDirty = () => {
    serviceDirty.hidden = serviceSnapshot() === savedService
    limitsDirty.hidden = limitsSnapshot() === savedLimits
  }
  let pendingLeave: { trigger: HTMLButtonElement; action: () => void } | null = null
  const leaveText = el(doc, 'p')
  const cancelLeave = button('继续编辑', 'pt-btn--quiet cancel-leave', () => {
    const trigger = pendingLeave?.trigger
    pendingLeave = null
    leaveConfirmation.hidden = true
    trigger?.focus()
  })
  const confirmLeave = button('放弃修改并返回', 'pt-btn--quiet confirm-leave', () => {
    const pending = pendingLeave
    pendingLeave = null
    leaveConfirmation.hidden = true
    if (pending) {
      pending.trigger.focus()
      pending.action()
    }
  })
  const leaveConfirmation = el(
    doc,
    'div',
    {
      class: 'leave-confirmation',
      role: 'group',
      'aria-label': '未保存的修改',
      hidden: true,
    },
    leaveText,
    el(doc, 'div', { class: 'settings-actions' }, cancelLeave, confirmLeave),
  )
  leaveConfirmation.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || running) return
    event.preventDefault()
    cancelLeave.click()
  })
  const guardLeave = (
    trigger: HTMLButtonElement,
    groups: string[],
    action: () => void,
    saving = false,
  ) => {
    if (!groups.length) {
      action()
      return
    }
    pendingLeave = { trigger, action }
    leaveText.textContent = `${groups.join('、')}有未保存的修改。${saving ? '保存服务并返回会放弃这些限额修改。' : '返回会放弃这些修改。'}`
    confirmLeave.textContent = saving ? '仅保存服务并返回' : '放弃修改并返回'
    leaveConfirmation.hidden = false
    cancelLeave.focus()
  }

  // 所有写入互斥；连接测试可以取消，迟到的结果不得覆盖新操作。
  let running: {
    button: HTMLButtonElement
    label: string
    abort: AbortController | undefined
  } | null = null
  const lock = (locked: boolean) => {
    for (const control of form.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
    >('input, textarea, button'))
      control.disabled = locked
    if (!locked) updateConfirm()
    if (locked && running?.abort) {
      cancelTest.disabled = false
      back.disabled = false
    }
  }
  const finish = () => {
    if (!running) return
    const operation = running
    const restore =
      !doc.activeElement || doc.activeElement === doc.body || doc.activeElement === cancelTest
    operation.button.textContent = operation.label
    operation.button.removeAttribute('aria-busy')
    running = null
    cancelTest.hidden = true
    lock(false)
    if (restore && root.isConnected && !root.hidden) {
      const target =
        operation.button === confirmClear && confirmation.hidden ? clearAll : operation.button
      if (!target.closest('[hidden]')) target.focus()
    }
  }
  const cancelTesting = () => {
    if (!running?.abort) return
    running.abort.abort()
    finish()
    message.textContent = '已取消测试。'
    test.focus()
  }
  const run = (
    b: HTMLButtonElement,
    target: HTMLElement,
    pending: string,
    task: () => Promise<string>,
    abort?: AbortController,
  ) => {
    if (running) return
    const operation = { button: b, label: b.textContent ?? '', abort }
    running = operation
    b.textContent = pending
    b.setAttribute('aria-busy', 'true')
    target.textContent = pending
    target.removeAttribute('data-tone')
    cancelTest.hidden = !abort
    lock(true)
    void task()
      .then(
        (text) => {
          if (running === operation) target.textContent = text
        },
        (error: unknown) => {
          if (running !== operation) return
          target.textContent = `操作失败：${shortReason(error)}`
          target.dataset.tone = 'error'
        },
      )
      .finally(() => {
        if (running !== operation) return
        finish()
      })
  }
  const test = button('测试连接', 'pt-btn--quiet test', () => {
    if (running) return
    const abort = new AbortController()
    run(
      test,
      message,
      '正在测试连接…',
      async () => {
        const timer = setTimeout(
          () => abort.abort(new Error('连接测试超过 20 秒，请检查接口地址后重试。')),
          20000,
        )
        try {
          return await h.onTest(values(), abort.signal)
        } finally {
          clearTimeout(timer)
        }
      },
      abort,
    )
  })
  const cancelTest = button('取消测试', 'pt-btn--quiet cancel-test', cancelTesting)
  cancelTest.hidden = true
  const saveService = () =>
    run(save, message, '正在保存…', async () => {
      const error = await h.onSave(values())
      if (error) {
        if (values().provider === 'custom' && extra.value.trim()) extraDetails.open = true
        throw new Error(error)
      }
      apiKey.value = ''
      savedService = serviceSnapshot()
      updateDirty()
      return '已保存。'
    })
  const save = button('保存服务并返回', 'save', () => {
    if (running) return
    guardLeave(save, limitsSnapshot() === savedLimits ? [] : ['限额'], saveService, true)
  })
  const back = button('返回', 'pt-btn--quiet settings-back', () => {
    if (running && !running.abort) return
    cancelTesting()
    const groups = []
    if (serviceSnapshot() !== savedService) groups.push('翻译服务')
    if (limitsSnapshot() !== savedLimits) groups.push('限额')
    guardLeave(back, groups, h.onClose)
  })
  const saveLimits = button('保存限额', 'pt-btn--quiet save-limits', () => {
    if (running) return
    let invalid: HTMLInputElement | null = null
    for (const [name, item] of [
      ['charLimit', chars],
      ['cacheLimitMb', cache],
    ] as const) {
      const error = limitError(name, Number(item.input.value))
      item.error.textContent = error ?? ''
      item.error.hidden = !error
      if (error) {
        item.input.setAttribute('aria-invalid', 'true')
        item.input.setAttribute('aria-describedby', item.error.id)
        invalid ??= item.input
      } else {
        item.input.removeAttribute('aria-invalid')
        item.input.removeAttribute('aria-describedby')
      }
    }
    if (invalid) {
      limitsMessage.textContent = '限额未保存，请修正标出的字段。'
      invalid.focus()
      return
    }
    const charValue = Number(chars.input.value)
    const cacheValue = Number(cache.input.value)
    run(saveLimits, limitsMessage, '正在保存限额…', async () => {
      await h.onSaveLimits(charValue, cacheValue)
      savedLimits = limitsSnapshot()
      updateDirty()
      return `已保存：${charValue} 字符、${cacheValue} MB 缓存。缓存上限在重新打开侧边栏后生效。`
    })
  })
  const clearCache = button('清除缓存', 'pt-btn--quiet clear-cache', () =>
    run(clearCache, dataMessage, '正在清除缓存…', async () => {
      await h.onClearCache()
      usage.textContent = '译文缓存约 0 KB'
      return '缓存已清除。'
    }),
  )
  const hideConfirmation = () => {
    confirmation.hidden = true
    clearAll.setAttribute('aria-expanded', 'false')
  }
  const clearAll = button('清除 Key 与翻译数据…', 'pt-btn--quiet clear-all danger-action', () => {
    if (running) return
    confirmation.hidden = false
    clearAll.setAttribute('aria-expanded', 'true')
    cancelClear.focus()
  })
  clearAll.setAttribute('aria-controls', 'clear-confirmation')
  clearAll.setAttribute('aria-expanded', 'false')
  const cancelClear = button('取消', 'pt-btn--quiet cancel-clear', () => {
    if (running) return
    hideConfirmation()
    clearAll.focus()
  })
  const confirmClear = button('确认清除', 'pt-btn--danger confirm-clear', () => {
    if (confirmation.hidden) return
    run(confirmClear, dataMessage, '正在清除…', async () => {
      const draftLimits = [chars.input.value, cache.input.value] as const
      await h.onClearAll()
      await h.onRefresh()
      chars.input.value = draftLimits[0]
      cache.input.value = draftLimits[1]
      updateDirty()
      hideConfirmation()
      return '已清除 Key、译文缓存、自定义接口的地址、模型与额外参数，以及已确认的发送地址。'
    })
  })
  const confirmation = el(
    doc,
    'div',
    {
      id: 'clear-confirmation',
      class: 'clear-confirmation',
      role: 'group',
      'aria-labelledby': 'clear-heading',
      hidden: true,
    },
    el(doc, 'strong', { id: 'clear-heading' }, '清除后需要重新配置翻译服务'),
    el(
      doc,
      'p',
      {},
      '将删除本机 Key、译文缓存、自定义接口地址、模型、额外参数及已确认的发送地址。此操作无法撤销。',
    ),
    el(doc, 'p', { class: 'note' }, '站点授权、CoE 开关与限额保留。'),
    el(doc, 'div', { class: 'settings-actions' }, cancelClear, confirmClear),
  )
  confirmation.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || running) return
    event.preventDefault()
    cancelClear.click()
  })
  const keyHelp = el(
    doc,
    'a',
    {
      class: 'key-help-link',
      href: 'https://platform.deepseek.com/api_keys',
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    '打开 DeepSeek 的 API Key 页面',
  )
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
    field('服务 Key', apiKey),
    // 未加密存储与测试会发送消息属于需要知道的事实，常驻显示在 Key 与测试按钮旁。
    el(
      doc,
      'p',
      { class: 'note key-note' },
      '扩展不内置任何 Key。Key 只保存在本机扩展存储，未加密；网页和本扩展注入网页的脚本都读不到。建议为本扩展单独创建 Key 并设置额度上限。',
    ),
    el(
      doc,
      'details',
      { class: 'settings-details' },
      disclosure(doc, 'Key 从哪里来？'),
      keyHelp,
      el(
        doc,
        'p',
        { class: 'note' },
        '在所选服务商的控制台创建 API Key，粘贴到上方。自定义接口还需填写服务商提供的地址和模型名；然后测试连接，再保存。',
      ),
    ),
    serviceDirty,
    el(doc, 'p', { class: 'note test-note' }, '测试连接只发送一条简短测试消息。'),
    el(doc, 'div', { class: 'settings-actions' }, test, cancelTest, save, back),
    leaveConfirmation,
    message,
    el(doc, 'h2', {}, '限额'),
    field('单次正文与语境字符上限（1000–200000）', chars.input),
    chars.error,
    el(doc, 'p', { class: 'note' }, '超过上限时，先询问再翻译。'),
    field('译文缓存上限（5–500 MB）', cache.input),
    cache.error,
    limitsDirty,
    el(doc, 'div', { class: 'settings-actions' }, saveLimits),
    limitsMessage,
    el(doc, 'h2', {}, '本机数据'),
    usage,
    el(doc, 'div', { class: 'settings-actions' }, clearCache, clearAll),
    confirmation,
    dataMessage,
    el(
      doc,
      'a',
      { href: 'sites.html', target: '_blank', class: 'site-settings-link' },
      '管理自动划词站点',
    ),
  )
  const updateProvider = () => {
    const provider = values().provider
    customFields.hidden = provider !== 'custom'
    keyHelp.hidden = provider !== 'deepseek'
    providerNote.textContent = PROVIDER_NOTE[provider]
  }
  form.addEventListener('change', updateProvider)
  form.addEventListener('input', updateDirty)
  form.addEventListener('change', updateDirty)
  form.addEventListener('submit', (e) => e.preventDefault())
  const root = el(
    doc,
    'section',
    { class: 'guide-settings', hidden: true },
    el(doc, 'h1', { tabindex: '-1' }, '攻略翻译设置'),
    form,
  )
  return {
    root,
    fill(v, limits, hasKey, usageBytes, confirmed = []) {
      confirmedOrigins = confirmed
      hideConfirmation()
      pendingLeave = null
      leaveConfirmation.hidden = true
      chars.input.value = String(limits.charLimit)
      cache.input.value = String(limits.cacheLimitMb)
      for (const item of [chars, cache]) {
        item.error.hidden = true
        item.input.removeAttribute('aria-invalid')
        item.input.removeAttribute('aria-describedby')
      }
      for (const text of [message, limitsMessage, dataMessage]) text.textContent = ''
      const r = form.querySelector<HTMLInputElement>(
        `input[name="provider"][value="${v.provider}"]`,
      )
      if (r) r.checked = true
      baseUrl.value = v.baseUrl
      model.value = v.model
      extra.value = v.extraBody
      const extraLabel = extraSummary.querySelector('span')
      if (extraLabel)
        extraLabel.textContent = v.extraBody.trim() ? '高级参数（已配置）' : '高级参数（可选）'
      confirm.checked = false
      // 先按已确认地址回填确认框，再记录“已保存”快照，避免误报未保存修改。
      updateConfirm()
      apiKey.value = ''
      apiKey.placeholder = hasKey ? '已保存，留空表示不修改' : '粘贴你的 Key'
      savedService = serviceSnapshot()
      savedLimits = limitsSnapshot()
      updateDirty()
      updateProvider()
      usage.textContent = `译文缓存约 ${Math.ceil(usageBytes / 1024)} KB`
    },
    setMessage(text) {
      message.textContent = text
    },
  }
}
