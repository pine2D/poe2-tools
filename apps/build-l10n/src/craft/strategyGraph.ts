import type { DefinitionCraftStrategy } from '@poe2-tools/item-core'

export interface StrategyGraphEdge {
  ruleIndex: number
  from: string
  to: string
  kind: 'work' | 'jump' | 'blocked'
}
export const GRAPH_ROUTE_LABELS = { work: '应用后', jump: '判断', blocked: '备用' } as const
export const GRAPH_NODE_WIDTH = 192
export const GRAPH_NODE_HEIGHT = 110
export const graphNodeX = (index: number) => 48 + index * 240

/** 只绘显式连接；工作动作未设下一阶段时，在详情说明默认留在本阶段。 */
export function strategyGraphEdges(strategy: DefinitionCraftStrategy): StrategyGraphEdge[] {
  return strategy.rules.flatMap((rule, ruleIndex) => {
    if (!rule.stageId || rule.action.kind === 'stop') return []
    const edges: StrategyGraphEdge[] = []
    if (rule.nextStageId)
      edges.push({
        ruleIndex,
        from: rule.stageId,
        to: rule.nextStageId,
        kind: rule.action.kind === 'jump' ? 'jump' : 'work',
      })
    if (rule.onBlockedStageId)
      edges.push({ ruleIndex, from: rule.stageId, to: rule.onBlockedStageId, kind: 'blocked' })
    return edges
  })
}

const isReturn = (edge: StrategyGraphEdge, stages: readonly { id: string }[]) =>
  stages.findIndex((stage) => stage.id === edge.from) >
  stages.findIndex((stage) => stage.id === edge.to)

export function strategyGraphDimensions(
  edges: readonly StrategyGraphEdge[],
  stages: readonly { id: string }[],
) {
  const returning = edges.filter((edge) => isReturn(edge, stages)).length
  const nodeY = 80 + (edges.length - returning) * 24
  return { nodeY, height: Math.max(320, nodeY + GRAPH_NODE_HEIGHT + 80 + returning * 24) }
}

/** 每条显式边单独占轨道，标签纵距18px；空间按边数扩展，回连和自环不覆盖其他输出。 */
export function strategyEdgeGeometry(
  edge: StrategyGraphEdge,
  stages: readonly { id: string }[],
  edges: readonly StrategyGraphEdge[],
) {
  const from = stages.findIndex((stage) => stage.id === edge.from),
    to = stages.findIndex((stage) => stage.id === edge.to)
  if (from < 0 || to < 0) return null
  const { nodeY } = strategyGraphDimensions(edges, stages)
  const returning = isReturn(edge, stages)
  const lane = edges
    .filter((candidate) => isReturn(candidate, stages) === returning)
    .findIndex(
      (candidate) => candidate.ruleIndex === edge.ruleIndex && candidate.kind === edge.kind,
    )
  if (lane < 0) return null
  const x1 = graphNodeX(from) + GRAPH_NODE_WIDTH / 2,
    x2 = graphNodeX(to) + GRAPH_NODE_WIDTH / 2
  const bend = returning ? nodeY + GRAPH_NODE_HEIGHT + 40 + (lane + 1) * 24 : 20 + lane * 24
  if (from === to)
    return {
      path: `M ${x1 + 44} ${nodeY} C ${x1 + 90} ${bend}, ${x1 - 90} ${bend}, ${x1 - 44} ${nodeY}`,
      x: x1,
      y: nodeY / 4 + bend * 0.75 - 7,
    }
  const y = returning ? nodeY + GRAPH_NODE_HEIGHT : nodeY
  return {
    path: `M ${x1} ${y} C ${x1} ${bend}, ${x2} ${bend}, ${x2} ${y}`,
    x: (x1 + x2) / 2,
    y: y / 4 + bend * 0.75 + (returning ? 16 : -7),
  }
}
