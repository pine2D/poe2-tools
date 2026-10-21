import { el } from '../guide/dom'
import {
  normalizeSite,
  PRESET_SITES,
  readSites,
  type SelectionSite,
  siteKey,
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
  const state = el(doc, 'p', { role: 'status', class: 'settings-message' })
  const list = el(doc, 'div', { class: 'site-list' })
  const presets = el(doc, 'div', { class: 'site-presets' })
  const input = el(doc, 'input', {
    type: 'url',
    placeholder: 'https://example.com/poe2',
    required: true,
    'aria-label': '自动划词网址',
  })
  const button = (label: string, fn: () => void) => {
    const b = el(doc, 'button', { type: 'button', class: 'pt-btn pt-btn--quiet' }, label)
    b.addEventListener('click', fn)
    return b
  }
  let savedSites: SelectionSite[] = []
  let busy = false
  const lock = (value: boolean) => {
    busy = value
    for (const b of root.querySelectorAll<HTMLButtonElement>('button')) b.disabled = value
  }
  const refresh = async () => {
    const sites = await api.read()
    savedSites = sites
    const rows = await Promise.all(
      sites.map(async (site) => {
        const granted = await api.contains(sitePermission(site))
        return el(
          doc,
          'div',
          { class: 'site-row' },
          el(
            doc,
            'div',
            {},
            el(doc, 'strong', {}, siteKey(site)),
            el(
              doc,
              'p',
              { class: 'note' },
              granted ? '自动启用划词' : '访问权限已撤销，请重新启用',
            ),
          ),
          ...(!granted ? [button('重新启用', () => enable([site]))] : []),
          button('移除', () => {
            if (busy) return
            lock(true)
            void (async () => {
              const next = (await api.read()).filter((s) => siteKey(s) !== siteKey(site))
              await api.write(next)
              if (!next.some((s) => sitePermission(s) === sitePermission(site)))
                await api.remove(sitePermission(site))
              state.textContent = '已移除此网址的自动划词。'
            })()
              .then(refresh)
              .catch(() => {
                state.textContent = '未能完成移除，请重试。'
              })
              .finally(() => lock(false))
          }),
        )
      }),
    )
    list.replaceChildren(
      ...(rows.length
        ? rows
        : [
            el(
              doc,
              'p',
              { class: 'note' },
              '尚未启用任何站点。也可以继续从扩展弹窗临时启用本页划词。',
            ),
          ]),
    )
  }
  function enable(added: SelectionSite[]) {
    if (busy) return
    if (
      readSites([...savedSites, ...added]).length === 100 &&
      !added.every((s) =>
        readSites([...savedSites, ...added]).some((m) => siteKey(s) === siteKey(m)),
      )
    ) {
      state.textContent = '最多添加 100 个网址，请先移除不再使用的条目。'
      return
    }
    lock(true)
    const origins = [...new Set(added.map(sitePermission))]
    state.textContent = '请在 Chrome 提示中确认所选网站的访问权限。'
    const before = Promise.all(origins.map((origin) => api.contains(origin)))
    const rollback = async () => {
      const held = await before
      const current = await api.read().catch(() => savedSites)
      await Promise.all(
        origins.map((origin, i) =>
          !held[i] && !current.some((s) => sitePermission(s) === origin)
            ? api.remove(origin)
            : undefined,
        ),
      )
    }
    // 请求必须直接位于点击/提交回调，不先 await 存储读取。
    const granted = api.request([...new Set(added.map(sitePermission))])
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
        input.value = ''
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
      .finally(() => lock(false))
  }
  for (const preset of PRESET_SITES) presets.append(button(preset.name, () => enable([preset])))
  const form = el(
    doc,
    'form',
    { class: 'site-add' },
    el(doc, 'label', {}, '添加网址或目录', input),
    el(doc, 'button', { type: 'submit', class: 'pt-btn' }, '添加并启用'),
  )
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const site = normalizeSite(input.value)
    if (!site) {
      state.textContent = '请输入不含账号、密码或通配符的 HTTP(S) 网址；CoE 使用本地中文显示。'
      return
    }
    enable([site])
  })
  const root = el(
    doc,
    'main',
    { class: 'guide-settings sites-settings' },
    el(doc, 'h1', {}, '划词站点'),
    el(doc, 'p', { class: 'sites-lead' }, '常用攻略，选中就能翻译。'),
    el(
      doc,
      'p',
      { class: 'note' },
      '授权后自动显示划词入口，侧栏关闭也能使用。只有点击“翻译”才发送所选文字，不会自动调用 API。',
    ),
    el(
      doc,
      'section',
      {},
      el(doc, 'h2', {}, '常用 PoE2 攻略'),
      el(doc, 'p', { class: 'note' }, '仅在对应 PoE2 目录生效。'),
      button('启用全部常用站点', () => enable([...PRESET_SITES])),
      presets,
    ),
    el(
      doc,
      'section',
      {},
      el(doc, 'h2', {}, '自定义站点'),
      form,
      el(
        doc,
        'p',
        { class: 'note' },
        '填写带目录的网址可限制生效范围。Chrome 的访问授权覆盖该网站（含同主机其他端口），扩展只在所列网址或目录工作。',
      ),
    ),
    state,
    el(doc, 'section', {}, el(doc, 'h2', {}, '已启用的网址'), list),
  )
  void refresh().catch(() => {
    state.textContent = '无法读取站点设置，请重新打开本页。'
  })
  return { root, refresh }
}
