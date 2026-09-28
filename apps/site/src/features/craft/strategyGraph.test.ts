import type { DefinitionCraftStrategy } from '@poe2-tools/item-core'
import { expect, it } from 'vitest'
import { strategyEdgeGeometry, strategyGraphEdges } from './strategyGraph'

const strategy: DefinitionCraftStrategy = {
  maxSteps: 10,
  flow: {
    entryStageId: 'a',
    stages: [
      { id: 'a', name: '准备' },
      { id: 'b', name: '完成' },
    ],
  },
  rules: Array.from({ length: 4 }, () => ({
    stageId: 'a',
    nextStageId: 'b',
    onBlockedStageId: 'b',
    conditions: [{ kind: 'always' }],
    action: { kind: 'currency', currency: 'regal' },
  })),
}
it('同端点的多规则和备用路线都有独立路径及可读标签间距', () => {
  const edges = strategyGraphEdges(strategy),
    stages = strategy.flow?.stages ?? []
  const geometries = edges.map((edge) => strategyEdgeGeometry(edge, stages, edges))
  expect(new Set(geometries.map((g) => g?.path)).size).toBe(8)
  const ys = geometries.map((g) => g?.y ?? 0).sort((a, b) => a - b)
  for (let i = 1; i < ys.length; i++)
    expect((ys[i] ?? 0) - (ys[i - 1] ?? 0)).toBeGreaterThanOrEqual(16)
})
it('自环与回连也分别保留输出身份，停止与默认留在阶段不画假连接', () => {
  const p: DefinitionCraftStrategy = {
    ...strategy,
    rules: [
      { stageId: 'a', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
      {
        stageId: 'a',
        conditions: [{ kind: 'always' }],
        action: { kind: 'currency', currency: 'transmutation' },
      },
      ...strategy.rules.map((rule) => ({
        ...rule,
        stageId: 'b',
        nextStageId: 'a',
        onBlockedStageId: 'b',
      })),
    ],
  }
  const edges = strategyGraphEdges(p),
    stages = p.flow?.stages ?? []
  expect(edges).toHaveLength(8)
  expect(new Set(edges.map((edge) => strategyEdgeGeometry(edge, stages, edges)?.path)).size).toBe(8)
})
