import {
  CRAFT_CURRENCY_LABELS,
  CRAFT_CURRENCY_RULES,
  type CraftCatalog,
  type CraftCurrency,
  type CraftCurrencyTier,
  type CraftOmen,
  type CraftState,
  prepareCraftOperation,
  type RemovalCraftCurrency,
  removableCraftAffixes,
} from '@poe2-tools/item-core'
import { type RefObject, useEffect, useMemo, useState } from 'react'
import './step-navigation.css'

const TOOLS = [
  {
    id: 'targets',
    label: '制作目标与路线',
    group: '目标与步骤',
    words: '词缀 下一步 建议 报价 成本',
  },
  { id: 'strategy', label: '条件制作指引', group: '目标与步骤', words: '流程 分支 停止 条件' },
  {
    id: 'currency',
    label: '基础通货与预兆',
    group: '词缀与工艺',
    words: '蜕变 增幅 富豪 点金 崇高 混沌 剥离 神圣',
  },
  { id: 'essence', label: '精华制作', group: '词缀与工艺', words: '保证 词缀' },
  { id: 'bone', label: '骨骼与揭示', group: '词缀与工艺', words: '亵渎 腐烂 回响 巫妖' },
  { id: 'fracture', label: '破裂制作', group: '词缀与工艺', words: '锁定 词缀' },
  { id: 'emotion', label: '液态情感制作', group: '词缀与工艺', words: '工艺 词缀' },
  { id: 'alloy', label: '合金制作', group: '词缀与工艺', words: '工艺 保证' },
  { id: 'flux', label: '溶剂制作', group: '词缀与工艺', words: '抗性 转换' },
  {
    id: 'socket',
    label: '符文镶嵌与打孔',
    group: '孔位与收尾',
    words: '孔位 巧匠 雕像 魂核 魔符 替换',
  },
  { id: 'masterwork', label: '符文升级', group: '孔位与收尾', words: '完美 符文' },
  { id: 'runeforge', label: '防具锻造', group: '孔位与收尾', words: '基底 防御' },
  { id: 'skill-sockets', label: '装备技能辅助孔', group: '孔位与收尾', words: '工匠 技能 孔位' },
  { id: 'perfect-flux', label: '完美溶剂制作', group: '孔位与收尾', words: '技能 最高 等级' },
  { id: 'vaal', label: '瓦尔腐化预演', group: '孔位与收尾', words: '腐化 强化' },
  { id: 'architect', label: '建筑师结果预演', group: '孔位与收尾', words: '腐化 强化' },
  { id: 'extraction', label: '萃取石制作', group: '孔位与收尾', words: '摧毁 返还' },
  { id: 'catalyst', label: '催化剂效果预览', group: '品质与对照', words: '品质 有效值 对比' },
] as const

function focusTool(target: HTMLElement | null) {
  if (!target) return
  for (let node: HTMLElement | null = target; node; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement) node.open = true
  }
  const focus = target instanceof HTMLDetailsElement ? target.querySelector('summary') : target
  if (!focus) return
  if (!focus.matches('summary, button, input, select, textarea, [tabindex]')) focus.tabIndex = -1
  focus.focus()
}

interface Props {
  scope: RefObject<HTMLElement | null>
  catalog: CraftCatalog
  state: CraftState
  tier: CraftCurrencyTier
  omen: CraftOmen | undefined
  appliedSteps: number
  pending: boolean
}

export function CraftStepNavigator({
  scope,
  catalog,
  state,
  tier,
  omen,
  appliedSteps,
  pending,
}: Props) {
  const [query, setQuery] = useState('')
  const [mounted, setMounted] = useState<string[]>([])
  const [checkOpen, setCheckOpen] = useState(false)
  // 仅发现已经呈现的面板；操作资格仍由各面板和核心校验决定。
  useEffect(() => {
    const ids = TOOLS.filter((tool) =>
      scope.current?.querySelector(`[data-craft-tool="${tool.id}"]`),
    ).map((tool) => tool.id)
    if (ids.join('|') !== mounted.join('|')) setMounted(ids)
  })
  const checks = useMemo(() => {
    if (!checkOpen || pending) return []
    return (Object.keys(CRAFT_CURRENCY_LABELS) as CraftCurrency[])
      .filter((id) => CRAFT_CURRENCY_RULES[id].tier === tier)
      .map((id) => {
        const base = CRAFT_CURRENCY_RULES[id].base
        const removal = base === 'chaos' || base === 'annulment'
        const result = removal
          ? removableCraftAffixes(catalog, state, id as RemovalCraftCurrency, omen)
          : prepareCraftOperation(catalog, state, id, undefined, omen)
        return {
          id,
          message: result.ok
            ? removal
              ? '可选择移除对象；选定后继续校验完整结果。'
              : '可选择结果'
            : result.error,
        }
      })
  }, [catalog, state, tier, omen, checkOpen, pending])
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const visible = TOOLS.filter(
    (tool) =>
      mounted.includes(tool.id) &&
      words.every((word) =>
        `${tool.label} ${tool.group} ${tool.words}`.toLowerCase().includes(word),
      ),
  )
  const groups = [...new Set(visible.map((tool) => tool.group))]
  return (
    <section className="craft-step-navigation" aria-label="当前步骤">
      <header>
        <h3>当前步骤</h3>
        <span>已应用 {appliedSteps} 步</span>
      </header>
      {pending ? (
        <p className="craft-step-pending">
          当前结果尚未计入已应用步骤；请先选定并应用，或取消后继续。
          <button
            type="button"
            onClick={() =>
              focusTool(scope.current?.querySelector<HTMLElement>('[data-craft-pending]') ?? null)
            }
          >
            继续处理当前结果
          </button>
        </p>
      ) : state.pendingDesecration ? (
        <p>装备有待揭示亵渎属性。前往“骨骼与揭示”处理；其他操作是否可用，以各工具校验为准。</p>
      ) : state.corrupted ? (
        <p>装备已腐化。可继续查看各工具的适用范围与限制，基础通货不能修改腐化装备。</p>
      ) : (
        <p>
          先设置制作目标查看下一步建议，或按用途找到工具。进入工具后选择材料与结果，应用后才计入步骤及费用。
        </p>
      )}
      <label>
        查找制作工具
        <input
          type="search"
          aria-label="查找制作工具"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="如：抗性、打孔、技能、揭示"
        />
      </label>
      <nav aria-label="制作工具导航">
        {groups.map((group) => (
          <div key={group}>
            <h4>{group}</h4>
            <div className="craft-step-links">
              {visible
                .filter((tool) => tool.group === group)
                .map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    aria-label={`前往${tool.label}`}
                    onClick={() =>
                      focusTool(
                        scope.current?.querySelector<HTMLElement>(
                          `[data-craft-tool="${tool.id}"]`,
                        ) ?? null,
                      )
                    }
                  >
                    {tool.label}
                  </button>
                ))}
            </div>
          </div>
        ))}
        {!visible.length ? <p>没有匹配的制作工具。</p> : null}
      </nav>
      <p className="craft-step-note">
        这里列出当前页面的工具入口，不代表每种材料都可用于当前装备。各工具内可查看具体原因；导航不会执行制作。
      </p>
      <button
        type="button"
        aria-expanded={checkOpen}
        onClick={() => setCheckOpen((value) => !value)}
      >
        {checkOpen ? '收起通货核对' : '核对本档通货'}
      </button>
      {checkOpen ? (
        <section aria-label="本档通货核对" className="craft-currency-checks">
          <p>按下方当前通货层级和预兆核对；可选择结果不代表结果已满足或可以直接应用。</p>
          {pending ? (
            <p>请先应用或取消当前结果，再核对通货。</p>
          ) : (
            checks.map((entry) => (
              <article key={entry.id} aria-label={CRAFT_CURRENCY_LABELS[entry.id]}>
                <strong>{CRAFT_CURRENCY_LABELS[entry.id]}</strong>
                <span>{entry.message}</span>
              </article>
            ))
          )}
        </section>
      ) : null}
    </section>
  )
}
