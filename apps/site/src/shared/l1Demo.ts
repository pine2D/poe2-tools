// 搜索候选示意（l1demo__ 类）的示例数据：首页对照带右段与扩展介绍页“确认生效”共用，两页不各写一份。
// 自造的输入“水晶”与它的候选；中英名称逐字取自正式词典 data/dict/zh-CN/items.json 的 bases（l1Demo.test.ts 核对）。
// 第一项是示意里的选中项。
export const L1_DEMO_QUERY = '水晶'

export const L1_DEMO_CANDIDATES = [
  ['水晶法器', 'Crystal Focus'],
  ['符文水晶法器', 'Runeforged Crystal Focus'],
  ['符文师匠水晶法器', 'Runemastered Crystal Focus'],
] as const satisfies readonly (readonly [zh: string, en: string])[]
