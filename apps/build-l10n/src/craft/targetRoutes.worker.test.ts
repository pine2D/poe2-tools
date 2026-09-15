import type {
  CraftDefinitionRoutes,
  CraftResult,
  planTargetDefinitionRoutes,
} from '@poe2-tools/item-core'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'

afterEach(() => vi.unstubAllGlobals())
it('Worker 实际接收完整定义并返回 tN 路线，无旧 modId 参数投影', async () => {
  const worker = {
    onmessage: null as
      | null
      | ((event: { data: Parameters<typeof planTargetDefinitionRoutes> }) => void),
    postMessage: vi.fn<(result: CraftResult<CraftDefinitionRoutes>) => void>(),
  }
  vi.stubGlobal('self', worker)
  await import('./targetRoutes.worker')
  worker.onmessage?.({
    data: [
      boneCatalog(),
      boneState(),
      {
        nextTargetId: 40,
        targets: [{ targetId: 't27', modId: 'prefix1' }],
        alternatives: [],
        values: [],
      },
      { maxDepth: 1 },
      [],
    ],
  })
  const result = worker.postMessage.mock.calls[0]?.[0]
  expect(result?.ok).toBe(true)
  if (!result?.ok) throw Error('未返回路线')
  expect(result.value.routes.length).toBeGreaterThan(0)
  expect(result.value.routes[0]?.steps[0]?.gainedTargetIds).toEqual(['t27'])
})
