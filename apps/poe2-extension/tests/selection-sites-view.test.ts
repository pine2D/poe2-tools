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
  api.request.mockResolvedValue(false)
  const button = required(
    [...view.root.querySelectorAll('button')].find((b) => b.textContent === 'Mobalytics'),
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
