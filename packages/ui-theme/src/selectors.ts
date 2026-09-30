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
]
