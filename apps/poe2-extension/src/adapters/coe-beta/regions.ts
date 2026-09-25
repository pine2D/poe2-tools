import { settingsText } from './settings-text'
import { simulatorHelpText } from './simulator-help'
import { statHeaderSelector, statSelector } from './stats'
import { isUserContent } from './user-content'

const notificationRegions = '#snackbarsLeft .snackbar, #snackbarsRight .snackbar'
export const regions = `header, footer, main, dialog, [role="tooltip"], #mainMenu, #settingsZone, ${notificationRegions}`
export const excluded =
  'script, style, #inventoryZone .tabs, input, textarea, select, option, code, pre, [contenteditable], [data-poe2-l10n], [hidden], .hidden, [id*="_ad"]'
export function translatable(node: Text): boolean {
  const parent = node.parentElement
  return (
    !!parent?.closest(regions) &&
    !parent.closest(excluded) &&
    (!parent.closest(statSelector) || !!parent.closest(statHeaderSelector)) &&
    !isUserContent(parent) &&
    !(
      node.ownerDocument.location.pathname === '/compare' &&
      parent.closest('.changeTable > .row > .path, .changeTable > .row > .details')
    )
  )
}

// 来自新版公开 DOM；说明连词和介绍片段只在各自区域使用。
export function textContext(
  node: Text,
):
  | 'notification'
  | 'inventory-usage'
  | 'compare'
  | 'simulator-help'
  | 'simulator-help-link'
  | 'data-category'
  | 'settings'
  | 'instructions'
  | 'introduction'
  | 'calculation'
  | 'tag'
  | 'importer'
  | 'property'
  | 'filter'
  | 'home'
  | 'default' {
  if (node.parentElement?.closest(notificationRegions)) return 'notification'
  if (node.parentElement?.closest('#inventoryZone .usage .details')) return 'inventory-usage'
  if (
    node.ownerDocument.location.pathname === '/compare' &&
    node.parentElement?.closest(
      'main #ui, main #output > .messageBox, main #changeTypeSelector, main .changeTable > .header, main .changeTable > .row > .type',
    )
  )
    return 'compare'
  if (
    node.ownerDocument.location.pathname === '/simulator-usage' &&
    node.parentElement?.closest('main #output')
  )
    return 'simulator-help'
  if (node.parentElement?.closest('#simulatorStartingItemOutput > .messageBox'))
    return 'simulator-help-link'
  if (
    node.parentElement?.closest('#settingsZone') ||
    (node.ownerDocument.location.pathname === '/settings' && node.parentElement?.closest('main'))
  )
    return 'settings'
  if (
    node.parentElement?.closest(
      '#itemCategorySelector li, #itemClassSelector li, #categoriesSelector li, #classSelector li',
    )
  )
    return 'data-category'
  if (node.parentElement?.closest('#homeFeatures')) return 'home'
  if (node.parentElement?.closest('.filterFeedback')) return 'filter'
  if (node.parentElement?.closest('.item .property')) return 'property'
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
// 原站实际通知短句；未知通知不走通用词典，避免翻译用户名称或错误详情。
const notifications = new Map([
  ['Clipboard action', '剪贴板操作'],
  ['Inventory to clipboard!', '背包已复制到剪贴板！'],
  ['Inventory Import', '背包导入'],
  ['Data imported succesfully!', '数据导入成功！'],
])
// 新版版本对比公开控件；Base指基础数据集，不能沿用装备“基底”。
const compare = new Map([
  [
    'No changes detected between the two patches for this comparison vector.',
    '这两个版本在当前对比项目下没有检测到差异。',
  ],
  ['Source', '来源版本'],
  ['Target', '目标版本'],
  ['Select a patch', '选择版本'],
  ['Data set', '数据集'],
  ['Base', '基础'],
  ['Extended', '扩展'],
  ['Data type', '数据类型'],
  ['Modifiers', '词缀'],
  ['Items', '物品'],
  ['Families', '词缀族'],
  ['Tags', '标签'],
  ['Classes', '物品类别'],
  ['Categories', '分类'],
  ['Stats', '属性定义'],
  ['Loading required files', '正在加载所需文件'],
  ['Processing comparison', '正在对比'],
  ['Change type', '变更类型'],
  ['All', '全部'],
  ['Added', '新增'],
  ['Changed', '修改'],
  ['Removed', '移除'],
  ['Type', '类型'],
  ['Path', '路径'],
  ['Details', '详情'],
])
// 流程侧栏帮助入口，短链接文字不用于其他页面。
const simulatorHelpLink = new Map([
  ['Need help using the simulator?', '需要了解流程模拟的用法？'],
  ['Click here', '查看使用说明'],
  ['.', '。'],
])
// 新版首页公开功能文案，限定容器，保留原站图片与交互节点。
const home = new Map([
  ['Emulate directly in the crafting interface', '直接在制作界面演练'],
  [
    'Apply the selected crafting method by hovering over the item and clicking on it.',
    '将鼠标移到物品上并点击，即可应用当前选中的制作方式。',
  ],
  ['Build complex calculator requirements', '设置复杂的计算条件'],
  [
    'Set up requirement groups with partial or complete matching, query for open affixes and more.',
    '设置部分或全部满足的条件组，查询空余词缀位等。',
  ],
  ['Simulate entire crafting processes for a project', '模拟项目的完整制作流程'],
  [
    'Create crafting steps and use routing and conditions to simulate a crafting strategy.',
    '创建制作步骤，结合步骤连线和条件模拟制作策略。',
  ],
  ['Save items to inventory', '将物品保存到背包'],
  [
    'Store items for future reference, create and manage storage tabs and more.',
    '保存物品以备日后查看，创建和管理仓库页等。',
  ],
  ['Customizability', '可自定义'],
  ['Expansive user settings', '丰富的用户设置'],
  [
    'Tailor the UI to your liking, set up custom pricing and toggle user options.',
    '按喜好调整界面、自定义价格，以及启用或关闭各项设置。',
  ],
  ['And much more...', '还有更多功能……'],
  ['Expanded data viewability', '更全面的数据查看'],
  [
    'Browse compiled data, compare patches, view items and modifier details and more.',
    '浏览整理后的数据、对比版本、查看物品与词缀详情等。',
  ],
])
// 操作提示按原站文本节点顺序拼接，键鼠图标保持原样。
const instructions = new Map([
  ['hover', '悬停'],
  ['over an item and', '在物品上并点击'],
  ['to', '即可'],
  ['apply', '应用'],
  ['the currently selected crafting method to it.', '当前选中的制作方式。'],
  ['hold', '按住'],
  ['to toggle between', '可切换'],
  ['advanced', '高级'],
  ['and', '与'],
  ['classic', '经典'],
  ['modifier descriptions for items.', '物品词缀说明。'],
  ['to force', '可固定显示'],
  ['tooltips', '提示框'],
  ['to stay visible and enable the ability to drill-down.', '并允许查看更深层的详情。'],
  ['hit', '按下'],
  ['revert', '撤销'],
  ['emulator actions.', '制作演练操作。'],
  ['left', '在词缀池中左键点击'],
  ['add', '添加'],
  ['or', '或'],
  ['remove', '移除'],
  ['modifiers from the modpool to the current item.', '当前物品的词缀。'],
  ['right', '右键点击'],
  ['to access the context menu', '可打开元素的右键菜单'],
  ['options', '选项'],
  ['for elements.', '。'],
])
const filters = new Map([
  ['Searching', '搜索词'],
  ['Clear all', '清空全部筛选'],
])
const properties = new Map([
  ['Physical', '物理'],
  ['Damage', '伤害'],
  ['Critical Hit', '暴击'],
  ['Chance:', '几率：'],
  ['Attacks per Second:', '每秒攻击次数：'],
  ['to', '至'],
  ['Tablet', '石板'],
  ['Focus', '法器'],
  ['Energy Shield', '能量护盾'],
  ['Runic Ward', '符文结界'],
  [', Int', '，智慧'],
])
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
function inventoryUsageText(text: string): string | null {
  if (text === 'quota') return '容量限额'
  const usage = /^\(([\d,.]+ (?:B|KB|MB|GB)) used of ([\d,.]+ (?:B|KB|MB|GB))$/.exec(text)
  return usage ? `(已用 ${usage[1]} / ${usage[2]}` : null
}
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
// 国服译名沿用已登记的交易词缀与材料名称；只补数据页可见分类，不翻译内部标签代码。
const dataCategories = new Map([
  ['Omen', '预兆'],
  ['Skill Gem', '技能宝石'],
  ['Skill Gems', '技能宝石'],
  ['Support Gem', '辅助宝石'],
  ['Support Gems', '辅助宝石'],
  ['Waystone', '引路石'],
  ['Waystones', '引路石'],
  ['Tablet', '石板'],
  ['Tablets', '石板'],
])
export function contextualText(
  original: string,
  context: ReturnType<typeof textContext>,
): string | null {
  const normalized = original.trim().replace(/\s+/g, ' ')
  if (context === 'notification') {
    const translated = notifications.get(normalized)
    return translated ? original.replace(/\S[\s\S]*\S|\S/, translated) : original
  }
  const word = normalized.toLowerCase()
  const translated =
    context === 'inventory-usage'
      ? inventoryUsageText(normalized)
      : context === 'compare'
        ? (compare.get(normalized) ?? null)
        : context === 'simulator-help'
          ? (simulatorHelpText.get(normalized) ?? null)
          : context === 'simulator-help-link'
            ? (simulatorHelpLink.get(normalized) ?? null)
            : context === 'data-category'
              ? (dataCategories.get(normalized) ?? null)
              : context === 'settings'
                ? (settingsText.get(normalized) ?? null)
                : context === 'home'
                  ? (home.get(normalized) ?? null)
                  : context === 'filter'
                    ? (filters.get(normalized) ?? null)
                    : context === 'property'
                      ? (properties.get(normalized) ?? null)
                      : context === 'importer'
                        ? (importer.get(normalized) ?? null)
                        : context === 'tag'
                          ? tagText(normalized)
                          : context === 'calculation'
                            ? calculationText(normalized)
                            : context === 'introduction'
                              ? (introduction.get(normalized) ?? null)
                              : context === 'instructions'
                                ? (instructions.get(word) ?? null)
                                : null
  return translated === null ? null : original.replace(/\S[\s\S]*\S|\S/, translated)
}
