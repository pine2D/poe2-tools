import {
  BONE_RULES,
  CATALYSTS,
  type ComparedProject,
  type ComparisonLine,
  type CraftCatalog,
  type CraftProjectComparison,
  craftMaterialLabels,
  createCatalogTranslator,
  type ItemDictionary,
  renderNumericLines,
} from '@poe2-tools/item-core'
import { useMemo } from 'react'
import { boneOmenLabels, boneRevealOmenLabel } from './boneOmenLabels'

export type ComparisonPreview = {
  names: { left: string; right: string }
  comparison: CraftProjectComparison
}

function formatLine(line: ComparisonLine) {
  const known = line.values.filter((n): n is number => n !== null)
  const rendered =
    known.length === line.values.length ? renderNumericLines([line.pattern], known) : null
  const display = rendered?.ok ? rendered.value[0] : line.pattern
  const values =
    rendered?.ok || !line.values.length
      ? ''
      : `（${line.values.map((n) => n ?? '未知').join('、')}）`
  return `${display}${values}${line.unscalable ? '（不可缩放）' : ''}`
}

function ResultSide({
  side,
  projectName,
  result,
  catalog,
  lineText,
  materialName,
}: {
  side: string
  projectName: string
  result: ComparedProject
  catalog: CraftCatalog
  lineText: (line: ComparisonLine) => string
  materialName: ReturnType<typeof craftMaterialLabels>
}) {
  const item = result.equipment
  const name = (value: string) => catalog.localizedNames?.['zh-CN']?.[value] ?? value
  const base = catalog.bases.find((b) => b.id === item.baseId)
  const catalyst = item.catalyst
  const pending = item.pending
  return (
    <section className="project-comparison-side" aria-label={`${side} ${projectName}`}>
      <h4>
        {side} · {projectName}
      </h4>
      <p>
        第 {result.cursor} 步，共 {result.steps} 步
      </p>
      {item.destroyed ? (
        <p>装备已摧毁</p>
      ) : (
        <>
          <p>
            {name(base?.name ?? item.baseId)} · 物等 {item.itemLevel} ·{' '}
            {{ normal: '普通', magic: '魔法', rare: '稀有' }[item.rarity]} ·{' '}
            {item.twiceCorrupted ? '二重腐化' : item.corrupted ? '已腐化' : '未腐化'}
          </p>
          <dl>
            <dt>装备孔位</dt>
            <dd>
              {item.sockets === null
                ? '未核对'
                : item.sockets.length
                  ? item.sockets
                      .map(
                        (id, i) =>
                          `孔 ${i + 1} · ${id === null ? '空孔' : name(catalog.augments?.find((a) => a.id === id)?.name ?? id)}`,
                      )
                      .join('，')
                  : '0 孔'}
            </dd>
            <dt>普通品质</dt>
            <dd>{item.quality === null ? '未核对' : `${item.quality}%`}</dd>
            <dt>催化品质</dt>
            <dd>
              {catalyst
                ? `${CATALYSTS.find((c) => c.id === catalyst.id)?.label ?? catalyst.id} ${catalyst.quality}%`
                : '无记录'}
            </dd>
            {item.skill && (
              <>
                <dt>授予技能</dt>
                <dd>
                  {name(item.skill.name)} · 最高等级 {item.skill.level ?? '未知'} · 辅助孔{' '}
                  {item.skill.sockets ?? '未知'}
                </dd>
              </>
            )}
            {item.implicit.length > 0 && (
              <>
                <dt>固有属性</dt>
                <dd>{item.implicit.map(lineText).join(' / ')}</dd>
              </>
            )}
            {item.enchants.length > 0 && (
              <>
                <dt>腐化属性</dt>
                <dd>{item.enchants.flatMap((e) => e.lines.map(lineText)).join(' / ')}</dd>
              </>
            )}
            {pending && (
              <>
                <dt>待揭示亵渎</dt>
                <dd>
                  {name(BONE_RULES[pending.boneId].name)} ·{' '}
                  {pending.kind === 'prefix' ? '前缀' : '后缀'}
                  {boneOmenLabels(pending, catalog, {}).map((omen) => ` · ${omen.label}`)}
                  {pending.revealOmen &&
                    ` · ${boneRevealOmenLabel(pending.revealOmen, catalog, {})}`}
                  {pending.options && (
                    <p>
                      揭示备选 ·{' '}
                      {pending.options
                        .map((id) => catalog.modifiers.find((m) => m.id === id)?.name ?? id)
                        .join('、')}
                    </p>
                  )}
                  {pending.rerollOptions && (
                    <p>
                      重掷备选 ·{' '}
                      {pending.rerollOptions
                        .map((id) => catalog.modifiers.find((m) => m.id === id)?.name ?? id)
                        .join('、')}
                    </p>
                  )}
                  {pending.putrefaction && (
                    <p>
                      腐败预兆 · 前缀 {pending.putrefaction.prefix}，后缀{' '}
                      {pending.putrefaction.suffix}
                    </p>
                  )}
                </dd>
              </>
            )}
          </dl>
        </>
      )}
      <h5>制作目标 · {result.goals.status}</h5>
      {result.goals.detail && <p>{result.goals.detail}</p>}
      {result.goals.rows.length > 0 && (
        <ul>
          {result.goals.rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 静态核对结果允许有相同的目标与条件。
            <li key={i}>
              {row.label} · {row.status}
              {row.detail && `（${row.detail}）`}
            </li>
          ))}
        </ul>
      )}
      <h5>已用材料</h5>
      {result.materials.length ? (
        <ul>
          {result.materials.map((m) => (
            <li key={m.id}>
              {materialName(m)} × {m.count}
            </li>
          ))}
        </ul>
      ) : (
        <p>尚未消耗材料</p>
      )}
    </section>
  )
}

export function ProjectComparisonResult({
  preview,
  catalog,
  dictionary,
}: {
  preview: ComparisonPreview
  catalog: CraftCatalog
  dictionary: ItemDictionary | undefined
}) {
  const { comparison, names } = preview
  const translate = useMemo(
    () => createCatalogTranslator(dictionary?.stats?.entries ?? []),
    [dictionary],
  )
  const lineText = (line: ComparisonLine) => {
    const text = formatLine(line)
    return translate(text) ?? text
  }
  const materialName = useMemo(
    () => craftMaterialLabels(catalog, dictionary?.items?.bases),
    [catalog, dictionary],
  )
  return (
    <>
      <h3>收藏比较结果</h3>
      <p>
        {comparison.sameEquipment
          ? '两份收藏在保存位置记录的装备属性一致。'
          : '两份收藏在保存位置的装备不同。'}
      </p>
      <div className="project-comparison-pair">
        <ResultSide
          side="第一份"
          projectName={names.left}
          result={comparison.left}
          catalog={catalog}
          lineText={lineText}
          materialName={materialName}
        />
        <ResultSide
          side="第二份"
          projectName={names.right}
          result={comparison.right}
          catalog={catalog}
          lineText={lineText}
          materialName={materialName}
        />
      </div>
      {!comparison.left.equipment.destroyed && !comparison.right.equipment.destroyed && (
        <>
          <h4>显式词缀差异</h4>
          {comparison.affixDifferences.length ? (
            <ul>
              {comparison.affixDifferences.map((row) => (
                <li key={JSON.stringify(row)}>
                  {catalog.modifiers.find((m) => m.id === row.modId)?.name ?? row.modId} ·{' '}
                  {row.lines.map(lineText).join(' / ')}
                  {row.fractured && ' · 破裂'}
                  {row.crafted && ' · 工艺'}
                  {row.desecrated && ' · 亵渎'}
                  <strong>
                    第一份 × {row.leftCount}，第二份 × {row.rightCount}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>词缀、数值和标记均一致。</p>
          )}
        </>
      )}
    </>
  )
}
