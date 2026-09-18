import {
  type CatalogMod,
  type CraftCatalog,
  type CraftState,
  inspectNumericLines,
  renderNumericLines,
  type VaalCraftOperation,
  vaalJewelAffixCandidates,
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
function Addition({
  mod,
  onPreview,
  translateLine,
}: {
  mod: CatalogMod
  onPreview: Props['onPreview']
  translateLine: Props['translateLine']
}) {
  const [values, setValues] = useState(() => {
    const ranges = inspectNumericLines(mod.lines)
    return ranges.ok ? ranges.value.map((r) => r.min) : []
  })
  return (
    <>
      <NumericControls
        label="瓦尔新增"
        patterns={mod.lines}
        values={values}
        onChange={setValues}
        {...(translateLine ? { translateLine } : {})}
      />
      <button
        type="button"
        disabled={!renderNumericLines(mod.lines, values).ok}
        onClick={() => onPreview({ kind: 'vaal', outcome: 'add', modId: mod.id, values })}
      >
        预演腐化：新增一条词缀
      </button>
    </>
  )
}
export function VaalJewelAffixChoice(props: Props) {
  return <Editor key={JSON.stringify([props.catalog._meta, props.state])} {...props} />
}
function Editor({ catalog, state, disabled, onPreview, translateLine }: Props) {
  const [addId, setAddId] = useState('')
  const [removeId, setRemoveId] = useState('')
  const result = useMemo(() => vaalJewelAffixCandidates(catalog, state), [catalog, state])
  const describe = (lines: string[]) => lines.map((l) => translateLine?.(l) ?? l).join('；')
  if (!result.ok) return <p>{result.error}</p>
  const mod = result.value.find((m) => m.id === addId)
  const removed = state.affixes.find((a) => (a.affixId ?? a.modId) === removeId)
  return (
    <fieldset disabled={disabled}>
      <legend>珠宝：新增或移除一条词缀</legend>
      <p>
        按公开作者说明推导的指定结果模型，尚待当前版本真机核对。普通稀有珠宝可预演新增第五条；已有超容量、破裂、工艺及亵渎交互暂未核实。
      </p>
      <label>
        选择瓦尔新增词缀
        <select value={addId} onChange={(e) => setAddId(e.target.value)}>
          <option value="">请选择</option>
          {result.value.map((m) => (
            <option key={m.id} value={m.id}>
              {m.kind === 'prefix' ? '前缀' : '后缀'} · {describe(m.lines)}
            </option>
          ))}
        </select>
      </label>
      {mod ? (
        <Addition key={mod.id} mod={mod} onPreview={onPreview} translateLine={translateLine} />
      ) : null}
      <label>
        选择瓦尔移除词缀
        <select value={removeId} onChange={(e) => setRemoveId(e.target.value)}>
          <option value="">请选择</option>
          {state.affixes.map((a) => (
            <option key={a.affixId ?? a.modId} value={a.affixId ?? a.modId}>
              {describe(a.lines)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!removed}
        onClick={() => {
          if (removed)
            onPreview({
              kind: 'vaal',
              outcome: 'remove',
              removeModId: removed.modId,
              ...(removed.affixId ? { removeAffixId: removed.affixId } : {}),
            })
        }}
      >
        预演腐化：移除一条词缀
      </button>
    </fieldset>
  )
}
