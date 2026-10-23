import { el } from '../guide/dom'
import {
  normalizeSite,
  PRESET_SITES,
  readSites,
  type SelectionSite,
  siteKey,
  siteMatches,
  sitePermission,
} from '../selection/sites'
export interface SitesApi {
  read(): Promise<SelectionSite[]>
  write(sites: SelectionSite[]): Promise<void>
  request(origins: string[]): Promise<boolean>
  contains(origin: string): Promise<boolean>
  remove(origin: string): Promise<boolean>
}
export function createSitesView(doc: Document, api: SitesApi) {
  const state = el(doc, 'p', { role: 'status', class: 'settings-message', id: 'site-message' })
  const list = el(doc, 'div', { class: 'site-list' })
  const presets = el(doc, 'div', { class: 'site-presets' })
  const input = el(doc, 'input', {
    type: 'url',
    placeholder: 'https://example.com/poe2',
    required: true,
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': '自动划词网址',
    'aria-describedby': 'site-hint site-message',
  })
  const button = (label: string, fn: () => void, action?: string) => {
    const b = el(doc, 'button', { type: 'button', class: 'pt-btn pt-btn--quiet' }, label)
    if (action) b.dataset.action = action
    b.addEventListener('click', fn)
    return b
  }
  let savedSites: SelectionSite[] = []
  let busy = false
  let refreshId = 0
  let pending: { box: HTMLElement; trigger: HTMLButtonElement } | null = null
  const closeConfirmation = (restore = false) => {
    if (!pending) return
    pending.box.remove()
    pending.trigger.setAttribute('aria-expanded', 'false')
    if (restore) pending.trigger.focus()
    pending = null
  }
  const lock = (value: boolean) => {
    busy = value
    for (const b of root.querySelectorAll<HTMLButtonElement>('button')) b.disabled = value
  }
  // 禁用按钮可能让浏览器将焦点放回body；用户主动移开后，异步结束不得抢回来。
  const retainFocus = (owner: HTMLElement) => {
    let moved = false
    const track = (event: FocusEvent) => {
      if (event.target !== doc.body && !owner.contains(event.target as Node)) moved = true
    }
    doc.addEventListener('focusin', track)
    return (target: HTMLElement | null) => {
      doc.removeEventListener('focusin', track)
      if (!moved && root.isConnected && target?.isConnected) target.focus()
    }
  }
  const findRow = (key: string) =>
    [...root.querySelectorAll<HTMLElement>('.site-row')].find((row) => row.dataset.key === key)
  const rowControl = (key: string) =>
    findRow(key)?.querySelector<HTMLButtonElement>('button') ?? input
  const requestDelete = (
    site: SelectionSite,
    row: HTMLElement,
    trigger: HTMLButtonElement,
    preset: boolean,
  ) => {
    if (busy) return
    closeConfirmation()
    const permission = sitePermission(site)
    const shared = savedSites.some(
      (s) => siteKey(s) !== siteKey(site) && sitePermission(s) === permission,
    )
    const cancel = button('取消', () => closeConfirmation(true), 'cancel-delete')
    const confirm = button(
      '确认删除',
      () => {
        if (busy) return
        const restore = retainFocus(row)
        lock(true)
        confirm.textContent = '正在删除…'
        void (async () => {
          let next: SelectionSite[]
          try {
            next = (await api.read()).filter((s) => siteKey(s) !== siteKey(site))
            await api.write(next)
          } catch {
            state.textContent = '未能删除规则，站点与权限保留，请重试。'
            return
          }
          let removed = true
          const sharedPermission = next.some((s) => sitePermission(s) === permission)
          if (!sharedPermission) {
            try {
              removed = await api.remove(permission)
            } catch {
              removed = false
            }
          }
          const overlap = next.some(
            (s) => siteMatches(s, siteKey(site)) || siteMatches(site, siteKey(s)),
          )
          state.textContent = sharedPermission
            ? `规则已删除；同一网站仍有其他规则，权限保留。${overlap ? '其他规则覆盖的范围仍会自动启用划词。' : ''}`
            : removed
              ? '规则已删除，网站访问权限已收回。'
              : '规则已删除，但未能收回网站权限；请在 Chrome 扩展管理页检查并撤销该网站的访问权限。'
          await refresh()
        })().finally(() => {
          lock(false)
          confirm.textContent = '确认删除'
          restore(confirm.isConnected ? confirm : rowControl(siteKey(site)))
        })
      },
      'confirm-delete',
    )
    confirm.classList.add('danger-action')
    const box = el(
      doc,
      'div',
      { class: 'site-confirmation', role: 'group', 'aria-label': '确认删除站点' },
      el(
        doc,
        'p',
        {},
        shared
          ? '删除这条规则；同一网站还有其他网址或目录在用，权限保留。'
          : `删除后收回 ${new URL(site.origin).hostname} 的网站访问权限。`,
      ),
      ...(preset ? [el(doc, 'p', { class: 'note' }, '常用站仍留在列表，可以重新开启。')] : []),
      el(doc, 'div', { class: 'settings-actions' }, cancel, confirm),
    )
    box.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || busy) return
      event.preventDefault()
      closeConfirmation(true)
    })
    pending = { box, trigger }
    trigger.setAttribute('aria-expanded', 'true')
    row.append(box)
    cancel.focus()
  }
  const renderRow = (
    site: SelectionSite,
    name: string,
    active: boolean,
    granted: boolean,
    preset: boolean,
  ) => {
    const key = siteKey(site)
    const row = el(doc, 'div', { class: 'site-row', 'data-key': key })
    const enableButton = button(active ? '重新启用' : '开启', () => enable([site], row), 'enable')
    enableButton.setAttribute('aria-label', `${active ? '重新启用' : '开启'} ${name}`)
    const remove = button('删除', () => requestDelete(site, row, remove, preset), 'delete')
    remove.setAttribute('aria-label', `删除 ${name}`)
    remove.setAttribute('aria-expanded', 'false')
    const status = active ? (granted ? '已开启' : '权限已撤销，请重新启用') : '未开启'
    row.append(
      el(
        doc,
        'div',
        { class: 'site-name' },
        el(doc, 'strong', {}, name),
        el(
          doc,
          'span',
          { class: 'site-state', 'data-state': active ? (granted ? 'on' : 'revoked') : 'off' },
          status,
        ),
      ),
      el(
        doc,
        'div',
        { class: 'site-value' },
        el(doc, 'span', { class: 'site-url' }, site.origin, el(doc, 'b', {}, site.path)),
        el(
          doc,
          'div',
          { class: 'site-actions' },
          ...(!active || !granted ? [enableButton] : []),
          ...(active ? [remove] : []),
        ),
      ),
    )
    return row
  }
  const refresh = async () => {
    const id = ++refreshId
    try {
      const sites = await api.read()
      const keys = new Set(sites.map(siteKey))
      const presetKeys = new Set(PRESET_SITES.map(siteKey))
      const rows = await Promise.all(
        [...PRESET_SITES, ...sites.filter((s) => !presetKeys.has(siteKey(s)))].map(async (site) => {
          const active = keys.has(siteKey(site))
          const granted = active && (await api.contains(sitePermission(site)))
          const preset = PRESET_SITES.find((s) => siteKey(s) === siteKey(site))
          return {
            preset: Boolean(preset),
            node: renderRow(
              site,
              preset?.name ?? new URL(site.origin).hostname,
              active,
              granted,
              Boolean(preset),
            ),
          }
        }),
      )
      if (id !== refreshId) return
      savedSites = sites
      closeConfirmation()
      presets.replaceChildren(...rows.filter((r) => r.preset).map((r) => r.node))
      const custom = rows.filter((r) => !r.preset).map((r) => r.node)
      list.replaceChildren(
        ...(custom.length
          ? custom
          : [
              el(
                doc,
                'p',
                { class: 'note sites-empty' },
                '还没有自定义网址。建议填到攻略所在目录。',
              ),
            ]),
      )
      retry.hidden = true
      lock(busy)
    } catch {
      if (id !== refreshId) return
      state.textContent = '无法读取站点设置，请重新读取后重试。'
      retry.hidden = false
    }
  }
  function enable(added: SelectionSite[], owner: HTMLElement, clearDraft?: string) {
    if (busy) return
    const combined = readSites([...savedSites, ...added])
    if (!added.every((s) => combined.some((m) => siteKey(s) === siteKey(m)))) {
      state.textContent = '最多添加 100 个网址，请先移除不再使用的条目。'
      return
    }
    closeConfirmation()
    const restore = retainFocus(owner)
    lock(true)
    const origins = [...new Set(added.map(sitePermission))]
    state.textContent = '请在 Chrome 提示中确认所选网站的访问权限。'
    const before = Promise.all(origins.map((origin) => api.contains(origin))).catch(() => null)
    const rollback = async () => {
      const held = await before
      if (!held) throw Error('无法确认原有权限')
      const current = await api.read().catch(() => savedSites)
      for (const [i, origin] of origins.entries()) {
        if (
          !held[i] &&
          !current.some((s) => sitePermission(s) === origin) &&
          !(await api.remove(origin))
        )
          throw Error('无法撤回新增权限')
      }
    }
    // Chrome要求权限申请直接位于用户手势回调内，前面不能await读取存储。
    const granted = api.request(origins)
    void granted
      .then(async (allowed) => {
        if (!allowed) {
          state.textContent = '未授予访问权限，自动划词未启用。'
          return
        }
        const merged = readSites([...(await api.read()), ...added])
        if (!added.every((s) => merged.some((m) => siteKey(s) === siteKey(m)))) {
          await rollback()
          state.textContent = '最多添加 100 个网址，请先移除不再使用的条目。'
          return
        }
        await api.write(merged)
        if (clearDraft !== undefined && input.value === clearDraft) input.value = ''
        state.textContent = '已启用。以后访问这些网址即可划词；点击翻译后才会发送文字。'
        await refresh()
      })
      .catch(async () => {
        try {
          await rollback()
          state.textContent = '未能保存站点，新增授权已撤回，请重试。'
        } catch {
          state.textContent = '未能保存站点；请在 Chrome 扩展管理页检查并撤销多余的网站访问权限。'
        }
      })
      .finally(() => {
        lock(false)
        const first = added[0]
        restore(
          clearDraft === undefined && added.length === 1 && first
            ? rowControl(siteKey(first))
            : input,
        )
      })
  }
  const form = el(
    doc,
    'form',
    { class: 'site-add' },
    el(doc, 'label', { class: 'field' }, el(doc, 'span', {}, '添加网址或目录'), input),
    el(doc, 'button', { type: 'submit', class: 'pt-btn pt-btn--primary' }, '添加并启用'),
  )
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (busy) return
    const site = normalizeSite(input.value)
    if (!site) {
      state.textContent = '请输入不含账号、密码或通配符的 HTTP(S) 网址；CoE 使用本地中文显示。'
      input.setAttribute('aria-invalid', 'true')
      input.focus()
      return
    }
    input.removeAttribute('aria-invalid')
    enable([site], form, input.value)
  })
  input.addEventListener('input', () => input.removeAttribute('aria-invalid'))
  const retry = button('重新读取站点', () => {
    void refresh()
  })
  retry.hidden = true
  const batch = button('启用全部常用站点', () => enable([...PRESET_SITES], batch))
  const root = el(
    doc,
    'main',
    { class: 'guide-settings sites-settings' },
    el(doc, 'h1', {}, '自动划词站点'),
    el(doc, 'p', { class: 'sites-lead' }, '常用攻略，选中就能翻译。'),
    el(
      doc,
      'p',
      { class: 'note' },
      '授权后自动显示划词入口，侧栏关闭也能使用。只有点击“翻译”才发送所选文字，不会自动调用 API。',
    ),
    el(
      doc,
      'p',
      { class: 'site-permission-note note', id: 'site-hint' },
      'Chrome 的访问授权覆盖整个网站（含同主机其他端口），扩展只在所列网址或目录工作。填写带目录的网址可限制生效范围。',
    ),
    state,
    retry,
    el(
      doc,
      'section',
      {},
      el(doc, 'h2', {}, '常用攻略站'),
      presets,
      el(
        doc,
        'details',
        { class: 'site-batch' },
        el(doc, 'summary', {}, '批量启用'),
        el(doc, 'p', { class: 'note' }, '同时申请上方四个常用站点的访问权限。'),
        batch,
      ),
    ),
    el(doc, 'section', {}, el(doc, 'h2', {}, '自定义网址'), list, form),
  )
  void refresh()
  return { root, refresh }
}
