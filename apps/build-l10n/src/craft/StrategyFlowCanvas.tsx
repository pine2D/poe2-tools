import {
  type CraftStrategy,
  type CraftStrategyDecision,
  readCraftStrategy,
} from '@poe2-tools/item-core'
import { type Ref, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import {
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  GRAPH_ROUTE_LABELS,
  graphNodeX,
  strategyEdgeGeometry,
  strategyGraphDimensions,
  strategyGraphEdges,
} from './strategyGraph'
import './flow-canvas.css'

export interface StrategyFlowCanvasProps {
  active?: boolean
  connectionControl?: Ref<{ cancelConnection: () => boolean }>
  strategy: CraftStrategy
  stageId: string | undefined
  decision: CraftStrategyDecision | null
  ruleLabels: readonly string[]
  onChange: (strategy: CraftStrategy) => void
  onEditRule: (index: number) => void
}
export function StrategyFlowCanvas({
  active = true,
  connectionControl,
  strategy,
  stageId,
  decision,
  ruleLabels,
  onChange,
  onEditRule,
}: StrategyFlowCanvasProps) {
  const [selectedId, setSelectedId] = useState(stageId)
  const [zoom, setZoom] = useState(100)
  const [connection, setConnection] = useState<{
    strategy: CraftStrategy
    ruleIndex: number
    field: 'nextStageId' | 'onBlockedStageId'
  } | null>(null)
  useEffect(() => {
    if (!active) setConnection(null)
  }, [active])
  const marker = useId()
  const viewport = useRef<HTMLElement>(null)
  useImperativeHandle(
    connectionControl,
    () => ({
      cancelConnection: () => {
        if (!connection || connection.strategy !== strategy) return false
        setConnection(null)
        return true
      },
    }),
    [connection, strategy],
  )
  const flow = strategy.flow
  if (!flow) return null
  const selected =
    flow.stages.find((stage) => stage.id === selectedId) ??
    flow.stages.find((stage) => stage.id === stageId) ??
    flow.stages[0]
  if (!selected) return null
  const pending = connection?.strategy === strategy ? connection : null
  const edges = strategyGraphEdges(strategy)
  const { nodeY, height } = strategyGraphDimensions(edges, flow.stages)
  const begin = (ruleIndex: number, field: 'nextStageId' | 'onBlockedStageId') => {
    setConnection({ strategy, ruleIndex, field })
    viewport.current?.scrollIntoView?.({ block: 'nearest' })
    viewport.current?.focus({ preventScroll: true })
  }
  const decidedRule =
    decision && 'ruleIndex' in decision && decision.ruleIndex !== undefined
      ? strategy.rules[decision.ruleIndex]
      : undefined
  const width = flow.stages.length * 240 + 48
  const apply = (next: CraftStrategy) => {
    if (readCraftStrategy(next).ok) onChange(next)
  }
  const select = (id: string) => {
    setSelectedId(id)
    if (!pending) return
    const rules = strategy.rules.map((rule, index) =>
      index === pending.ruleIndex ? { ...rule, [pending.field]: id } : rule,
    )
    setConnection(null)
    apply({ ...strategy, rules })
  }
  const clear = (index: number, field: 'nextStageId' | 'onBlockedStageId') => {
    apply({
      ...strategy,
      rules: strategy.rules.map((rule, i) => {
        if (i !== index) return rule
        const next = { ...rule }
        delete next[field]
        return next
      }),
    })
  }
  const name = (id: string) => flow.stages.find((stage) => stage.id === id)?.name ?? id
  return (
    <section
      className="flow-canvas"
      aria-label="流程画布"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && pending) {
          event.preventDefault()
          setConnection(null)
          event.stopPropagation()
        }
      }}
    >
      <h4>流程画布</h4>
      <p>
        选择阶段查看规则；先选规则输出，再点目标阶段完成连接。画布可横向滚动，连线也可用键盘选择。
      </p>
      <div className="strategy-toolbar">
        <button
          type="button"
          aria-label="缩小画布"
          disabled={zoom <= 50}
          onClick={() => setZoom(Math.max(50, zoom - 25))}
        >
          −
        </button>
        <output aria-label="画布缩放">{zoom}%</output>
        <button
          type="button"
          aria-label="放大画布"
          disabled={zoom >= 150}
          onClick={() => setZoom(Math.min(150, zoom + 25))}
        >
          ＋
        </button>
        <button type="button" onClick={() => setZoom(100)}>
          重置画布缩放
        </button>
      </div>
      <p className="flow-canvas-legend">
        <span>实线：应用后</span>
        <span>虚线：仅判断</span>
        <span>点线：无法执行时</span>
        <span>加粗：本次判断路径</span>
      </p>
      {pending ? (
        <p role="status" aria-label="画布连接状态">
          正在连接规则 {pending.ruleIndex + 1} 的
          {pending.field === 'onBlockedStageId' ? '备用' : '下一阶段'}路线，请点击目标阶段。
          <button type="button" onClick={() => setConnection(null)}>
            取消连接
          </button>
        </p>
      ) : null}
      <section
        ref={viewport}
        className="flow-canvas-viewport"
        aria-label="可滚动的阶段图"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: 使横向滚动区域可由键盘聚焦并滚动，区域已有可读名称。
        tabIndex={0}
      >
        <div style={{ width: (width * zoom) / 100, height: (height * zoom) / 100 }}>
          <div
            className="flow-canvas-surface"
            style={{ width, height: height, transform: `scale(${zoom / 100})` }}
          >
            <svg width={width} height={height} className="flow-canvas-lines" aria-label="阶段连线">
              <title>阶段间的显式路线</title>
              <defs>
                <marker
                  id={marker}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerUnits="userSpaceOnUse"
                  markerWidth="10"
                  markerHeight="10"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const geometry = strategyEdgeGeometry(edge, flow.stages, edges)
                if (!geometry) return null
                const active =
                  decision?.route?.some(
                    (hop) =>
                      hop.ruleIndex === edge.ruleIndex &&
                      hop.from === edge.from &&
                      hop.to === edge.to &&
                      Boolean(hop.blockedReason) === (edge.kind === 'blocked'),
                  ) ?? false
                const inspect = () => {
                  setSelectedId(edge.from)
                  setConnection(null)
                }
                return (
                  // biome-ignore lint/a11y/useSemanticElements: SVG连线组不能放HTML button，提供按钮角色及Enter/Space键行为。
                  <g
                    key={`${edge.ruleIndex}-${edge.kind}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`查看规则 ${edge.ruleIndex + 1} 的${GRAPH_ROUTE_LABELS[edge.kind]}路线`}
                    data-kind={edge.kind}
                    data-active={String(active)}
                    className="flow-canvas-edge"
                    onClick={inspect}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        inspect()
                      }
                    }}
                  >
                    <title>
                      规则 {edge.ruleIndex + 1}：{name(edge.from)} → {name(edge.to)}（
                      {GRAPH_ROUTE_LABELS[edge.kind]}）
                    </title>
                    <path d={geometry.path} className="flow-canvas-edge-hit" />
                    <path
                      d={geometry.path}
                      className="flow-canvas-edge-line"
                      markerEnd={`url(#${marker})`}
                    />
                    <text x={geometry.x} y={geometry.y} textAnchor="middle">
                      {edge.ruleIndex + 1} · {GRAPH_ROUTE_LABELS[edge.kind]}
                    </text>
                  </g>
                )
              })}
            </svg>
            {flow.stages.map((stage, index) => (
              <button
                key={stage.id}
                type="button"
                className="flow-canvas-node"
                style={{
                  left: graphNodeX(index),
                  top: nodeY,
                  width: GRAPH_NODE_WIDTH,
                  height: GRAPH_NODE_HEIGHT,
                }}
                aria-label={`画布阶段 ${stage.id}：${stage.name}`}
                aria-pressed={selected.id === stage.id}
                data-current={stage.id === stageId}
                onClick={() => select(stage.id)}
              >
                <strong title={stage.name}>{stage.name}</strong>
                <span>
                  {strategy.rules.filter((rule) => rule.stageId === stage.id).length} 条规则
                </span>
                <span className="flow-canvas-badges">
                  {flow.entryStageId === stage.id ? <span>入口</span> : null}
                  {stageId === stage.id ? <span>历史位置</span> : null}
                  {decidedRule?.stageId === stage.id ? <span>本次判断</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="flow-canvas-inspector" aria-label="画布阶段详情">
        <h5>{selected.name}</h5>
        <div className="strategy-toolbar">
          <button
            type="button"
            disabled={selected.id === flow.entryStageId}
            onClick={() => apply({ ...strategy, flow: { ...flow, entryStageId: selected.id } })}
          >
            设为入口阶段
          </button>
          <button
            type="button"
            disabled={strategy.rules.length >= 12}
            onClick={() => {
              apply({
                ...strategy,
                rules: [
                  ...strategy.rules,
                  {
                    stageId: selected.id,
                    conditions: [{ kind: 'always' }],
                    action: { kind: 'stop' },
                  },
                ],
              })
              onEditRule(strategy.rules.length)
            }}
          >
            在此阶段添加停止规则
          </button>
        </div>
        {strategy.rules.filter((rule) => rule.stageId === selected.id).length === 0 ? (
          <p>本阶段尚无规则。添加停止规则后，可继续编辑条件和动作。</p>
        ) : null}
        {strategy.rules.map((rule, index) =>
          rule.stageId === selected.id ? (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 原规则以顺序定位，详情完全派生，没有子组件状态。
              key={index}
              className="flow-canvas-rule"
            >
              <p>
                <strong>规则 {index + 1}</strong> · {ruleLabels[index] ?? rule.action.kind}
              </p>
              <button
                type="button"
                aria-label={`编辑画布规则 ${index + 1}`}
                onClick={() => onEditRule(index)}
              >
                编辑条件与动作
              </button>
              {rule.action.kind === 'stop' ? (
                <p>命中后停止，无下一阶段。</p>
              ) : (
                <>
                  <p>
                    {rule.action.kind === 'jump' ? '判断后' : '应用成功后'} →{' '}
                    {rule.nextStageId ? name(rule.nextStageId) : '留在本阶段'}
                  </p>
                  <div className="strategy-toolbar">
                    <button
                      type="button"
                      aria-label={`连接规则 ${index + 1} 的${rule.action.kind === 'jump' ? '判断' : '应用后'}路线`}
                      onClick={() => begin(index, 'nextStageId')}
                    >
                      选择下一阶段
                    </button>
                    {rule.action.kind !== 'jump' && rule.nextStageId ? (
                      <button
                        type="button"
                        aria-label={`清除规则 ${index + 1} 的应用后路线`}
                        onClick={() => clear(index, 'nextStageId')}
                      >
                        恢复留在本阶段
                      </button>
                    ) : null}
                  </div>
                  {rule.action.kind !== 'jump' ? (
                    <>
                      <p>
                        无法执行时 →{' '}
                        {rule.onBlockedStageId ? name(rule.onBlockedStageId) : '停止并显示原因'}
                      </p>
                      <div className="strategy-toolbar">
                        <button
                          type="button"
                          aria-label={`连接规则 ${index + 1} 的备用路线`}
                          onClick={() => begin(index, 'onBlockedStageId')}
                        >
                          选择备用阶段
                        </button>
                        {rule.onBlockedStageId ? (
                          <button
                            type="button"
                            aria-label={`清除规则 ${index + 1} 的备用路线`}
                            onClick={() => clear(index, 'onBlockedStageId')}
                          >
                            清除备用阶段
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          ) : null,
        )}
      </section>
    </section>
  )
}
