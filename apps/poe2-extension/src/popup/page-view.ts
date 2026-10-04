// 弹窗当前页状态的唯一推导（第三期 A「状态置顶」；计划裁定 4–7）：输入是 watchPage 的探测结果与弹窗自己的
// 已保存设置，输出状态词、原因、做法句与可选的“刷新页面”。内容脚本只回事实，展示规则全在这里，便于表驱动测试。
// 文案与网站扩展介绍页同词：状态词只有“生效中／部分生效／未生效”，“未生效”的原因写在状态词后。
import type { Settings } from '../platform'
import type { PageStateReply } from '../protocol'
import type { PageProbe } from './page-query'

export type PageKind = 'ok' | 'part' | 'off' | 'mute' | 'reading'
export interface PageView {
  kind: PageKind
  word: '生效中' | '部分生效' | '未生效' | null
  reason: string | null
  hint: string
  action: 'reload' | null
}

function reading(): PageView {
  return { kind: 'reading', word: null, reason: null, hint: '正在读取当前页…', action: null }
}
function blocked(reason: string, hint: string, action: 'reload' | null = null): PageView {
  return { kind: 'off', word: '未生效', reason, hint, action }
}
/** 部分生效时点名没接上的搜索框（裁定 6）：含基底写“基底搜索框”，只缺词缀写“词缀搜索框”，其余写“搜索框” */
function searchName(missing: PageStateReply['searchMissing']): string {
  if (missing.includes('base')) return '基底搜索框'
  if (missing.length > 0 && missing.every((domain) => domain === 'stat')) return '词缀搜索框'
  return '搜索框'
}

/** 优先级（裁定 7）：无应答 → 读取中 → 初始化失败 → 已关闭 → PoE1 → 语言 → 认不出原站 → 部分生效 → 生效中。
 *  “已关闭”只看弹窗已保存的设置 saved，不看应答里的 enabled：保存后内容脚本稍晚才收到变化，用应答会闪旧状态 */
export function pageView(probe: PageProbe, saved: Settings): PageView {
  if (probe.status === 'reading') return reading()
  if (probe.status === 'none')
    return blocked(
      '本页没有中文助手',
      '两种可能：这不是 beta.craftofexile.com 页面（旧版 www 站不支持）；或页面在安装、更新扩展前就已打开，刷新即可。',
    )
  const { reply, settled } = probe
  if (reply.phase === 'starting' || (reply.page === 'unknown' && !settled)) return reading()
  if (reply.phase === 'failed')
    return blocked(
      '初始化失败',
      reply.error === 'dictionary'
        ? '词典没能加载，本页仍是原站英文。刷新页面通常能恢复；仍失败请检查更新。'
        : '中文助手没能启动，本页仍是原站英文。刷新页面通常能恢复；仍失败请检查更新。',
      'reload',
    )
  if (!saved.enabled)
    return {
      kind: 'mute',
      word: '未生效',
      reason: '简体中文已关闭',
      hint: '本页显示原站英文。在下方打开“启用简体中文”即可，不用刷新。',
      action: null,
    }
  if (reply.page === 'unsupported')
    return blocked('原站选的是 PoE1', '中文助手只支持 PoE2。在原站把游戏切到 PoE2。')
  if (reply.page === 'english-required')
    return blocked(
      '原站语言不是 English',
      '中文助手只在 English 界面上工作。请在原站右上角切到 English，再刷新页面。',
    )
  if (reply.page === 'unknown')
    return blocked(
      '认不出原站的游戏和语言',
      '原站页面可能还没加载完，或已经改版。刷新页面后再打开弹窗；仍不行请检查更新。',
    )
  // 空白页、刚加载的首页翻译 0 处是正常情况：不写“已翻译 0 处”
  const reason = reply.translated > 0 ? `已翻译 ${reply.translated} 处` : null
  if (reply.search === 'missing')
    return {
      kind: 'part',
      word: '部分生效',
      reason,
      hint: `界面已翻译，但${searchName(reply.searchMissing)}没接上，暂时不能用中文搜索。先刷新页面；仍不行请反馈。`,
      action: 'reload',
    }
  return {
    kind: 'ok',
    word: '生效中',
    reason,
    hint: '未收录的术语保持英文。转换装备文本后，仍以原站的导入结果为准。',
    action: null,
  }
}
