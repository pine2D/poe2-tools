import {
  type CraftCatalog,
  type CraftState,
  fluxCatalogSignature,
  type ItemDocument,
  type ItemInspection,
  importCraftState,
  importIdentifiedCraftState,
  importSocketCount,
  type StatTemplate,
  socketCandidates,
} from '@poe2-tools/item-core'
import { useState } from 'react'

/** 补充信息独立于原文与历史；每个空孔也需要显式选择。 */
export function ImportSocketSetup({
  catalog,
  state,
  item,
  inspection,
  capacity,
  translations,
  translateLine,
  onBegin,
  importedQuality,
  skillEntries,
}: {
  catalog: CraftCatalog
  state: CraftState
  item: ItemDocument
  inspection: Pick<ItemInspection, 'base' | 'mods' | 'comparisonOnly'> &
    Partial<Pick<ItemInspection, 'runes' | 'skills'>>
  capacity: number
  translations: Record<string, string>
  translateLine: ((line: string, statHashes?: readonly string[]) => string | null) | undefined
  skillEntries?: readonly StatTemplate[] | undefined
  importedQuality?: number
  onBegin: (state: CraftState, sockets: (string | null)[], quality?: number) => void
}) {
  const countFromText = importSocketCount(item)
  const sourceCount = countFromText.ok ? countFromText.value : null
  const [count, setCount] = useState(sourceCount === null ? '' : String(sourceCount))
  const [choices, setChoices] = useState<string[]>([])
  const countValue = count === '' ? null : Number(count)
  const countValid = countValue !== null && countValue >= 0 && countValue <= capacity
  const positions = countValid ? Array.from({ length: countValue }, (_, index) => index) : []
  const complete = countValid && positions.every((index) => Boolean(choices[index]))
  const sockets = complete
    ? positions.map((index) => (choices[index] === 'empty' ? null : (choices[index] ?? null)))
    : undefined
  const checked =
    sockets === undefined
      ? null
      : (fluxCatalogSignature(catalog) ? importIdentifiedCraftState : importCraftState)(
          catalog,
          state.baseId,
          item,
          inspection,
          sockets,
          importedQuality,
          skillEntries,
        )
  const candidates = socketCandidates(catalog, { ...state, sockets: [null] })

  return (
    <section className="import-socket-setup" aria-label="核对导入孔位">
      <h4>核对导入孔位</h4>
      <p>
        对照游戏中的装备，确认孔数和每个孔的内容。补充信息单独保存，起点已有符文不计入制作花费。
      </p>
      {inspection.runes?.length ? (
        <section aria-label="原文符文效果">
          <p>原文符文效果（需与孔内物总贡献一致）：</p>
          {inspection.runes.map(({ source, resolution }) => (
            <p key={source.line}>
              {source.raw}
              {resolution.english ? <small lang="en"> · {resolution.english}</small> : null}
            </p>
          ))}
        </section>
      ) : null}
      {!countFromText.ok ? (
        <p role="status">{countFromText.error}</p>
      ) : (
        <>
          {sourceCount === null ? (
            <label>
              导入装备孔数
              <select
                aria-label="导入装备孔数"
                value={count}
                onChange={(event) => {
                  setCount(event.target.value)
                  setChoices([])
                }}
              >
                <option value="">尚未核对</option>
                {Array.from({ length: capacity + 1 }, (_, value) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 数值即孔数身份，列表不会重排。
                  <option key={`count-${value}`} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <small>原文没有孔位信息；请选择实际孔数，零孔也需明确选择。</small>
            </label>
          ) : (
            <p>原文记录了 {sourceCount} 个孔；S 不表示空孔，请逐孔核对。</p>
          )}
          {sourceCount !== null && sourceCount > capacity ? (
            <p role="status">孔数超过当前支持范围，暂时只能对照。</p>
          ) : null}
          {positions.map((index) => (
            <label key={`socket-${index}`}>
              孔位 {index + 1}
              <select
                aria-label={`核对孔位 ${index + 1}`}
                value={choices[index] ?? ''}
                onChange={(event) => {
                  const value = event.target.value
                  setChoices((previous) =>
                    positions.map((position) =>
                      position === index ? value : (previous[position] ?? ''),
                    ),
                  )
                }}
              >
                <option value="">尚未核对</option>
                <option value="empty">空孔</option>
                {candidates.map((augment) => (
                  <option key={augment.id} value={augment.id}>
                    {translations[augment.name] ?? augment.name} ·{' '}
                    {augment.lines
                      .map(
                        (line) => translateLine?.(line, Object.keys(augment.tradeHashes)) ?? line,
                      )
                      .join('；')}
                  </option>
                ))}
              </select>
              {candidates
                .filter((augment) => augment.id === choices[index])
                .map((augment) => (
                  <small key={augment.id}>
                    {translations[augment.name] ?? augment.name}：
                    {augment.lines
                      .map(
                        (line) => translateLine?.(line, Object.keys(augment.tradeHashes)) ?? line,
                      )
                      .join('；')}
                  </small>
                ))}
            </label>
          ))}
          <p>
            列表显示符文基础效果；装备增效会在全部孔位选定后计入总贡献核对。仅列出当前部位已支持的普通符文；若实际孔内物不在列表，保留原文对照。
          </p>
          {checked && !checked.ok ? <p role="status">{checked.error}</p> : null}
          {checked?.ok && checked.value.runeSourceLines !== undefined ? (
            <p role="status">符文总贡献与原文一致。</p>
          ) : null}
          <div className="catalog-craft-actions">
            <button
              type="button"
              disabled={!checked?.ok}
              onClick={() => {
                if (checked?.ok && sockets !== undefined)
                  onBegin(checked.value, sockets, importedQuality)
              }}
            >
              按已核对孔位开始
            </button>
            <button
              type="button"
              onClick={() => {
                setCount(sourceCount === null ? '' : String(sourceCount))
                setChoices([])
              }}
            >
              重置孔位核对
            </button>
          </div>
        </>
      )}
    </section>
  )
}
