import {
  type ArtificerCraftOperation,
  artificerSocketLimit,
  type CatalogAugment,
  type CraftCatalog,
  type CraftState,
  isConditionalArmourRune,
  isExtendedArmourRune,
  isInfluenceRune,
  isRebirthArmourRune,
  isSpecialMartialRune,
  isWardArmourRune,
  type SocketCraftOperation,
  socketCandidates,
  socketCapacity,
  socketEffectIncrease,
  socketEffects,
  socketLimitWarnings,
} from '@poe2-tools/item-core'
import { useEffect, useRef, useState } from 'react'
import './sockets.css'

interface SocketPanelProps {
  catalog: CraftCatalog
  state: CraftState
  draft: SocketCraftOperation | ArtificerCraftOperation | null
  busy: boolean
  canApply: boolean
  translations: Record<string, string>
  translateLine?: (line: string, statHashes?: readonly string[]) => string | null
  onPreview: (operation: SocketCraftOperation | ArtificerCraftOperation | null) => void
  onApply: () => void
}

const isIronRune = (augment: CatalogAugment | undefined) =>
  augment?.type === 'Rune' &&
  augment.category === 'armour' &&
  augment.localMod &&
  /^(?:Lesser |Greater |Perfect )?Iron Rune$/.test(augment.name)
const isWardRune = (augment: CatalogAugment | undefined) =>
  augment !== undefined && isWardArmourRune(augment) && augment.localMod

function specialRuneNote(augment: CatalogAugment): string {
  return augment.name === 'Rune of Vital Flame'
    ? '火焰点伤计入本件武器；技能费用转换单独生效，不作为伤害倍率。'
    : '保留触发条件与怒火阈值，不推算角色最终收益；增效不会改变怒火消耗阈值。'
}

export function SocketPanel({
  catalog,
  state,
  draft,
  busy,
  canApply,
  translations,
  translateLine,
  onPreview,
  onApply,
}: SocketPanelProps) {
  const [socketIndex, setSocketIndex] = useState(0)
  const previewRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (draft) previewRef.current?.focus()
  }, [draft])
  const selectedIndex = draft?.kind === 'socket' ? draft.socketIndex : socketIndex
  const candidates = socketCandidates(catalog, state)
  const effects = socketEffects(catalog, state)
  const limits = socketLimitWarnings(catalog, state)
  const selected = candidates.find(
    (entry) => entry.id === (draft?.kind === 'socket' ? draft.augmentId : undefined),
  )
  const artificerDraft = draft?.kind === 'artificer'
  const amplification = socketEffectIncrease(catalog, state)
  const limit = artificerSocketLimit(catalog, state)
  const sceptre = catalog.bases.find((base) => base.id === state.baseId)?.type === 'Sceptre'
  const canAddSocket = state.sockets !== undefined && state.sockets.length < limit
  const previous = catalog.augments?.find((entry) => entry.id === state.sockets?.[selectedIndex])
  const label = (name: string) => translations[name] ?? name
  if (socketCapacity(catalog, state) === 0 && state.sockets === undefined) return null
  return (
    <section className="craft-sockets" aria-label="符文镶嵌">
      <h3>{sceptre ? '神像、符文与魂核镶嵌' : '符文与魂核镶嵌'}</h3>
      <p>
        按当前部位列出可用镶嵌物及其实际效果。普通覆盖不返还旧材料；绑定孔不能替换。镶嵌效果本身不占前后缀位置。
      </p>
      {sceptre ? (
        <>
          <p>
            权杖没有本地攻击面板。各行按注明的作用对象生效；在场友军、召唤生物和伙伴效果分别保留，不推算玩家自身收益。
          </p>
          <p>权杖打孔与腐化加孔尚待游戏内复核。</p>
        </>
      ) : null}
      {limits.length > 0 ? (
        <section aria-label="镶嵌限量提示">
          {limits.map((entry) => (
            <p key={entry.name}>
              {label(entry.name)}
              {entry.name === "Aldur's Legacy" ? '（共享限量）' : ''}：本件 {entry.count} / 限量{' '}
              {entry.limit}
              {entry.exceeded ? '；本件已超限，不能据此视为可穿戴；可替换重复孔位修复。' : '。'}
            </p>
          ))}
          <p>
            其他装备与角色孔尚未核对，本件未超限不代表角色可穿戴。条件效果逐孔展示，不推算角色最终收益。
          </p>
        </section>
      ) : null}
      {amplification !== null && amplification > 0 ? (
        <p>
          已计入工艺词缀的 {amplification}% 镶嵌物增效；按固定 PoB
          快照逐枚计算，只缩放允许增效的数值，游戏真机待验收。移除该词缀会同步降低符文效果。
        </p>
      ) : null}
      {state.sockets !== undefined && limit > 0 ? (
        <div className="socket-artificer">
          <p>
            已有孔数 {state.sockets.length}，巧匠石普通打孔上限 {limit}
            。已有空孔和已镶孔都计入上限。
          </p>
          <button
            type="button"
            disabled={!canAddSocket || busy || draft !== null}
            onClick={() => onPreview({ kind: 'artificer' })}
          >
            巧匠石：添加一个孔
          </button>
          {!canAddSocket ? <p>已有孔数达到或超过普通打孔上限，不能继续使用巧匠石。</p> : null}
        </div>
      ) : null}
      {artificerDraft ? (
        <section ref={previewRef} tabIndex={-1} className="socket-preview" aria-label="打孔草稿">
          <h4>巧匠石</h4>
          <p>
            孔数 {state.sockets?.length ?? 0} → {(state.sockets?.length ?? 0) + 1}
          </p>
          <p>新增一个空孔，保留现有镶嵌物和词缀；应用后消耗一颗巧匠石。</p>
          <div className="socket-actions">
            <button type="button" onClick={() => onPreview(null)}>
              取消打孔
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canApply || busy}
              onClick={onApply}
            >
              应用打孔
            </button>
          </div>
        </section>
      ) : null}
      {state.sockets === undefined ? (
        <p>这个起点尚未记录孔位。可搜索基底，设定已有空孔后新建演练。</p>
      ) : state.sockets.length === 0 ? (
        <p>
          {state.corrupted
            ? '当前装备没有已设定的孔；腐化后不能使用巧匠石添加空孔。'
            : '当前装备没有已设定的孔。可使用巧匠石添加空孔，再选择符文镶嵌。'}
        </p>
      ) : (
        <>
          <section aria-label="当前镶嵌效果" className="socket-current">
            {state.sockets.map((id, index) => {
              const effect = effects.find((entry) => entry.socketIndex === index)?.augment
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: 孔位序号即稳定身份，操作不会改变孔数。
                <article key={index}>
                  <h4>
                    孔位 {index + 1} ·{' '}
                    {id === null ? '空孔' : label(effect?.name ?? '未识别镶嵌物')}
                  </h4>
                  {effect?.lines.map((line) => (
                    <div key={line}>
                      {translateLine?.(line, Object.keys(effect.tradeHashes)) ? (
                        <span>{translateLine(line, Object.keys(effect.tradeHashes))}</span>
                      ) : null}
                      <code>{line}</code>
                    </div>
                  ))}
                  {effect?.isSocketBound ? <p>绑定孔不能替换；萃取时不会返还此材料。</p> : null}
                  {effect ? <p>该镶嵌物穿戴需求：等级 {effect.levelReq}</p> : null}
                  {effect && isSpecialMartialRune(effect, true) ? (
                    <p>{specialRuneNote(effect)}</p>
                  ) : null}
                </article>
              )
            })}
          </section>
          <div className="socket-fields">
            <label>
              目标孔位
              <select
                aria-label="目标孔位"
                value={selectedIndex}
                disabled={busy || artificerDraft}
                onChange={(event) => {
                  setSocketIndex(Number(event.target.value))
                  onPreview(null)
                }}
              >
                {state.sockets.map((_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 孔位序号即身份，操作不改变孔数。
                  <option key={`slot-${index + 1}`} value={index}>
                    孔位 {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              镶嵌符文
              <select
                aria-label="选择镶嵌符文"
                value={draft?.kind === 'socket' ? draft.augmentId : ''}
                disabled={busy || artificerDraft}
                onChange={(event) =>
                  onPreview(
                    event.target.value
                      ? {
                          kind: 'socket',
                          socketIndex: selectedIndex,
                          augmentId: event.target.value,
                        }
                      : null,
                  )
                }
              >
                <option value="">
                  {sceptre ? '选择神像、符文或魂核查看结果' : '选择符文或魂核查看结果'}
                </option>
                {candidates.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {label(entry.name)} ·{' '}
                    {translateLine?.(entry.lines[0] ?? '', Object.keys(entry.tradeHashes)) ??
                      entry.lines[0]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {candidates.length === 0 ? <p>当前孔位或装备状态没有已核对的可用符文。</p> : null}
          {selected ? (
            <section
              ref={previewRef}
              tabIndex={-1}
              className="socket-preview"
              aria-label="镶嵌草稿"
            >
              <h4>待镶入：{label(selected.name)}</h4>
              {selected.lines.map((line) => (
                <div key={line}>
                  {translateLine?.(line, Object.keys(selected.tradeHashes)) ? (
                    <span>{translateLine(line, Object.keys(selected.tradeHashes))}</span>
                  ) : null}
                  <code>{line}</code>
                </div>
              ))}
              <p>该镶嵌物穿戴需求：等级 {selected.levelReq}，与装备物等无关。</p>
              {isSpecialMartialRune(selected, true) ? (
                <p>
                  {specialRuneNote(selected)}
                  {selected.limitId === 'AldursLegacyLimit1'
                    ? ' 两种传承共用一枚限量，同孔替换会先移除旧材料再核对数量。'
                    : ''}
                </p>
              ) : null}
              {selected.limit && !isConditionalArmourRune(selected) ? (
                <p>该镶嵌物限量 {selected.limit}；其他装备与角色孔尚未核对。</p>
              ) : null}
              {isConditionalArmourRune(selected) ? (
                <p>
                  该符文限量
                  1；其他装备与角色孔尚未核对。比例依赖角色结界或药剂回复，不增加本件最大结界；增效不改变触发间隔或持续时间。
                </p>
              ) : null}
              {isIronRune(selected) ? (
                <p>钢铁符文与普通本地防御提高相加，品质单独提供倍率；可在防御面板查看预计变化。</p>
              ) : isIronRune(previous) ? (
                <p>替换后将失去这个孔的钢铁符文防御提高，请核对防御面板的下降值。</p>
              ) : null}
              {isWardRune(selected) ? (
                <p>结界符文提供本地平值，再按本地结界提高和品质计算；可在防御面板查看预计变化。</p>
              ) : isWardRune(previous) ? (
                <p>替换后将失去这个孔的结界符文平值，请核对防御面板的下降值。</p>
              ) : null}
              {isRebirthArmourRune(selected) ? (
                <p>
                  重生符文按来源内部精度增效，逐枚计算后合计；这里只显示本件再生比例，不推算角色每秒生命回复。
                </p>
              ) : isExtendedArmourRune(selected) ? (
                <p>
                  结界提高符文与本地结界提高相加，品质单独提供倍率；没有结界平值时不会凭空增加结界。
                </p>
              ) : previous && isExtendedArmourRune(previous) && previous.localMod ? (
                <p>替换后将失去这个孔的结界提高，请核对防御面板的下降值。</p>
              ) : null}
              {selected.isSocketBound ? (
                <p>镶入后该孔永久绑定，不能再替换，萃取也不返还此材料。</p>
              ) : null}
              {isInfluenceRune(selected) ? (
                <p>
                  只能镶入空孔；镶入后开放专属词缀池，仍受物等和词缀冲突限制。Bonded
                  加成不计入默认效果；与其他扩展词缀池、特殊容量符文及骨骼揭示的组合尚未核实。
                </p>
              ) : null}
              {selected.category === 'weapon' ? (
                <p>本地伤害和攻速贡献可在武器面板查看预计变化，全局效果不计入该面板。</p>
              ) : null}
              {previous?.isSocketBound ? (
                <p>所选孔已经绑定，不能覆盖。</p>
              ) : previous ? (
                <p>旧符文会被覆盖：{label(previous.name)}，不会返还。</p>
              ) : null}
              <div className="socket-actions">
                <button type="button" onClick={() => onPreview(null)}>
                  取消镶嵌
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={!canApply || busy}
                  onClick={onApply}
                >
                  应用镶嵌
                </button>
              </div>
            </section>
          ) : null}
          <p className="socket-note">
            列出当前装备上的普通符文效果；支持的武器与防具可在面板查看本地估算。未激活绑定加成（Bonded），未合计最终穿戴需求或角色
            DPS／抗性。
          </p>
        </>
      )}
    </section>
  )
}
