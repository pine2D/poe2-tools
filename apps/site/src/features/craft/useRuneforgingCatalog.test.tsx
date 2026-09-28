import { readFileSync } from 'node:fs'
import type { CraftCatalog } from '@poe2-tools/item-core'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useRuneforgingCatalog } from './useRuneforgingCatalog'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const table = JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8'))
afterEach(cleanup)

it('灰区表缺失或无效时降级，显式重试后恢复', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(new Response(JSON.stringify(table)))
  const hook = renderHook(() => useRuneforgingCatalog(catalog, fetchImpl, true))
  await waitFor(() => expect(hook.result.current.error).toContain('未提供'))
  act(() => hook.result.current.retry())
  await waitFor(() => expect(hook.result.current.error).toContain('加载失败'))
  act(() => hook.result.current.retry())
  await waitFor(() => expect(hook.result.current.table?.recipes).toHaveLength(376))
  expect(fetchImpl.mock.calls.every(([url]) => url === '/craft-data/runeforging.json')).toBe(true)
})

it('未展开或主目录未就绪时不加载，旧请求迟到不能覆盖新快照', async () => {
  const replies: ((value: Response) => void)[] = []
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise((resolve) => replies.push(resolve)))
  const hook = renderHook(
    ({ source, enabled }: { source: CraftCatalog | undefined; enabled: boolean }) =>
      useRuneforgingCatalog(source, fetchImpl, enabled),
    { initialProps: { source: undefined as CraftCatalog | undefined, enabled: false } },
  )
  hook.rerender({ source: undefined, enabled: true })
  hook.rerender({ source: catalog, enabled: false })
  expect(fetchImpl).not.toHaveBeenCalled()
  hook.rerender({ source: catalog, enabled: true })
  expect(hook.result.current.loading).toBe(true)
  const updated = structuredClone(catalog)
  hook.rerender({ source: updated, enabled: true })
  await act(async () => replies[1]?.(new Response(JSON.stringify(table))))
  await waitFor(() => expect(hook.result.current.table?.recipes).toHaveLength(376))
  await act(async () => replies[0]?.(new Response('', { status: 404 })))
  expect(hook.result.current.table?.recipes).toHaveLength(376)
  expect(hook.result.current.error).toBeUndefined()
  hook.rerender({ source: structuredClone(updated), enabled: true })
  expect(hook.result.current.table).toBeUndefined()
  expect(hook.result.current.loading).toBe(true)
})
