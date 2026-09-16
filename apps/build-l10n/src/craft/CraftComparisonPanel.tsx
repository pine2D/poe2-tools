import {
  analyzeCraftImplicitTargets,
  analyzeTargetDefinitions,
  BONE_RULES,
  CATALYSTS,
  type CraftCatalog,
  type CraftImplicitTargetValues,
  type CraftNumericChange,
  type CraftState,
  type CraftTargetDefinitions,
  compareCraftStates,
  type PendingDesecration,
  readCraftGrantedSkillLevel,
} from '@poe2-tools/item-core'
import { useMemo } from 'react'
import './comparison.css'
import { boneOmenLabels, boneRevealOmenLabel } from './boneOmenLabels'
import { ModStateBadges } from './ModStateBadges'

interface CraftComparisonPanelProps {
  targetImplicitValues?: CraftImplicitTargetValues[]
  catalog: CraftCatalog
  definitions: CraftTargetDefinitions
  before: CraftState
  capacityContext?: CraftState
  after: CraftState
  translations?: Record<string, string>
  translateLine?: (line: string) => string | null
}

const RARITY_LABELS = { normal: '普通', magic: '魔法', rare: '稀有' } as const
const CHANGE_LABELS = { added: '新增', removed: '移除', changed: '数值变化' } as const

export function CraftComparisonPanel({
  catalog,
  definitions,
  before,
  capacityContext,
  after,
  translateLine,
  translations = {},
  targetImplicitValues = [],
}: CraftComparisonPanelProps) {
  const fractureGoalState = (state: CraftState) => {
    if (!definitions.fracturedTargetId) return null
    const analyzed = analyzeTargetDefinitions(
      catalog,
      state,
      definitions,
      undefined,
      targetImplicitValues,
      capacityContext,
    )
    return analyzed.ok
      ? analyzed.value.progress.matches.some(
          (match) => match.targetId === definitions.fracturedTargetId,
        )
      : null
  }
  const fractureBefore = fractureGoalState(before)
  const fractureAfter = fractureGoalState(after)
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
  if (result.ok && result.value.destroyed)
    return (
      <section aria-label="装备前后变化">
        <p>
          装备状态：{result.value.destroyed.before ? '已摧毁' : '存活'} →{' '}
          {result.value.destroyed.after ? '已摧毁' : '存活'}
        </p>
        <p>摧毁后没有可用装备，不再比较属性数值或目标达成；费用保留在演练记录中。</p>
      </section>
    )
  const skillChanged = before.grantedSkillLevel !== after.grantedSkillLevel
  const skillBefore = skillChanged ? readCraftGrantedSkillLevel(catalog, before) : null
  const skillAfter = skillChanged ? readCraftGrantedSkillLevel(catalog, after) : null
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
      {skillChanged ? (
        <section aria-label="装备技能最高等级变化">
          <p>
            装备技能最高等级：{skillBefore?.ok ? (skillBefore.value.level ?? '未知') : '未知'} →{' '}
            {skillAfter?.ok ? (skillAfter.value.level ?? '未知') : '未知'}
          </p>
          <p>原技能行保留为导入／起点观察；角色当前使用等级未计算。</p>
        </section>
      ) : null}
      {before.catalyst?.quality !== after.catalyst?.quality ? (
        <section aria-label="催化品质前后变化">
          <p>
            催化品质 ·{' '}
            {CATALYSTS.find((entry) => entry.id === before.catalyst?.id)?.label ?? '未知类型'}：
            {before.catalyst?.quality ?? 0}% → {after.catalyst?.quality ?? 0}%
          </p>
          <p>品质消耗会改变匹配属性的有效值，已有词缀基础数值与破裂锁定保持不变。</p>
        </section>
      ) : null}
      {definitions.fracturedTargetId ? (
        <p>
          破裂目标：{fractureBefore === null ? '无法判断' : fractureBefore ? '已达成' : '未达成'} →{' '}
          {fractureAfter === null ? '无法判断' : fractureAfter ? '已达成' : '未达成'}
        </p>
      ) : null}
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
          result.value.corrupted === undefined &&
          result.value.corruption === undefined &&
          result.value.secondCorruption === undefined &&
          result.value.twiceCorrupted === undefined &&
          result.value.affixes.length === 0 &&
          result.value.implicit === null &&
          result.value.socketCount === undefined &&
          result.value.pendingDesecration === undefined &&
          !result.value.sockets?.length &&
          !skillChanged ? (
            <p>没有可识别的属性变化。</p>
          ) : null}
          {result.value.rarity ? (
            <p>
              稀有度：{RARITY_LABELS[result.value.rarity.before]} →{' '}
              {RARITY_LABELS[result.value.rarity.after]}
            </p>
          ) : null}
          {result.value.corrupted ? (
            <p>
              腐化状态：{result.value.corrupted.before ? '已腐化' : '未腐化'} →{' '}
              {result.value.corrupted.after ? '已腐化' : '未腐化'}
            </p>
          ) : null}
          {result.value.twiceCorrupted ? (
            <p>
              二重腐化状态：{result.value.twiceCorrupted.before ? '是' : '否'} →{' '}
              {result.value.twiceCorrupted.after ? '是' : '否'}
            </p>
          ) : null}
          {result.value.secondCorruption ? (
            <section aria-label="第二组腐化强化变化">
              <h4>第二组腐化强化</h4>
              {group(
                '第二组腐化强化',
                result.value.secondCorruption.before?.lines ?? null,
                result.value.secondCorruption.after?.lines ?? null,
                [],
              )}
            </section>
          ) : null}
          {result.value.corruption ? (
            <article className="comparison-group">
              <h4>腐化强化变化</h4>
              {group(
                '腐化强化',
                result.value.corruption.before?.lines ?? null,
                result.value.corruption.after?.lines ?? null,
                [],
              )}
            </article>
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
            const transformed =
              change.beforeModId != null &&
              change.afterModId != null &&
              change.beforeModId !== change.afterModId
            const previousLabel =
              modById.get(change.beforeModId ?? change.modId)?.name ??
              change.beforeModId ??
              change.modId
            const currentLabel = mod?.name ?? change.modId
            const label = transformed ? `${previousLabel} → ${currentLabel}` : currentLabel
            const displayedAffix = (change.kind === 'removed' ? before : after).affixes.find(
              (affix) =>
                change.affixId === undefined
                  ? affix.modId === change.modId
                  : affix.affixId === change.affixId,
            )
            return (
              <article className="comparison-group" key={change.affixId ?? change.modId}>
                <header>
                  <span className="comparison-kind">
                    {transformed
                      ? '词缀转换'
                      : change.fractured
                        ? '破裂状态变化'
                        : change.crafted || change.desecrated
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
                {change.fractured ? (
                  <p>
                    破裂状态：{change.fractured.before ? '已锁定' : '未锁定'} →{' '}
                    {change.fractured.after ? '已锁定' : '未锁定'}
                  </p>
                ) : null}
                {change.desecrated ? (
                  <p>
                    亵渎来源：{change.desecrated.before ? '亵渎' : '普通'} →{' '}
                    {change.desecrated.after ? '亵渎' : '普通'}
                  </p>
                ) : null}
                {displayedAffix?.desecrated ? <ModStateBadges states={['desecrated']} /> : null}
                {change.crafted ? (
                  <p>
                    工艺来源：{change.crafted.before ? '工艺' : '普通'} →{' '}
                    {change.crafted.after ? '工艺' : '普通'}
                  </p>
                ) : null}
                {change.kind !== 'changed' && displayedAffix?.crafted ? (
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
