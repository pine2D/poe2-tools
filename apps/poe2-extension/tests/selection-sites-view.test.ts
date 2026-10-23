const required = <T>(value: T | null | undefined): T => {
  if (value == null) throw Error('fixture missing')
  return value
}

import { expect, it, vi } from 'vitest'
import type { SelectionSite } from '../src/selection/sites'
import { createSitesView } from '../src/sites/view'

const setup = () => {
  let sites: SelectionSite[] = []
  const api = {
    read: vi.fn(async () => sites),
    write: vi.fn(async (s: SelectionSite[]) => {
      sites = s
    }),
    request: vi.fn(async () => true),
    contains: vi.fn(async () => true),
    remove: vi.fn(async () => true),
  }
  const view = createSitesView(document, api)
  document.body.replaceChildren(view.root)
  return { api, view }
}
it('常用站点只请求具体域名，拒绝后不保存或声称启用', async () => {
  const { api, view } = setup()
  await view.refresh()
  api.request.mockResolvedValue(false)
  const button = required(
    view.root.querySelector<HTMLButtonElement>('[aria-label="开启 Mobalytics"]'),
  )
  button.click()
  expect(api.request).toHaveBeenCalledWith(['https://mobalytics.gg/*'])
  await vi.waitFor(() => expect(view.root.textContent).toContain('未授予访问权限'))
  expect(api.write).not.toHaveBeenCalled()
})
it('自定义网址提交仍在用户手势回调内申请权限，只保存限定目录', async () => {
  const { api, view } = setup()
  required(view.root.querySelector('input')).value = 'https://example.com/poe2/'
  required(view.root.querySelector('form')).dispatchEvent(new Event('submit', { cancelable: true }))
  expect(api.request).toHaveBeenCalledWith(['https://example.com/*'])
  await vi.waitFor(() =>
    expect(api.write).toHaveBeenCalledWith([{ origin: 'https://example.com', path: '/poe2' }]),
  )
})

it('保存失败撤回本次新增权限，原有权限仍保留', async () => {
  for (const existed of [false, true]) {
    const { api, view } = setup()
    api.contains.mockResolvedValue(existed)
    api.write.mockRejectedValue(Error('storage unavailable'))
    required(view.root.querySelector('input')).value = 'https://example.com/poe2'
    required(view.root.querySelector('form')).dispatchEvent(
      new Event('submit', { cancelable: true }),
    )
    await vi.waitFor(() => expect(view.root.textContent).toContain('未能保存站点'))
    if (existed) expect(api.remove).not.toHaveBeenCalled()
    else expect(api.remove).toHaveBeenCalledWith('https://example.com/*')
  }
})
it('达到上限先说明，不请求未保存条目的访问权限', async () => {
  const { api, view } = setup()
  api.read.mockResolvedValue(
    Array.from({ length: 100 }, (_, i) => ({ origin: `https://s${i}.example.com`, path: '/' })),
  )
  await view.refresh()
  required(view.root.querySelector('input')).value = 'https://new.example/poe2'
  required(view.root.querySelector('form')).dispatchEvent(new Event('submit', { cancelable: true }))
  expect(api.request).not.toHaveBeenCalled()
  expect(view.root.textContent).toContain('最多添加 100 个网址')
})

const row = (key: string) =>
  required(
    [...document.querySelectorAll<HTMLElement>('.site-row')].find((r) => r.dataset.key === key),
  )
const action = (r: HTMLElement, name: string) =>
  required(r.querySelector<HTMLButtonElement>(`[data-action="${name}"]`))
const seeded = async (sites: SelectionSite[]) => {
  const result = setup()
  await result.api.write(sites)
  result.api.write.mockClear()
  await result.view.refresh()
  return result
}

it('四个常用站始终有行，未开启不表示已获授权', async () => {
  const { view, api } = setup()
  await view.refresh()
  expect(view.root.querySelectorAll('.site-presets .site-row')).toHaveLength(4)
  expect(row('https://mobalytics.gg/poe-2').textContent).toContain('未开启')
  expect(action(row('https://mobalytics.gg/poe-2'), 'enable').disabled).toBe(false)
  expect(api.request).not.toHaveBeenCalled()
})
it('删除先确认，默认取消，Escape保留规则并还原触发焦点', async () => {
  const { api } = await seeded([{ origin: 'https://mobalytics.gg', path: '/poe-2' }])
  const r = row('https://mobalytics.gg/poe-2')
  const trigger = action(r, 'delete')
  trigger.focus()
  trigger.click()
  expect(api.write).not.toHaveBeenCalled()
  expect(api.remove).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(action(r, 'cancel-delete'))
  expect(r.textContent).toContain('收回')
  action(r, 'cancel-delete').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  )
  expect(document.activeElement).toBe(trigger)
  expect(api.write).not.toHaveBeenCalled()
})
it('删除最后一条才撤权，常用站删除后留在列表且可再次开启', async () => {
  const { api } = await seeded([{ origin: 'https://mobalytics.gg', path: '/poe-2' }])
  const r = row('https://mobalytics.gg/poe-2')
  action(r, 'delete').click()
  action(r, 'confirm-delete').click()
  await vi.waitFor(() => expect(api.remove).toHaveBeenCalledWith('https://mobalytics.gg/*'))
  await vi.waitFor(() => expect(row('https://mobalytics.gg/poe-2').textContent).toContain('未开启'))
  action(row('https://mobalytics.gg/poe-2'), 'enable').click()
  expect(api.request).toHaveBeenCalledWith(['https://mobalytics.gg/*'])
})
it('同主机其他端口或目录仍在用时保留Chrome权限', async () => {
  const { api, view } = await seeded([
    { origin: 'https://example.com', path: '/poe2' },
    { origin: 'https://example.com:8443', path: '/guides' },
  ])
  const r = row('https://example.com/poe2')
  action(r, 'delete').click()
  expect(r.textContent).toContain('权限保留')
  action(r, 'confirm-delete').click()
  await vi.waitFor(() =>
    expect(api.write).toHaveBeenCalledWith([
      { origin: 'https://example.com:8443', path: '/guides' },
    ]),
  )
  expect(api.remove).not.toHaveBeenCalled()
  expect(view.root.querySelector('[role="status"]')?.textContent).toContain('权限保留')
  expect(view.root.querySelector('[role="status"]')?.textContent).not.toContain('范围仍会')
})
it.each(['/poe2', '/poe2/builds'])('删除重叠目录%s不承诺整个范围停用', async (path) => {
  const { api, view } = await seeded([
    { origin: 'https://example.com', path: '/poe2' },
    { origin: 'https://example.com', path: '/poe2/builds' },
  ])
  const r = row(`https://example.com${path}`)
  action(r, 'delete').click()
  action(r, 'confirm-delete').click()
  await vi.waitFor(() => expect(api.write).toHaveBeenCalledOnce())
  expect(await api.read()).toHaveLength(1)
  expect(api.remove).not.toHaveBeenCalled()
  const message = view.root.querySelector('[role="status"]')?.textContent
  expect(message).toContain('权限保留')
  expect(message).toContain('其他规则覆盖的范围仍会自动启用划词')
  expect(message).not.toContain('此网址不再自动启用')
})
it('删除保存失败保留规则，不撤权；重试仍可用', async () => {
  const { api, view } = await seeded([{ origin: 'https://example.com', path: '/poe2' }])
  api.write.mockRejectedValueOnce(Error('quota'))
  const r = row('https://example.com/poe2')
  action(r, 'delete').click()
  action(r, 'confirm-delete').click()
  await vi.waitFor(() => expect(view.root.textContent).toContain('未能删除'))
  expect(api.remove).not.toHaveBeenCalled()
  expect(row('https://example.com/poe2')).toBeDefined()
  expect(action(r, 'confirm-delete').disabled).toBe(false)
})
it.each([false, 'error'])('撤权失败%s明确规则已删但权限仍需处理，不误报全部成功', async (mode) => {
  const { api, view } = await seeded([{ origin: 'https://example.com', path: '/poe2' }])
  if (mode === false) api.remove.mockResolvedValue(false)
  else api.remove.mockRejectedValue(Error('permission'))
  const r = row('https://example.com/poe2')
  action(r, 'delete').click()
  action(r, 'confirm-delete').click()
  await vi.waitFor(() => expect(view.root.textContent).toContain('规则已删除'))
  expect(view.root.textContent).toContain('Chrome 扩展管理页')
  expect(await api.read()).toEqual([])
})
it('权限被撤销显示重新启用，失败后保留自定义输入', async () => {
  const { api, view } = await seeded([{ origin: 'https://mobalytics.gg', path: '/poe-2' }])
  api.contains.mockResolvedValue(false)
  await view.refresh()
  expect(row('https://mobalytics.gg/poe-2').textContent).toContain('权限已撤销')
  const input = required(view.root.querySelector('input'))
  input.value = 'https://draft.example/poe2'
  action(row('https://mobalytics.gg/poe-2'), 'enable').click()
  await vi.waitFor(() => expect(api.write).toHaveBeenCalledOnce())
  expect(input.value).toBe('https://draft.example/poe2')
})
it('异步删除完成不夺走用户移到输入框的焦点', async () => {
  const { api, view } = await seeded([{ origin: 'https://example.com', path: '/poe2' }])
  let release!: () => void
  api.remove.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve(true)
      }),
  )
  const r = row('https://example.com/poe2')
  action(r, 'delete').click()
  action(r, 'confirm-delete').click()
  await vi.waitFor(() => expect(release).toBeDefined())
  const input = required(view.root.querySelector('input'))
  input.focus()
  release()
  await vi.waitFor(() => expect(view.root.querySelector('.site-list .site-row')).toBeNull())
  expect(document.activeElement).toBe(input)
})

it('B2-06 同主机多条规则的操作名与确认文案写完整网址，长网址截断并保留完整提示', async () => {
  const long = `/guides/${'very-long-directory-name/'.repeat(4)}end`
  await seeded([
    { origin: 'http://127.0.0.1:5192', path: '/guides' },
    { origin: 'http://127.0.0.1:5192', path: long },
  ])
  const names = [
    ...document.querySelectorAll<HTMLElement>('.site-list [data-action="delete"]'),
  ].map((b) => b.getAttribute('aria-label'))
  expect(names).toEqual(['删除 http://127.0.0.1:5192/guides', `删除 http://127.0.0.1:5192${long}`])
  const r = row(`http://127.0.0.1:5192${long}`)
  action(r, 'delete').click()
  const url = required(r.querySelector<HTMLElement>('.site-confirmation-url'))
  expect(url.title).toBe(`http://127.0.0.1:5192${long}`)
  expect(url.textContent?.length).toBeLessThanOrEqual(80)
  expect(url.textContent).toContain('…')
  expect(r.querySelector('.site-confirmation')?.textContent).toContain('权限保留')
})
it('B2-10 确认删除使用共享危险按钮样式', async () => {
  await seeded([{ origin: 'https://example.com', path: '/poe2' }])
  const r = row('https://example.com/poe2')
  action(r, 'delete').click()
  const confirm = action(r, 'confirm-delete')
  expect(confirm.classList.contains('pt-btn--danger')).toBe(true)
  expect(confirm.classList.contains('pt-btn--quiet')).toBe(false)
  expect(r.querySelector('.site-confirmation')?.textContent).toContain(
    '删除 https://example.com/poe2 这条规则，并收回 example.com 的网站访问权限。',
  )
})
it('B2-04 重新读取成功后清掉失败提示，焦点不落到 body', async () => {
  const { api, view } = setup()
  api.read.mockRejectedValueOnce(Error('storage'))
  await view.refresh()
  const retry = required(
    [...view.root.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === '重新读取站点',
    ),
  )
  expect(retry.hidden).toBe(false)
  retry.focus()
  retry.click()
  await vi.waitFor(() => expect(retry.hidden).toBe(true))
  expect(view.root.querySelector('[role="status"]')?.textContent).toBe('')
  expect(document.activeElement).toBe(
    view.root.querySelector('.site-presets [data-action="enable"]'),
  )
})
it('B2-21 添加覆盖已有子目录的父目录时提示范围重叠', async () => {
  const { view } = await seeded([{ origin: 'https://example.com', path: '/poe2/builds' }])
  required(view.root.querySelector('input')).value = 'https://example.com/poe2'
  required(view.root.querySelector('form')).dispatchEvent(new Event('submit', { cancelable: true }))
  await vi.waitFor(() =>
    expect(view.root.querySelector('[role="status"]')?.textContent).toContain('范围重叠'),
  )
  expect(view.root.querySelector('[role="status"]')?.textContent).toContain('已有的 1 条规则')
})
it('B2-11 站点页页面底用 --page，内容面板保持纯黑', async () => {
  const { readFileSync } = await import('node:fs')
  const style = document.createElement('style')
  style.textContent = [
    'packages/ui-theme/src/tokens.css',
    'apps/poe2-extension/src/guide/guide.css',
    'apps/poe2-extension/src/sites/sites.css',
  ]
    .map((file) => readFileSync(file, 'utf8').replace(/@import[^;]+;/g, ''))
    .join('\n')
  document.head.append(style)
  try {
    const { view } = setup()
    expect(getComputedStyle(document.body).backgroundColor).toBe('#0e1115')
    expect(getComputedStyle(view.root).backgroundColor).toBe('#000000')
  } finally {
    style.remove()
  }
})
it('B2-05 权限事件触发的额外刷新重建行时，焦点回到新行的同一操作', async () => {
  const { api, view } = await seeded([{ origin: 'https://maxroll.gg', path: '/poe2' }])
  const key = 'https://maxroll.gg/poe2'
  action(row(key), 'delete').focus()
  // 模拟 chrome.permissions.onRemoved：权限被撤销后列表刷新
  api.contains.mockResolvedValue(false)
  await view.refresh()
  expect(document.activeElement).toBe(action(row(key), 'delete'))
  // 删除完成后撤权事件再刷新一次，焦点不丢到 body
  api.contains.mockResolvedValue(true)
  action(row(key), 'delete').click()
  action(row(key), 'confirm-delete').click()
  await vi.waitFor(() => expect(row(key).textContent).toContain('未开启'))
  await vi.waitFor(() => expect(document.activeElement).toBe(action(row(key), 'enable')))
  await view.refresh()
  expect(document.activeElement).toBe(action(row(key), 'enable'))
  // 再次开启后焦点落在新行的删除按钮
  action(row(key), 'enable').click()
  await vi.waitFor(() => expect(row(key).textContent).toContain('已开启'))
  await vi.waitFor(() => expect(document.activeElement).toBe(action(row(key), 'delete')))
  await view.refresh()
  expect(document.activeElement).toBe(action(row(key), 'delete'))
})
