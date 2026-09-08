// 测试用：按 URL 提供迷你响应体（build.test 与 check.test 共用）。zhStats 可替换以模拟数据变化。
import {
  POE2DB_BASE_LISTS,
  POE2DB_GEM_LIST,
  POE2DB_TREE_PAGE_URL,
  POE2DB_UNIQUE_LIST,
  poe2dbListUrl,
  REPOE_PASSIVES_URL,
  REPOE_SKILL_GEMS_URL,
  trade2Url,
} from '../config'

export function fixtureBodies(
  read: (file: string) => string,
  zhStats: string,
): Map<string, string> {
  const bodies = new Map<string, string>([
    [trade2Url('en', 'stats'), read('trade2-stats-en.json')],
    [trade2Url('en', 'items'), read('trade2-items-en-mini.json')],
    [trade2Url('zh-CN', 'stats'), zhStats],
    [trade2Url('zh-TW', 'stats'), zhStats],
    [trade2Url('zh-CN', 'leagues'), '{"result":[{"id":"L","realm":"poe2","text":"测试联盟"}]}'],
    [trade2Url('zh-TW', 'leagues'), '{"result":[]}'],
    [
      POE2DB_TREE_PAGE_URL,
      '<script src="https://cdn.poe2db.tw/js/passive-skill-tree.abc123.js"></script>',
    ],
    ['https://cdn.poe2db.tw/js/passive-skill-tree.abc123.js', 'x({poe2version:"9.9"})'],
    [REPOE_PASSIVES_URL, read('repoe-default-mini.json')],
    [REPOE_SKILL_GEMS_URL, read('repoe-skill-gems-mini.json')],
    [
      'https://poe2db.tw/data/passive-skill-tree/9.9/data_cn.json?5',
      read('poe2db-tree-cn-mini.json'),
    ],
    [
      'https://poe2db.tw/data/passive-skill-tree/9.9/data_tw.json?5',
      read('poe2db-tree-cn-mini.json'),
    ],
  ])
  // tw 复用 cn 迷你页；31 个分类页都用同一份基底迷你页
  for (const lang of ['us', 'cn', 'tw'] as const) {
    const suffix = lang === 'us' ? 'us' : 'cn'
    bodies.set(poe2dbListUrl(lang, POE2DB_GEM_LIST), read(`poe2db-list-gem-${suffix}.html`))
    bodies.set(poe2dbListUrl(lang, POE2DB_UNIQUE_LIST), read(`poe2db-list-unique-${suffix}.html`))
    for (const slug of POE2DB_BASE_LISTS)
      bodies.set(poe2dbListUrl(lang, slug), read(`poe2db-list-base-${suffix}.html`))
  }
  return bodies
}
