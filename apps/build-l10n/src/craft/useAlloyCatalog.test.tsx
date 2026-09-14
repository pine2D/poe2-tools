import { readFileSync } from 'node:fs'
import type { CraftCatalog } from '@poe2-tools/item-core'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { alloyTestFixture } from '../../../../packages/item-core/src/alloyTestFixture'
import { useAlloyCatalog } from './useAlloyCatalog'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
afterEach(cleanup)

it('目录就绪即加载以便直接恢复项目，迟到的旧快照响应不能覆盖新表', async () => {
  const replies: ((value: Response) => void)[] = []
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise((resolve) => replies.push(resolve)))
  const hook = renderHook(
    ({ source }: { source: CraftCatalog | undefined }) => useAlloyCatalog(source, fetchImpl, true),
    { initialProps: { source: undefined as CraftCatalog | undefined } },
  )
  expect(fetchImpl).not.toHaveBeenCalled()
  hook.rerender({ source: catalog })
  expect(hook.result.current.loading).toBe(true)
  const updated = structuredClone(catalog)
  hook.rerender({ source: updated })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  const current = alloyTestFixture()
  await act(async () => replies[1]?.(new Response(JSON.stringify(current))))
  await waitFor(() => expect(hook.result.current.table).toEqual(current))
  const stale = { ...alloyTestFixture(), alloys: [] }
  await act(async () => replies[0]?.(new Response(JSON.stringify(stale))))
  expect(hook.result.current.table).toEqual(current)
  hook.rerender({ source: updated })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})
