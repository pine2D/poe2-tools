import {
  analyzeCraftImplicitTargets,
  BONE_RULES,
  type CraftCatalog,
  type CraftImplicitTargetValues,
  type CraftNumericChange,
  type CraftState,
  compareCraftStates,
  type PendingDesecration,
} from '@poe2-tools/item-core'
import { useMemo } from 'react'
import './comparison.css'
import { boneOmenLabels, boneRevealOmenLabel } from './boneOmenLabels'
import { ModStateBadges } from './ModStateBadges'

interface CraftComparisonPanelProps {
  targetImplicitValues?: CraftImplicitTargetValues[]
  catalog: CraftCatalog
  before: CraftState
  after: CraftState
  translations?: Record<string, string>
  translateLine?: (line: string) => string | null
}

const RARITY_LABELS = { normal: '普通', magic: '魔法', rare: '稀有' } as const
const CHANGE_LABELS = { added: '新增', removed: '移除', changed: '数值变化' } as const

export function CraftComparisonPanel({
  catalog,
  before,
  after,
  translateLine,
  translations = {},
  targetImplicitValues = [],
}: CraftComparisonPanelProps) {
  const result = useMemo(() => compareCraftStates(catalog, before, after), [catalog, before, after])
  const implicitBefore = useMemo(
    () => analyzeCraftImplicitTargets(catalog, before, targetImplicitValues),
    [catalog, before, targetImplicitValues],
  )
  const implicitAfter = useMemo(
    () => analyzeCraftImplicitTargets(catalog, after, targetImplicitValues),
    [catalog, after, targetImplicitValues],
  )
  const modById = useMemo(
    () => new Map(catalog.modifiers.map((mod) => [mod.id, mod])),
    [catalog.modifiers],
  )
  const side = (label: string, direction: '操作前' | '操作后', lines: string[] | null) => (
    <section className="comparison-side" aria-label={`${label} · ${direction}`}>
      <h5>{direction}</h5>
      {lines === null ? (
        <p className="comparison-muted">无此词缀</p>
      ) : (
        lines.map((line, index) => {
          const translated = translateLine?.(line)
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 原文允许重复行；静态文本节点不含局部状态。
            <div className="comparison-line" key={`${index}:${line}`}>
              {translated ? <span lang="zh-Hans">{translated}</span> : null}
              <code lang="en">{line}</code>
            </div>
          )
        })
      )}
    </section>
  )
  const group = (
    label: string,
    beforeLines: string[] | null,
    afterLines: string[] | null,
    numeric: CraftNumericChange[],
  ) => (
    <>
      <div className="comparison-pair">
        {side(label, '操作前', beforeLines)}
        {side(label, '操作后', afterLines)}
      </div>
      {numeric.length > 0 ? (
        <ul className="comparison-numeric">
          {numeric.map((value) => (
            <li key={value.index}>
              数值 {value.index + 1}：{value.before ?? '未知'} → {value.after ?? '未知'}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )

  const pendingLines = (pending: PendingDesecration | null): string[] | null =>
    pending
      ? [
          `待揭示亵渎${pending.kind === 'prefix' ? '前缀' : '后缀'}`,
          translations[BONE_RULES[pending.boneId].name] ?? BONE_RULES[pending.boneId].name,
          ...(boneOmenLabels(pending, catalog, translations).length
            ? [
                `预兆：${boneOmenLabels(pending, catalog, translations)
                  .map((entry) => entry.label)
                  .join('、')}`,
              ]
            : []),
          ...(pending.revealOmen
            ? [
                `揭示预兆：${boneRevealOmenLabel(pending.revealOmen, catalog, translations)}（已购买一次重选机会）`,
              ]
            : []),
          ...(pending.options
            ? [
                pending.rerollOptions ? '首组三项候选' : '已固定三项候选',
                ...pending.options.flatMap((id) => [id, ...(modById.get(id)?.lines ?? [])]),
              ]
            : ['候选尚未固定']),
          ...(pending.rerollOptions
            ? [
                '第二组三项候选',
                ...pending.rerollOptions.flatMap((id) => [id, ...(modById.get(id)?.lines ?? [])]),
              ]
            : []),
        ]
      : null
  return (
    <section className="craft-comparison" aria-label="操作前后变化">
      <h3>操作前后变化</h3>
      {targetImplicitValues.length ? (
        <section aria-label="固有目标前后变化">
          {!implicitBefore.ok || !implicitAfter.ok ? (
            <p role="status">
              {!implicitBefore.ok
                ? implicitBefore.error
                : !implicitAfter.ok
                  ? implicitAfter.error
                  : ''}
            </p>
          ) : (
            implicitAfter.value.map((target) => {
              const previous = implicitBefore.value.find(
                (value) => value.lineIndex === target.lineIndex,
              )
              const line =
                catalog.bases.find((base) => base.id === after.baseId)?.implicit?.split('\n')[
                  target.lineIndex
                ] ?? ''
              return (
                <p key={target.lineIndex}>
                  固有属性 {target.lineIndex + 1} · {translateLine?.(line) ?? line}：
                  {previous?.matched ? '已达成' : '未达成'} → {target.matched ? '已达成' : '未达成'}
                  {previous?.matched && !target.matched
                    ? '（失去固有目标）'
                    : !previous?.matched && target.matched
                      ? '（达成固有目标）'
                      : ''}
                </p>
              )
            })
          )}
        </section>
      ) : null}
      {!result.ok ? (
        <p role="status">{result.error}</p>
      ) : (
        <>
          <p className="comparison-muted">按属性组对比；数值增减不代表优劣，未计算角色面板收益。</p>
          {result.value.rarity === null &&
          result.value.affixes.length === 0 &&
          result.value.implicit === null &&
          result.value.socketCount === undefined &&
          result.value.pendingDesecration === undefined &&
          !result.value.sockets?.length ? (
            <p>没有可识别的属性变化。</p>
          ) : null}
          {result.value.rarity ? (
            <p>
              稀有度：{RARITY_LABELS[result.value.rarity.before]} →{' '}
              {RARITY_LABELS[result.value.rarity.after]}
            </p>
          ) : null}
          {result.value.socketCount ? (
            <p>
              孔数：{result.value.socketCount.before} → {result.value.socketCount.after}
            </p>
          ) : null}
          {result.value.pendingDesecration ? (
            <article className="comparison-group">
              <h4>亵渎占位变化</h4>
              {group(
                '亵渎占位',
                pendingLines(result.value.pendingDesecration.before),
                pendingLines(result.value.pendingDesecration.after),
                [],
              )}
            </article>
          ) : null}
          {result.value.affixes.map((change) => {
            const mod = modById.get(change.modId)
            const label = mod?.name ?? change.modId
            return (
              <article className="comparison-group" key={change.modId}>
                <header>
                  <span className="comparison-kind">
                    {change.crafted || change.desecrated
                      ? change.numeric.length
                        ? '来源与数值变化'
                        : '来源变化'
                      : CHANGE_LABELS[change.kind]}
                  </span>
                  <h4>{label}</h4>
                  {mod ? (
                    <span className="comparison-muted">
                      {mod.kind === 'prefix' ? '前缀' : '后缀'}
                    </span>
                  ) : null}
                </header>
                {change.desecrated ? (
                  <p>
                    亵渎来源：{change.desecrated.before ? '亵渎' : '普通'} →{' '}
                    {change.desecrated.after ? '亵渎' : '普通'}
                  </p>
                ) : null}
                {(change.kind === 'removed' ? before : after).affixes.find(
                  (affix) => affix.modId === change.modId,
                )?.desecrated ? (
                  <ModStateBadges states={['desecrated']} />
                ) : null}
                {change.crafted ? (
                  <p>
                    工艺来源：{change.crafted.before ? '工艺' : '普通'} →{' '}
                    {change.crafted.after ? '工艺' : '普通'}
                  </p>
                ) : null}
                {change.kind !== 'changed' &&
                (change.kind === 'added' ? after : before).affixes.find(
                  (affix) => affix.modId === change.modId,
                )?.crafted ? (
                  <ModStateBadges states={['crafted']} />
                ) : null}
                {group(label, change.beforeLines, change.afterLines, change.numeric)}
              </article>
            )
          })}
          {result.value.implicit ? (
            <article className="comparison-group">
              <header>
                <span className="comparison-kind">数值变化</span>
                <h4>固有属性</h4>
              </header>
              {group(
                '固有属性',
                result.value.implicit.beforeLines,
                result.value.implicit.afterLines,
                result.value.implicit.numeric,
              )}
            </article>
          ) : null}
          {result.value.sockets?.map((change) => (
            <article className="comparison-group" key={`socket-${change.socketIndex}`}>
              <header>
                <span className="comparison-kind">镶嵌变化</span>
                <h4>孔位 {change.socketIndex + 1}</h4>
              </header>
              {group(
                `孔位 ${change.socketIndex + 1}`,
                change.beforeLines ?? ['空孔'],
                change.afterLines ?? ['空孔'],
                [],
              )}
            </article>
          ))}
        </>
      )}
    </section>
  )
}
