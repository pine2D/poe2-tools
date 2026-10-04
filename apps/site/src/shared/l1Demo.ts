// 搜索候选示意（l1demo__ 类）的示例数据：首页对照带右段与扩展介绍页“确认生效”共用，两页不各写一份。
// 自造的输入“水晶”与它的候选；中英名称逐字取自正式词典 data/dict/zh-CN/items.json 的 bases（l1Demo.test.ts 核对）。
// 第一项是示意里的选中项。
export const L1_DEMO_QUERY = '水晶'

export const L1_DEMO_CANDIDATES = [
  ['水晶法器', 'Crystal Focus'],
  ['符文水晶法器', 'Runeforged Crystal Focus'],
  ['符文师匠水晶法器', 'Runemastered Crystal Focus'],
] as const satisfies readonly (readonly [zh: string, en: string])[]

// 示意里搜索框上方的标签：扩展生效时原站标签 “Search for a craftable item” 显示的译名，
// 逐字取自 data/l10n/coe-beta/ui.zh-CN.json（l1Demo.test.ts 核对）；真站把标签浮在框内左上角，示意仍画在框上方
export const L1_DEMO_LABEL = '搜索可制作的物品'
