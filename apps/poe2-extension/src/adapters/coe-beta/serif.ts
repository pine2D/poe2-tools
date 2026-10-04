// 原站用游戏风衬线 Fontin 的位置（2026-10-04 从 package.css 全量枚举，见 mockups/phase3/serif/selectors.md 的 A/B/C 类）：
// 内容脚本 serif.ts 给这些元素的 font-family 在 Fontin 之后接上中文衬线 L1 子集。
// 只收原站 Fontin 位置：背包页签名（用户自定义）、键帽、物品卡与词缀、数字表格不收（计划裁定 18）。
// 原站改版后漏匹配只会回落无衬线；误匹配到 Montserrat 位置会把英文改成 Fontin，验收时逐个核对原 computed font-family。

/** 8 处位置、9 条选择器：版本标签的 .details 自己写了 font-family: Fontin，不继承父元素，单列一条 */
export const HOST_SERIF_SELECTORS: readonly string[] = [
  '#mainMenu > a',
  'button.game',
  '.item button.small',
  '#homeFeatures h1',
  '#homeFeatures div.feature div.header',
  '#homeFeatures div.feature label div.title',
  '#changePatchZone label',
  '#settingsZone > div.settings div.setting .currentPatchLabel',
  '#settingsZone > div.settings div.setting .currentPatchLabel .details',
]

/** 原站这些规则在 Fontin 之后的后备栈：package.css 只写 `font-family: Fontin`，没有后备（2026-10-04 真站实测）。
 *  空字符串表示不追加：汉字以外的缺字与改动前一样交给浏览器的系统回退 */
export const HOST_SERIF_FALLBACK = ''
