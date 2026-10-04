// 组件 CSS 中声明衬线字体的选择器清单（spec §7.1）：serif-shard0.test 据此收集页面上的衬线文字，
// 断言都落在 SC shard0 里。不导入任何模块（apps/site 经 exports 引用）。

/** 组件 CSS 中在 font / font-family 声明里使用 var(--pt-serif…) 的选择器；集合与 CSS 逐条一致，由 selectors.test.ts 断言（spec §7.1、§7.3） */
export const SERIF_SELECTORS: readonly string[] = [
  // M1
  '.pt-nav a',
  '.pt-titlebar__title',
  '.pt-forge-btn',
  '.pt-hero-title',
  // M2：金属页签（§5.7）、名称牌名称（§5.8；繁体切 TC 栈，§4.4）
  '.pt-tab',
  '.pt-nameplate__name',
  '.pt-nameplate__name:lang(zh-TW)',
  // M3：扩展介绍页能力小标题（spec §6.3）
  '.pt-subhead',
  // 阶段看板的阶段名（2026-10-03 方案 §3.3；繁体切 TC 栈）
  '.pt-stagehead',
  '.pt-stagehead:lang(zh-TW)',
]

/** CoE 注入面板（l1.css）里用 var(--l1-serif) 的选择器：面板标题与预览、填入、恢复按钮（扩展 0.4.0）。
 *  “第 N 行”定位按钮在清单里，不是 .body 或 .result 的直接子元素，不在内。与 SERIF_SELECTORS 分开：
 *  后者驱动网站 shard0 门禁，L1 文字由 serif-sc-l1 子集负责（coverage.test.ts）；集合与 l1.css 一致由 selectors.test.ts 断言 */
export const L1_SERIF_SELECTORS: readonly string[] = [
  '.title',
  '.body > button',
  '.result > button',
]
