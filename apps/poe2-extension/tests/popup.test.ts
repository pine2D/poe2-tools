import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PageProbe } from '../src/popup/page-query'
import type { PageStateReply } from '../src/protocol'

const storage = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  subscribe: vi.fn(),
  version: vi.fn(),
  activeTab: vi.fn(),
  ask: vi.fn(),
  reload: vi.fn(),
  answer: vi.fn(),
}))
// 当前页查询整体换成替身：协议、超时与重试由 Task 1 的 page-query 测试负责，这里只测弹窗的接线与呈现
const query = vi.hoisted(() => ({
  watchPage: vi.fn(),
  refresh: vi.fn(),
  reload: vi.fn(),
  dispose: vi.fn(),
}))
vi.mock('../src/platform', () => ({ platform: storage }))
vi.mock('../src/popup/page-query', () => ({ watchPage: query.watchPage }))
beforeEach(() => {
  query.watchPage.mockImplementation(() => ({
    refresh: query.refresh,
    reload: query.reload,
    dispose: query.dispose,
  }))
  query.reload.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
  vi.resetAllMocks()
  document.body.innerHTML = ''
  document.body.removeAttribute('tabindex')
})

// 真实弹窗：标题栏到页脚整段，不含模块脚本
const POPUP =
  readFileSync('apps/poe2-extension/popup.html', 'utf8').match(/<header[\s\S]*<\/footer>/)?.[0] ??
  ''
// 精简替身：状态块、两个开关、设置提示行与重试（id、class 与 popup.html 一致）
const PAGE =
  '<div id="page" class="page" data-kind="reading" role="status" aria-live="polite">' +
  '<p class="page__head" hidden><strong class="page__word"></strong><span class="page__reason"></span></p>' +
  '<p class="page__hint">正在读取当前页…</p>' +
  '<button id="reload" class="page__action" type="button" hidden>刷新页面</button></div>'
const FIXTURE = `${PAGE}<input id="enabled" type="checkbox"><input id="bilingual" type="checkbox"><p id="status"></p><button id="retry" hidden>重试读取</button>`

function reply(over: Partial<PageStateReply> = {}): PageStateReply {
  return {
    v: 1,
    phase: 'ready',
    error: null,
    page: 'supported',
    enabled: true,
    translated: 128,
    search: 'ok',
    searchMissing: [],
    ...over,
  }
}
function answered(over: Partial<PageStateReply> = {}): PageProbe {
  return { status: 'reply', tabId: 7, reply: reply(over), settled: true }
}
function emit(probe: PageProbe) {
  const onChange = query.watchPage.mock.calls[0]?.[0]
  expect(onChange).toBeTypeOf('function')
  onChange(probe)
}
function pageState() {
  const page = document.querySelector('#page') as HTMLElement
  const head = page.querySelector('.page__head') as HTMLElement
  return {
    kind: page.dataset.kind,
    head: head.hidden ? null : head.textContent,
    hint: page.querySelector('.page__hint')?.textContent,
    reload: !(document.querySelector('#reload') as HTMLButtonElement).hidden,
    icons: page.querySelectorAll('svg').length,
  }
}
async function setup(
  settings: { enabled: boolean; bilingual: boolean } = { enabled: true, bilingual: false },
  html = FIXTURE,
) {
  document.body.innerHTML = html
  storage.read.mockResolvedValue(settings)
  await import('../src/popup/index')
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLInputElement>('#enabled')?.disabled).toBe(false),
  )
  emit(answered({ enabled: settings.enabled }))
  return {
    enabled: document.querySelector('#enabled') as HTMLInputElement,
    bilingual: document.querySelector('#bilingual') as HTMLInputElement,
  }
}

it('保存中禁用控件，失败恢复已保存值，再次操作可成功；成功后提示行清空并重查当前页', async () => {
  const { enabled, bilingual } = await setup()
  let reject!: (error: Error) => void
  storage.write.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  enabled.checked = false
  enabled.dispatchEvent(new Event('change'))
  expect(enabled.disabled).toBe(true)
  expect(bilingual.disabled).toBe(true)
  reject(new Error('storage failed'))
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(enabled.checked).toBe(true)
  expect(document.querySelector('#status')?.textContent).toContain('未保存')
  expect(query.refresh).not.toHaveBeenCalled()
  storage.write.mockResolvedValue(undefined)
  bilingual.checked = true
  bilingual.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(bilingual.disabled).toBe(false))
  expect(storage.write).toHaveBeenLastCalledWith({ enabled: true, bilingual: true })
  expect(document.querySelector('#status')?.textContent).toBe('')
  expect(query.refresh).toHaveBeenCalledOnce()
})
it('停用翻译时保留中英对照偏好但禁用其开关，状态块立刻显示“简体中文已关闭”', async () => {
  const { enabled, bilingual } = await setup()
  storage.write.mockResolvedValue(undefined)
  enabled.checked = false
  enabled.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(bilingual.disabled).toBe(true)
  expect(pageState()).toMatchObject({ kind: 'mute', head: '未生效 · 简体中文已关闭' })
})

it('已打开的弹窗同步其他窗口的设置并重查当前页，后续保存不覆盖新偏好', async () => {
  const { enabled, bilingual } = await setup()
  const update = storage.subscribe.mock.calls[0]?.[0]
  expect(update).toBeTypeOf('function')
  update({ enabled: false, bilingual: true })
  expect(enabled.checked).toBe(false)
  expect(bilingual.checked).toBe(true)
  expect(bilingual.disabled).toBe(true)
  expect(pageState().head).toBe('未生效 · 简体中文已关闭')
  expect(query.refresh).toHaveBeenCalledOnce()
  storage.write.mockResolvedValue(undefined)
  enabled.checked = true
  enabled.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(storage.write).toHaveBeenLastCalledWith({ enabled: true, bilingual: true })
})
it('保存期间收到外部设置仍保持锁定，失败恢复最近保存的设置', async () => {
  const { enabled, bilingual } = await setup()
  let reject!: (error: Error) => void
  storage.write.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  enabled.checked = false
  enabled.dispatchEvent(new Event('change'))
  const update = storage.subscribe.mock.calls[0]?.[0]
  expect(update).toBeTypeOf('function')
  update({ enabled: true, bilingual: true })
  expect(enabled.disabled).toBe(true)
  expect(bilingual.disabled).toBe(true)
  expect(document.querySelector('#status')?.textContent).toBe('正在保存…')
  reject(new Error('storage failed'))
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(enabled.checked).toBe(true)
  expect(bilingual.checked).toBe(true)
})

it('启动先监听变化，晚返回的读取结果不能覆盖较新事件', async () => {
  document.body.innerHTML = FIXTURE
  let resolve!: (value: { enabled: boolean; bilingual: boolean }) => void
  storage.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  await import('../src/popup/index')
  expect(storage.subscribe).toHaveBeenCalledOnce()
  storage.subscribe.mock.calls[0]?.[0]({ enabled: false, bilingual: true })
  resolve({ enabled: true, bilingual: false })
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLInputElement>('#enabled')?.disabled).toBe(false),
  )
  expect(document.querySelector<HTMLInputElement>('#enabled')?.checked).toBe(false)
  expect(document.querySelector<HTMLInputElement>('#bilingual')?.checked).toBe(true)
  emit(answered({ enabled: false }))
  expect(pageState().head).toBe('未生效 · 简体中文已关闭')
})
it('保存完成回执不覆盖等待期间收到的较新已保存事件', async () => {
  const { enabled, bilingual } = await setup()
  let resolve!: () => void
  storage.write.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  bilingual.checked = true
  bilingual.dispatchEvent(new Event('change'))
  const update = storage.subscribe.mock.calls[0]?.[0]
  update({ enabled: true, bilingual: true })
  update({ enabled: false, bilingual: true })
  resolve()
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(enabled.checked).toBe(false)
  expect(bilingual.checked).toBe(true)
  expect(bilingual.disabled).toBe(true)
  expect(pageState().head).toBe('未生效 · 简体中文已关闭')
})

it('首次读取失败可就地重试，等待期间不能写入默认值且只绑定一次保存', async () => {
  document.body.innerHTML = FIXTURE
  storage.read.mockRejectedValueOnce(new Error('read failed'))
  await import('../src/popup/index')
  const retry = document.querySelector('#retry') as HTMLButtonElement
  const enabled = document.querySelector('#enabled') as HTMLInputElement
  const bilingual = document.querySelector('#bilingual') as HTMLInputElement
  await vi.waitFor(() => expect(retry.hidden).toBe(false))
  expect(enabled.disabled).toBe(true)
  expect(bilingual.disabled).toBe(true)
  expect(storage.write).not.toHaveBeenCalled()
  let resolve!: (settings: { enabled: boolean; bilingual: boolean }) => void
  storage.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  retry.click()
  retry.click()
  expect(storage.read).toHaveBeenCalledTimes(2)
  expect(retry.hidden).toBe(true)
  storage.subscribe.mock.calls[0]?.[0]({ enabled: false, bilingual: true })
  resolve({ enabled: true, bilingual: false })
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(enabled.checked).toBe(false)
  expect(bilingual.checked).toBe(true)
  expect(bilingual.disabled).toBe(true)
  storage.write.mockResolvedValue(undefined)
  enabled.checked = true
  enabled.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(storage.write).toHaveBeenCalledExactlyOnceWith({ enabled: true, bilingual: true })
  retry.click()
  expect(storage.read).toHaveBeenCalledTimes(2)
})

it.each([false, true])('键盘保存后归还焦点，保存失败=%s', async (failed) => {
  const { bilingual } = await setup()
  let finish!: () => void
  storage.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve, reject) => {
        finish = () => (failed ? reject(new Error('storage failed')) : resolve())
      }),
  )
  bilingual.focus()
  bilingual.checked = true
  bilingual.dispatchEvent(new Event('change'))
  // 模拟Chrome禁用当前控件时实际发生的焦点离开。
  document.body.tabIndex = -1
  document.body.focus()
  expect(document.activeElement).toBe(document.body)
  finish()
  await vi.waitFor(() => expect(bilingual.disabled).toBe(false))
  expect(document.activeElement).toBe(bilingual)
})
it('保存期间用户转移焦点后不抢回', async () => {
  const { bilingual } = await setup()
  let finish!: () => void
  storage.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const other = document.createElement('button')
  document.body.append(other)
  bilingual.focus()
  bilingual.checked = true
  bilingual.dispatchEvent(new Event('change'))
  other.focus()
  finish()
  await vi.waitFor(() => expect(bilingual.disabled).toBe(false))
  expect(document.activeElement).toBe(other)
})
it('外部停用令原焦点开关不可用时返回启用开关', async () => {
  const { enabled, bilingual } = await setup()
  let finish!: () => void
  storage.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  bilingual.focus()
  bilingual.checked = true
  bilingual.dispatchEvent(new Event('change'))
  document.body.tabIndex = -1
  document.body.focus()
  storage.subscribe.mock.calls[0]?.[0]({ enabled: false, bilingual: true })
  finish()
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(bilingual.disabled).toBe(true)
  expect(document.activeElement).toBe(enabled)
})

it('页脚两段：manifest 版本与检查更新；完整非官方声明与版权句，不再写短署名与“预览版”', async () => {
  document.body.innerHTML = POPUP
  storage.read.mockResolvedValue({ enabled: true, bilingual: false })
  storage.version.mockReturnValue('0.4.0')
  await import('../src/popup/index')
  expect(document.querySelector('#version')?.textContent).toBe('版本 0.4.0')
  const link = document.querySelector<HTMLAnchorElement>('#check-update')
  expect(link?.getAttribute('href')).toBe('https://poe2-tools.pine2d.com/extension/')
  expect(link?.getAttribute('target')).toBe('_blank')
  expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
  expect(link?.textContent).toBe('检查更新')
  const paragraphs = document.querySelectorAll('footer p')
  expect(paragraphs).toHaveLength(2)
  expect(paragraphs[1]?.textContent).toBe(
    '非官方工具，与 Grinding Gear Games、腾讯及 Craft of Exile 无关联，也未获其认可。游戏文本版权归各权利方所有。',
  )
  const footer = document.querySelector('footer')?.textContent ?? ''
  expect(footer).not.toContain('PoE2 中文助手 · 非官方')
  expect(footer).not.toContain('预览')
})

async function setupFull(settings = { enabled: true, bilingual: false }) {
  document.body.innerHTML =
    `${PAGE}<input id="enabled" type="checkbox"><span id="enabled-state"></span>` +
    '<input id="bilingual" type="checkbox"><span id="bilingual-state"></span>' +
    '<p id="status"></p><button id="retry" hidden>重试读取</button>'
  storage.read.mockResolvedValue(settings)
  await import('../src/popup/index')
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLInputElement>('#enabled')?.disabled).toBe(false),
  )
  return {
    status: document.querySelector('#status') as HTMLElement,
    enabled: document.querySelector('#enabled') as HTMLInputElement,
    enabledState: document.querySelector('#enabled-state') as HTMLElement,
    bilingualState: document.querySelector('#bilingual-state') as HTMLElement,
  }
}
it('设置提示行平时为空：读取成功后不说话，开启或关闭由状态块与开关表达（裁定 9）', async () => {
  for (const enabled of [true, false]) {
    const { status } = await setupFull({ enabled, bilingual: false })
    expect(status.textContent).toBe('')
    expect(status.dataset.tone).toBe('idle')
    vi.resetModules()
    document.body.innerHTML = ''
  }
})
it('保存失败时提示行为 error，并说明已恢复原设置', async () => {
  const { status, enabled } = await setupFull({ enabled: false, bilingual: false })
  storage.write.mockRejectedValueOnce(new Error('storage failed'))
  enabled.checked = true
  enabled.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(status.dataset.tone).toBe('error'))
  expect(status.textContent).toBe('未保存，已恢复原设置。请再次操作重试。')
})
it('开关右侧的“开启／关闭”随勾选与保存结果同步', async () => {
  const { enabled, enabledState, bilingualState } = await setupFull()
  expect(enabledState.textContent).toBe('开启')
  expect(bilingualState.textContent).toBe('关闭')
  storage.write.mockResolvedValue(undefined)
  enabled.checked = false
  enabled.dispatchEvent(new Event('change'))
  expect(enabledState.textContent).toBe('关闭')
  await vi.waitFor(() => expect(enabled.disabled).toBe(false))
  expect(enabledState.textContent).toBe('关闭')
})
it('读取失败时状态为 error，并显示“重试读取”', async () => {
  document.body.innerHTML = FIXTURE
  storage.read.mockRejectedValue(new Error('no storage'))
  await import('../src/popup/index')
  const status = document.querySelector('#status') as HTMLElement
  await vi.waitFor(() => expect(status.dataset.tone).toBe('error'))
  expect(status.textContent).toBe('无法读取设置，请重试。')
  expect((document.querySelector('#retry') as HTMLButtonElement).hidden).toBe(false)
})

// ---- 第三期 A：当前页状态块 ----
it('打开即显示“读取中”：状态词行隐藏、一个虚线圆图标；开关不因读取当前页而停用（裁定 8）', async () => {
  document.body.innerHTML = POPUP
  storage.read.mockResolvedValue({ enabled: true, bilingual: false })
  await import('../src/popup/index')
  expect(query.watchPage).toHaveBeenCalledOnce()
  expect(pageState()).toEqual({
    kind: 'reading',
    head: null,
    hint: '正在读取当前页…',
    reload: false,
    icons: 1,
  })
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLInputElement>('#enabled')?.disabled).toBe(false),
  )
  expect(pageState().kind).toBe('reading')
  expect(document.querySelector('#status')?.textContent).toBe('')
})

it.each<
  [string, PageProbe, boolean, { kind: string; head: string; hint: string; reload: boolean }]
>([
  [
    '生效中',
    answered(),
    true,
    {
      kind: 'ok',
      head: '生效中 · 已翻译 128 处',
      hint: '未收录的术语保持英文。转换装备文本后，仍以原站的导入结果为准。',
      reload: false,
    },
  ],
  [
    '部分生效',
    answered({ translated: 96, search: 'missing', searchMissing: ['base'] }),
    true,
    {
      kind: 'part',
      head: '部分生效 · 已翻译 96 处',
      hint: '界面已翻译，但基底搜索框没接上，暂时不能用中文搜索。先刷新页面；仍不行请反馈。',
      reload: true,
    },
  ],
  [
    '原站语言不是 English',
    answered({ page: 'english-required' }),
    true,
    {
      kind: 'off',
      head: '未生效 · 原站语言不是 English',
      hint: '中文助手只在 English 界面上工作。请在原站右上角切到 English，再刷新页面。',
      reload: false,
    },
  ],
  [
    '本页没有中文助手',
    { status: 'none' },
    true,
    {
      kind: 'off',
      head: '未生效 · 本页没有中文助手',
      hint: '两种可能：这不是 beta.craftofexile.com 页面（旧版 www 站不支持）；或页面在安装、更新扩展前就已打开，刷新即可。',
      reload: false,
    },
  ],
  [
    '简体中文已关闭',
    answered({ enabled: false }),
    false,
    {
      kind: 'mute',
      head: '未生效 · 简体中文已关闭',
      hint: '本页显示原站英文。在下方打开“启用简体中文”即可，不用刷新。',
      reload: false,
    },
  ],
  [
    '初始化失败',
    answered({ phase: 'failed', error: 'dictionary' }),
    true,
    {
      kind: 'off',
      head: '未生效 · 初始化失败',
      hint: '词典没能加载，本页仍是原站英文。刷新页面通常能恢复；仍失败请检查更新。',
      reload: true,
    },
  ],
  [
    '认不出原站',
    answered({ page: 'unknown' }),
    true,
    {
      kind: 'off',
      head: '未生效 · 认不出原站的游戏和语言',
      hint: '原站页面可能还没加载完，或已经改版。刷新页面后再打开弹窗；仍不行请检查更新。',
      reload: false,
    },
  ],
])('状态块：%s', async (_name, probe, on, expected) => {
  await setup({ enabled: on, bilingual: false }, POPUP)
  emit(probe)
  expect(pageState()).toEqual({ ...expected, icons: 1 })
  const icon = document.querySelector('#page svg')
  expect(icon?.getAttribute('aria-hidden')).toBe('true')
  expect(icon?.classList.contains('page__icon')).toBe(true)
})

it('同一结果重复到达时不重写状态块：live region 不重复播报', async () => {
  await setup(undefined, POPUP)
  const icon = document.querySelector('#page svg')
  const word = document.querySelector('.page__word')?.firstChild
  emit(answered())
  emit(answered())
  expect(document.querySelector('#page svg')).toBe(icon)
  expect(document.querySelector('.page__word')?.firstChild).toBe(word)
})

it('点“刷新页面”调用 reload，完成前按钮停用、不能连点', async () => {
  await setup(undefined, POPUP)
  let finish!: () => void
  query.reload.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        finish = done
      }),
  )
  emit(answered({ phase: 'failed', error: 'dictionary' }))
  const reload = document.querySelector('#reload') as HTMLButtonElement
  expect(reload.hidden).toBe(false)
  reload.click()
  reload.click()
  expect(query.reload).toHaveBeenCalledOnce()
  expect(reload.disabled).toBe(true)
  finish()
  await vi.waitFor(() => expect(reload.disabled).toBe(false))
})

it('“刷新页面”带焦点时被隐藏，焦点交给“启用简体中文”', async () => {
  await setup(undefined, POPUP)
  emit(answered({ phase: 'failed', error: 'other' }))
  const reload = document.querySelector('#reload') as HTMLButtonElement
  reload.focus()
  expect(document.activeElement).toBe(reload)
  emit({ status: 'reading' })
  expect(reload.hidden).toBe(true)
  expect(document.activeElement).toBe(document.querySelector('#enabled'))
})

it('应答里的开关与已保存设置不一致：300 ms 后补查一次，不连环重查（裁定 7）', async () => {
  await setup()
  vi.useFakeTimers()
  emit(answered({ enabled: false }))
  expect(pageState().kind).toBe('ok')
  vi.advanceTimersByTime(299)
  expect(query.refresh).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(query.refresh).toHaveBeenCalledOnce()
  emit(answered({ enabled: false }))
  vi.advanceTimersByTime(1000)
  expect(query.refresh).toHaveBeenCalledOnce()
  // 新的外部触发（设置变化）重新允许补查一次
  storage.subscribe.mock.calls[0]?.[0]({ enabled: true, bilingual: false })
  expect(query.refresh).toHaveBeenCalledTimes(2)
  emit(answered({ enabled: false }))
  vi.advanceTimersByTime(300)
  expect(query.refresh).toHaveBeenCalledTimes(3)
})

it('补查等待期间到达一致的应答：取消补查', async () => {
  await setup()
  vi.useFakeTimers()
  emit(answered({ enabled: false }))
  emit(answered({ enabled: true }))
  vi.advanceTimersByTime(1000)
  expect(query.refresh).not.toHaveBeenCalled()
})

it('弹窗关闭（pagehide）时停止查询当前页', async () => {
  // 前面各用例导入的模块实例也在同一个 window 上留有 pagehide 监听：本用例用独立的 dispose 替身
  const dispose = vi.fn()
  query.watchPage.mockImplementationOnce(() => ({
    refresh: query.refresh,
    reload: query.reload,
    dispose,
  }))
  await setup()
  window.dispatchEvent(new Event('pagehide'))
  expect(dispose).toHaveBeenCalledOnce()
})
