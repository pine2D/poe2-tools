import { statHeaderSelector, statSelector } from './stats'
import { isUserContent } from './user-content'

export const regions = 'header, footer, main, dialog, [role="tooltip"], #mainMenu, #settingsZone'
export const excluded =
  'script, style, #inventoryZone .tabs, input, textarea, select, option, code, pre, [contenteditable], [data-poe2-l10n], [hidden], .hidden, [id*="_ad"]'
export function translatable(node: Text): boolean {
  const parent = node.parentElement
  return (
    !!parent?.closest(regions) &&
    !parent.closest(excluded) &&
    (!parent.closest(statSelector) || !!parent.closest(statHeaderSelector)) &&
    !isUserContent(parent)
  )
}

// 来自新版公开 DOM；说明连词和介绍片段只在各自区域使用。
export function textContext(
  node: Text,
): 'instructions' | 'introduction' | 'calculation' | 'tag' | 'importer' | 'default' {
  if (node.parentElement?.closest('#simulatorImporterZone')) return 'importer'
  if (node.parentElement?.closest('.tag')) return 'tag'
  if (node.parentElement?.closest('#calculationsZone')) return 'calculation'
  if (node.parentElement?.closest('#instructions')) return 'instructions'
  if (
    node.ownerDocument.location.pathname === '/whats-new' &&
    node.parentElement?.closest('main .messageBox')
  )
    return 'introduction'
  return 'default'
}
const importer = new Map([
  [
    'This appears to be a single simulation export, this function requires an',
    '这是单个流程的导出数据；此入口需要使用',
  ],
  ['dataset.', '生成的数据。'],
  ['To import a singular simulation please go to', '导入单个流程，请进入'],
  ['and then', '，然后选择'],
  ['.', '。'],
])
const introduction = new Map([
  ['is a complete refactor of', '是对'],
  [
    'aiming to fix the lingering issues of the old site as well as adding every possible crafting methods that were missing.',
    '的全面重构，旨在解决旧站长期存在的问题，并尽可能补齐此前缺少的制作方式。',
  ],
  ['The following is a shortlist of what is', '以下简要介绍'],
  ['new', '新增功能'],
  ['. Please consult the', '。如需了解我正在开发的内容，请查看'],
  ['page to see what I am working on.', '页面。'],
])
// 人工 UI 译名，限定原站标签；Caster 的“施法”尚未以国服独立标签真机核对。
const tags = new Map([
  ['Armour', '护甲'],
  ['Attribute', '属性'],
  ['Caster', '施法'],
  ['Chaos', '混沌'],
  ['Cold', '冰霜'],
  ['Critical', '暴击'],
  ['Curse', '诅咒'],
  ['Damage', '伤害'],
  ['Elemental', '元素'],
  ['Energy Shield', '能量护盾'],
  ['Evasion', '闪避'],
  ['Fire', '火焰'],
  ['Gem', '宝石'],
  ['Life', '生命'],
  ['Lightning', '闪电'],
  ['Mana', '魔力'],
  ['Minion', '召唤生物'],
  ['Physical', '物理'],
  ['Resistance', '抗性'],
  ['Speed', '速度'],
])
function tagText(text: string): string | null {
  const negative = text.startsWith('Non-')
  const translated = tags.get(negative ? text.slice(4) : text)
  return translated ? `${negative ? '非' : ''}${translated}` : null
}
function calculationText(text: string): string | null {
  if (text === 'Executed in') return '耗时'
  if (text === 'seconds') return '秒'
  if (text === 'Confidence :') return '累计成功率：'
  const tries = /^1 out of (\d+(?:,\d{3})*(?:\.\d+)?) tries$/.exec(text)
  if (tries) return `平均约每 ${tries[1]} 次成功 1 次`
  const progress = /^(\d+(?:,\d{3})*) of (\d+(?:,\d{3})*)$/.exec(text)
  return progress ? `${progress[1]} / ${progress[2]}` : null
}
export function contextualText(
  original: string,
  context: ReturnType<typeof textContext>,
): string | null {
  const normalized = original.trim().replace(/\s+/g, ' ')
  const word = normalized.toLowerCase()
  const translated =
    context === 'importer'
      ? (importer.get(normalized) ?? null)
      : context === 'tag'
        ? tagText(normalized)
        : context === 'calculation'
          ? calculationText(normalized)
          : context === 'introduction'
            ? (introduction.get(normalized) ?? null)
            : context === 'instructions'
              ? word === 'and'
                ? '与'
                : word === 'or'
                  ? '或'
                  : null
              : null
  return translated === null ? null : original.replace(/\S[\s\S]*\S|\S/, translated)
}
