import { readFileSync } from 'node:fs'
import type { CraftCatalog } from '@poe2-tools/item-core'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useFluxCatalog } from './useFluxCatalog'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const table = JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8'))
afterEach(cleanup)

it('未展开或主目录未就绪时不加载，旧请求迟到不能覆盖新快照', async () => {
  const replies: ((value: Response) => void)[] = []
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise((resolve) => replies.push(resolve)))
  const hook = renderHook(
    ({ source, enabled }: { source: CraftCatalog | undefined; enabled: boolean }) =>
      useFluxCatalog(source, fetchImpl, enabled),
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
  await waitFor(() => expect(hook.result.current.table?.rows).toHaveLength(15))
  await act(async () => replies[0]?.(new Response('', { status: 404 })))
  expect(hook.result.current.table?.rows).toHaveLength(15)
  expect(hook.result.current.error).toBeUndefined()
  hook.rerender({ source: structuredClone(updated), enabled: true })
  expect(hook.result.current.table).toBeUndefined()
  expect(hook.result.current.loading).toBe(true)
})
