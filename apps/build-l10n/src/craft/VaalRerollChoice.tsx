import {
  type CatalogMod,
  type CraftCatalog,
  type CraftState,
  craftCandidates,
  inspectNumericLines,
  prepareVaalReplacement,
  renderNumericLines,
  replayVaalReplacements,
  type VaalCraftOperation,
  type VaalReplacement,
} from '@poe2-tools/item-core'
import { useMemo, useState } from 'react'
import { NumericControls } from './NumericControls'

interface Props {
  catalog: CraftCatalog
  state: CraftState
  disabled: boolean
  onPreview: (step: VaalCraftOperation) => void
  translateLine?: ((line: string) => string | null) | undefined
}

function ReplacementValues({
  mod,
  translateLine,
  onAdd,
}: {
  mod: CatalogMod
  translateLine: Props['translateLine']
  onAdd: (values: number[]) => void
}) {
  const [values, setValues] = useState(() => {
    const ranges = inspectNumericLines(mod.lines)
    return ranges.ok ? ranges.value.map((range) => range.min) : []
  })
  const rendered = renderNumericLines(mod.lines, values)
  return (
    <>
      <NumericControls
        label="腐化重选"
        patterns={mod.lines}
        values={values}
        onChange={setValues}
        {...(translateLine ? { translateLine } : {})}
      />
      <button type="button" disabled={!rendered.ok} onClick={() => onAdd(values)}>
        确认本次替换
      </button>
    </>
  )
}

export function VaalRerollChoice({ catalog, state, disabled, onPreview, translateLine }: Props) {
  const [replacements, setReplacements] = useState<VaalReplacement[]>([])
  const [removeId, setRemoveId] = useState('')
  const [addId, setAddId] = useState('')
  const [query, setQuery] = useState('')
  const current = useMemo(
    () => replayVaalReplacements(catalog, state, replacements),
    [catalog, state, replacements],
  )
  const removed = useMemo(
    () =>
      current.ok && removeId ? prepareVaalReplacement(catalog, current.value, removeId) : null,
    [catalog, current, removeId],
  )
  const candidates = useMemo(
    () => (removed?.ok ? craftCandidates(catalog, removed.value) : []),
    [catalog, removed],
  )
  const mod = candidates.find((candidate) => candidate.id === addId)
  const describe = (lines: string[]) =>
    lines.map((line) => translateLine?.(line) ?? line).join('；')
  const resetChoice = () => {
    setRemoveId('')
    setAddId('')
    setQuery('')
  }
  if (!current.ok) return <p>{current.error}</p>
  return (
    <fieldset className="vaal-reroll" disabled={disabled}>
      <legend>重选词缀：指定顺序与结果</legend>
      <p>
        依次移除一组并加入一组，指定 1–3
        次；后一次可以重选前一次新加入的组。这里只预演手选路线，不推算抽中次数或属性的概率。
      </p>
      <p>该顺序模型依据公开攻略推导，尚待真机核对；破裂、工艺及亵渎词缀的交互暂不开放。</p>
      {replacements.length > 0 ? (
        <>
          <ol aria-label="腐化替换顺序">
            {replacements.map((entry, index) => {
              const added = catalog.modifiers.find((candidate) => candidate.id === entry.modId)
              const previous = replayVaalReplacements(catalog, state, replacements.slice(0, index))
              const old = previous.ok
                ? previous.value.affixes.find((affix) => affix.modId === entry.removeModId)
                : null
              const lines = added ? renderNumericLines(added.lines, entry.values) : null
              return (
                <li key={JSON.stringify(replacements.slice(0, index + 1))}>
                  <p>移除：{old ? describe(old.lines) : entry.removeModId}</p>
                  <p>加入：{lines?.ok ? describe(lines.value) : entry.modId}</p>
                </li>
              )
            })}
          </ol>
          <button
            type="button"
            onClick={() => {
              setReplacements(replacements.slice(0, -1))
              resetChoice()
            }}
          >
            撤回最后一次替换
          </button>
        </>
      ) : null}
      {replacements.length < 3 ? (
        <fieldset>
          <legend>第 {replacements.length + 1} 次替换</legend>
          <label>
            先选择当前要移除的词缀
            <select
              aria-label="腐化重选：移除词缀"
              value={removeId}
              onChange={(event) => {
                setRemoveId(event.target.value)
                setAddId('')
                setQuery('')
              }}
            >
              <option value="">选择移除结果</option>
              {current.value.affixes.map((affix) => (
                <option key={affix.modId} value={affix.modId}>
                  {describe(affix.lines)}
                </option>
              ))}
            </select>
          </label>
          {removed?.ok ? (
            <>
              <label>
                搜索本次可加入属性
                <input
                  type="search"
                  aria-label="搜索腐化重选词缀"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label>
                再选择普通词缀与档位
                <select
                  aria-label="腐化重选：加入词缀"
                  value={mod?.id ?? ''}
                  onChange={(event) => setAddId(event.target.value)}
                >
                  <option value="">选择加入结果（{candidates.length} 组可用）</option>
                  {candidates
                    .filter(
                      (candidate) =>
                        candidate.id === addId ||
                        `${candidate.id} ${candidate.name} ${describe(candidate.lines)}`
                          .toLowerCase()
                          .includes(query.trim().toLowerCase()),
                    )
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.kind === 'prefix' ? '前缀' : '后缀'} ·{' '}
                        {describe(candidate.lines)} · 词缀等级 {candidate.level}
                      </option>
                    ))}
                </select>
              </label>
              {mod ? (
                <ReplacementValues
                  key={`${removeId}:${mod.id}`}
                  mod={mod}
                  translateLine={translateLine}
                  onAdd={(values) => {
                    setReplacements([
                      ...replacements,
                      { removeModId: removeId, modId: mod.id, values: [...values] },
                    ])
                    resetChoice()
                  }}
                />
              ) : null}
            </>
          ) : removed ? (
            <p role="status">{removed.error}</p>
          ) : null}
        </fieldset>
      ) : (
        <p>已指定三次替换；可撤回最后一次再调整。</p>
      )}
      <p>尚未应用，不产生材料费用；最终结果见上方前后比较及目标状态。</p>
      <button
        type="button"
        disabled={replacements.length === 0}
        onClick={() => onPreview({ kind: 'vaal', outcome: 'reroll', replacements })}
      >
        预演腐化：重选词缀
      </button>
    </fieldset>
  )
}
