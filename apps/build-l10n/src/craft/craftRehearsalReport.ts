import {
  applyCraftStep,
  BONE_RULES,
  CATALYSTS,
  CRAFT_PRICE_UNITS,
  type CraftCatalog,
  type CraftMaterialCost,
  type CraftPricing,
  type CraftResult,
  type CraftState,
  type CraftStep,
  collectCraftCosts,
  craftAffixCapacities,
  craftedModifierCapacity,
  createCraftState,
  isConditionalArmourRune,
  prepareExtractionCraft,
  quoteCraftCosts,
  readCraftGrantedSkillLevel,
  resolveCraftAffix,
  serleCapacity,
  socketEffects,
  socketLimitWarnings,
} from '@poe2-tools/item-core'
import { boneOmenLabels, boneRevealOmenLabel } from './boneOmenLabels'
import { craftMaterialLabels } from './craftMaterialLabels'
import { craftStepLabel } from './craftStepLabel'

export interface CraftRehearsalReportInput {
  catalog: CraftCatalog
  initialState: CraftState
  operations: readonly CraftStep[]
  cursor: number
  translations: Record<string, string>
  translateLine?: (line: string) => string | null
  pricing?: CraftPricing
  includeFuture?: boolean
}

/** 从起点回放所选历史范围；未来仅作计划，不读取原始剪贴板或未应用草稿。 */
export function buildCraftRehearsalReport(input: CraftRehearsalReportInput): CraftResult<string> {
  const { catalog, initialState, operations, cursor, translations, translateLine, pricing } = input
  const fail = (error: string): CraftResult<never> => ({ ok: false, error })
  if (
    !Number.isSafeInteger(cursor) ||
    cursor < 0 ||
    cursor > operations.length ||
    operations.length > 1000
  )
    return fail('步骤清单的历史位置无效或超过 1000 步。')
  const checked = createCraftState(catalog, initialState)
  if (!checked.ok) return checked
  const base = catalog.bases.find((entry) => entry.id === initialState.baseId)
  if (!base) return fail('步骤清单缺少基底。')
  const name = (value: string) =>
    translations[value] ?? catalog.localizedNames?.['zh-CN']?.[value] ?? value
  const line = (value: string) => {
    const translated = translateLine?.(value)
    return translated && translated !== value ? `${translated} / ${value}` : value
  }
  const materialName = craftMaterialLabels(catalog, translations)
  const modById = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const rarity = { normal: '普通', magic: '魔法', rare: '稀有' }
  const snapshot = (state: CraftState): string[] => {
    if (state.destroyed) return ['装备已摧毁；没有可继续使用的装备。']
    const currentBase = catalog.bases.find((entry) => entry.id === state.baseId)
    const result = [
      ...(state.baseId !== initialState.baseId
        ? [`当前基底：${name(currentBase?.name ?? state.baseId)}`]
        : []),
      `稀有度：${rarity[state.rarity]}；${state.twiceCorrupted ? '二重腐化' : state.corrupted ? '已腐化' : '未腐化'}`,
      `普通品质：${state.quality === undefined ? '未核对' : `${state.quality}%`}`,
      ...(state.catalyst
        ? [
            `催化品质：${CATALYSTS.find((c) => c.id === state.catalyst?.id)?.label ?? state.catalyst.id} ${state.catalyst.quality}%`,
          ]
        : []),
    ]
    const serle = serleCapacity(catalog, state)
    if (serle.ok && serle.value > 0) {
      const capacity = craftAffixCapacities(catalog, state)
      result.push(
        `当前词缀容量：前缀 ${capacity.prefix} / 后缀 ${capacity.suffix}，总计 ${capacity.prefix + capacity.suffix}；Serle 绑定孔不能替换或返还。`,
      )
    }
    const craftedCapacity = craftedModifierCapacity(catalog, state)
    result.push(
      craftedCapacity.ok
        ? `工艺占用 ${state.affixes.filter((affix) => affix.crafted).length} / 当前容量 ${craftedCapacity.value}`
        : craftedCapacity.error,
    )
    if (craftedCapacity.ok && craftedCapacity.value > 1)
      result.push('当前额外工艺容量来自已核对的镶嵌物；失去容量来源后的多工艺保留行为尚未核实。')
    if (state.grantedSkillSockets !== undefined)
      result.push(
        `装备技能辅助孔：${state.grantedSkillSockets}（演练结果，独立于符文孔与技能等级）`,
      )
    const skill = readCraftGrantedSkillLevel(catalog, state)
    if (skill.ok)
      result.push(`装备技能最高等级：${skill.value.level ?? '未知'}；${name(skill.value.name)}`)
    if (state.grantedSkillLevel !== undefined)
      result.push('原固有技能行为起点观察；上方为升级后的装备最高等级，角色当前等级未计算。')
    const implicits = state.implicitLines ?? currentBase?.implicit?.split('\n') ?? []
    if (implicits.length) result.push('固有属性／技能：', ...implicits.map(line))
    result.push(state.sockets === undefined ? '孔位：未核对' : `孔位：${state.sockets.length}`)
    state.sockets?.forEach((id, index) => {
      const augment = catalog.augments?.find((entry) => entry.id === id)
      result.push(`孔 ${index + 1}：${id === null ? '空孔' : name(augment?.name ?? id)}`)
    })
    const limits = socketLimitWarnings(catalog, state)
    if (limits.length > 0) {
      result.push(
        '其他装备与角色孔尚未核对，本件未超限不代表角色可穿戴；以下条件效果不推算角色防卫或药剂回复。',
      )
      for (const entry of limits)
        result.push(
          name(entry.name) +
            '：本件 ' +
            entry.count +
            '/限量 ' +
            entry.limit +
            (entry.exceeded ? '；本件已超限，可替换重复孔位修复。' : '。'),
        )
      for (const effect of socketEffects(catalog, state))
        if (isConditionalArmourRune(effect.augment)) result.push(...effect.augment.lines.map(line))
    }
    state.affixes.forEach((affix, index) => {
      const mod = modById.get(affix.modId)
      const flags = [
        affix.fractured ? '破裂' : '',
        affix.crafted ? '工艺' : '',
        affix.desecrated ? '亵渎' : '',
      ].filter(Boolean)
      result.push(
        `${mod?.kind === 'prefix' ? '前缀' : '后缀'} ${index + 1}：${name(mod?.name ?? affix.modId)}${flags.length ? `（${flags.join('、')}）` : ''}`,
        ...affix.lines.map(line),
      )
    })
    if (!state.affixes.length) result.push('无显式词缀')
    const pending = state.pendingDesecration
    if (pending?.putrefaction)
      result.push(
        `腐烂预兆剩余隐藏槽位：前缀 ${pending.putrefaction.prefix}，后缀 ${pending.putrefaction.suffix}；装备尚未完成揭示。`,
      )
    if (pending) {
      result.push(
        `待揭示亵渎${pending.kind === 'prefix' ? '前缀' : '后缀'}：${name(BONE_RULES[pending.boneId].name)}`,
      )
      for (const omen of boneOmenLabels(pending, catalog, translations))
        result.push(`施加预兆：${omen.label}`)
      if (pending.revealOmen)
        result.push(`揭示预兆：${boneRevealOmenLabel(pending.revealOmen, catalog, translations)}`)
      for (const [label, ids] of [
        ['首组候选', pending.options],
        ['第二组候选', pending.rerollOptions],
      ] as const) {
        if (ids)
          result.push(
            `${label}：`,
            ...ids.flatMap((id, index) => [
              `候选 ${index + 1}：${name(modById.get(id)?.name ?? id)}`,
              ...(modById.get(id)?.lines ?? []).map(line),
            ]),
          )
      }
      if (!pending.options) result.push('候选尚未固定')
    }
    if (state.corruption) result.push('腐化强化：', ...state.corruption.lines.map(line))
    if (state.secondCorruption)
      result.push('第二次腐化强化：', ...state.secondCorruption.lines.map(line))
    return result
  }
  const costLines = (costs: CraftMaterialCost[], includeBase: boolean): CraftResult<string[]> => {
    if (!pricing) return { ok: true, value: ['尚未设置报价；费用未知。'] }
    const quote = quoteCraftCosts(costs, pricing, includeBase)
    if (!quote.ok) return quote
    const unit = CRAFT_PRICE_UNITS[pricing.unit]
    return {
      ok: true,
      value: [
        `已知小计：${quote.value.knownSubtotal} ${unit}`,
        `总费用：${quote.value.total === null ? '未知' : `${quote.value.total} ${unit}`}`,
        ...(quote.value.missingBase ? ['起点成本：未填写'] : []),
        ...(quote.value.missing.length
          ? [
              `缺价：${quote.value.missing
                .map((id) => {
                  const material = costs.find((cost) => cost.id === id)
                  return material ? materialName(material) : id
                })
                .join('、')}`,
            ]
          : []),
      ],
    }
  }
  const selected = operations.slice(0, cursor)
  const totalCosts = collectCraftCosts(catalog, selected)
  if (!totalCosts.ok) return totalCosts
  const totalQuote = costLines(totalCosts.value, true)
  if (!totalQuote.ok) return totalQuote
  const future = input.includeFuture ? operations.slice(cursor) : []
  const futureSummary: string[] = []
  if (future.length) {
    const futureCosts = collectCraftCosts(catalog, future)
    if (!futureCosts.ok) return futureCosts
    const futureQuote = costLines(futureCosts.value, false)
    if (!futureQuote.ok) return futureQuote
    futureSummary.push(
      '',
      '后续计划材料：',
      ...(futureCosts.value.length
        ? futureCosts.value.map((cost) => `${materialName(cost)} × ${cost.count}`)
        : ['后续计划无新增材料']),
      '后续新增费用（不含起点与已应用步骤）：',
      ...futureQuote.value,
      '计划步骤尚未执行；材料与费用不计入已消费，选定结果不是随机命中承诺。',
    )
  }
  const body = [
    'PoE2 装备制作步骤清单',
    `基底：${name(base.name)}（${base.name}）；物品等级：${initialState.itemLevel}`,
    `游戏数据版本：${catalog._meta.gameVersion ?? '未核实'}；数据快照：${catalog._meta.sourceCommit}`,
    future.length
      ? `已应用 ${cursor} 步；后续 ${future.length} 步作为未执行计划列出。未应用草稿不计入。`
      : `已应用 ${cursor} 步；可重做 ${operations.length - cursor} 步未计入。未应用草稿不计入。`,
    '以下为演练中选定的结果，不保证游戏中得到相同结果。每步核对实际装备，结果不符时回工作台重新判断后续操作。',
    '本清单用于阅读核对；继续演练请另存 .craft.json 项目，条件指引和完整历史以项目为准。',
    '属性保留基础值和范围；催化／增效后的有效值及面板请在工作台核对。',
    '',
    '已应用材料合计：',
    ...(totalCosts.value.length
      ? totalCosts.value.map((cost) => `${materialName(cost)} × ${cost.count}`)
      : ['尚未消耗材料']),
    ...(pricing?.baseCost !== undefined
      ? [`起点成本：${pricing.baseCost} ${CRAFT_PRICE_UNITS[pricing.unit]}`]
      : []),
    ...totalQuote.value,
    ...futureSummary,
    '报价由用户填写，代表这条选定路线的支出，不是市场报价或期望成本。',
    '',
    '步骤 0：起点（已有品质、词缀和镶嵌物不补计材料）',
    ...snapshot(checked.value),
  ]
  let current = checked.value
  const cumulative = new Map<string, CraftMaterialCost>()
  for (const [index, step] of [...selected, ...future].entries()) {
    const planned = index >= cursor
    const next = applyCraftStep(catalog, current, step)
    if (!next.ok) return fail(`步骤 ${index + 1} 无法回放：${next.error}`)
    const costs = collectCraftCosts(catalog, [step])
    if (!costs.ok) return costs
    for (const cost of costs.value) {
      const previous = cumulative.get(cost.id)
      cumulative.set(cost.id, { ...cost, count: cost.count + (previous?.count ?? 0) })
    }
    const quote = costLines([...cumulative.values()], true)
    if (!quote.ok) return quote
    body.push(
      '',
      `${planned ? '计划步骤' : '步骤'} ${index + 1}${planned ? '（未执行）' : ''}：${craftStepLabel(catalog, translations, step)}`,
      costs.value.length
        ? `${planned ? '本步计划材料' : '本步材料'}：${costs.value.map((cost) => `${materialName(cost)} × ${cost.count}`).join('、')}`
        : planned
          ? '本步计划无新增材料。'
          : '本步无新增材料消费。',
    )
    const selection =
      'removeModId' in step && step.removeModId
        ? { label: '选定移除结果', modId: step.removeModId, affixId: step.removeAffixId }
        : 'kind' in step && step.kind === 'fracture'
          ? { label: '选定破裂结果', modId: step.modId, affixId: step.affixId }
          : null
    if (selection) {
      const selectedAffix = resolveCraftAffix(current, {
        modId: selection.modId,
        ...(selection.affixId === undefined ? {} : { affixId: selection.affixId }),
      })
      if (!selectedAffix.ok) return selectedAffix
      body.push(
        `${selection.label}：原词缀 ${selectedAffix.value.index + 1}`,
        ...selectedAffix.value.affix.lines.map(line),
      )
    }
    if ('kind' in step && step.kind === 'masterwork') {
      const from = catalog.augments?.find((entry) => entry.id === step.fromAugmentId)
      const to = catalog.augments?.find((entry) => entry.id === step.toAugmentId)
      if (!from || !to) return fail('升级步骤缺少符文身份。')
      body.push(`孔 ${step.socketIndex + 1} 升级：${name(from.name)} → ${name(to.name)}`)
    }
    if ('kind' in step && step.kind === 'runeforge') {
      const from = catalog.bases.find((entry) => entry.id === current.baseId)
      const to = catalog.bases.find((entry) => entry.id === next.value.baseId)
      if (!from || !to) return fail('锻造步骤缺少输入或输出基底。')
      body.push(`基底转换：${name(from.name)} → ${name(to.name)}`)
    }
    if ('kind' in step && step.kind === 'socket') body.push(`操作孔位：孔 ${step.socketIndex + 1}`)
    if ('kind' in step && step.kind === 'skill-sockets')
      body.push(`操作前声明的技能辅助孔数：${step.previousSockets}`)
    if ('kind' in step && step.kind === 'perfect-flux')
      body.push(`操作前声明的装备最高等级：${step.previousMaxLevel}`)
    if ('kind' in step && step.kind === 'extraction') {
      const extraction = prepareExtractionCraft(catalog, current)
      if (!extraction.ok) return extraction
      body.push(
        ...extraction.value.returns.map(
          (entry) => `${planned ? '计划返还' : '返还'}：${name(entry.name)} × ${entry.count}`,
        ),
        '返还物不抵扣材料费用。',
      )
    }
    body.push(
      planned ? '本步计划结果：' : '本步选定结果：',
      ...snapshot(next.value),
      planned ? '执行至本步的预计累计费用（含起点）：' : '截至本步累计费用（含起点）：',
      ...quote.value,
    )
    current = next.value
  }
  return { ok: true, value: `${body.join('\n')}\n` }
}
