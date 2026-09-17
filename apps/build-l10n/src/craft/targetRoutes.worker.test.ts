import { readFileSync } from 'node:fs'
import type {
  CraftCatalog,
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

it('Worker 保留装备技能目标语义，使用原最高等级生成完美溶剂路线', async () => {
  vi.resetModules()
  const worker = {
    onmessage: null as
      | null
      | ((event: { data: Parameters<typeof planTargetDefinitionRoutes> }) => void),
    postMessage: vi.fn<(result: CraftResult<CraftDefinitionRoutes>) => void>(),
  }
  vi.stubGlobal('self', worker)
  await import('./targetRoutes.worker')
  const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
  worker.onmessage?.({
    data: [
      catalog,
      {
        baseId: 'Rattling Sceptre',
        itemLevel: 53,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
        implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)'],
      },
      { nextTargetId: 1, targets: [], alternatives: [], values: [] },
      { maxDepth: 1, maxStates: 4 },
      [{ kind: 'granted-skill', lineIndex: 0, bounds: [{ index: 0, min: 20 }] }],
    ],
  })
  const result = worker.postMessage.mock.calls[0]?.[0]
  if (!result?.ok) throw Error(result?.error ?? 'Worker未返回')
  expect(result.value.routes.length).toBeGreaterThan(0)
  expect(result.value.routes[0]?.steps.map((step) => step.operation)).toEqual([
    { kind: 'perfect-flux', previousMaxLevel: 13 },
  ])
  expect(result.value.routes[0]?.finalState.grantedSkillLevel).toBe(20)
})
