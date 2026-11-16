// 弹窗当前页状态的唯一推导（第三期 A「状态置顶」；计划裁定 4–7）：输入是 watchPage 的探测结果与弹窗自己的
// 已保存设置，输出状态词、原因、做法句与可选的“刷新页面”。内容脚本只回事实，展示规则全在这里，便于表驱动测试。
// 这里只描述 CoE 中文显示；无应答不代表网页翻译或划词不可用。
import type { Settings } from '../platform'
import type { PageStateReply } from '../protocol'
import type { PageProbe, PageScope } from './page-query'

export type PageKind = 'ok' | 'part' | 'off' | 'mute' | 'reading'
export interface PageView {
  scope: PageScope
  kind: PageKind
  word: '生效中' | '部分生效' | '未生效' | '未连接' | '仅 CoE 页面生效' | '未读取到 CoE 状态' | null
  reason: string | null
  hint: string
  action: 'reload' | null
}

function reading(scope: PageScope = 'unknown'): PageView {
  return { scope, kind: 'reading', word: null, reason: null, hint: '正在读取当前页…', action: null }
}
function blocked(reason: string, hint: string, action: 'reload' | null = null): PageView {
  return { scope: 'coe', kind: 'off', word: '未生效', reason, hint, action }
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
  if (probe.status === 'none') {
    const scope = probe.scope ?? 'unknown'
    if (scope === 'coe')
      return {
        scope,
        kind: 'off',
        word: '未连接',
        reason: null,
        hint: '本页的 CoE 中文助手没有应答。可刷新页面后重试。',
        action: 'reload',
      }
    return {
      scope,
      kind: 'mute',
      word: scope === 'elsewhere' ? '仅 CoE 页面生效' : '未读取到 CoE 状态',
      reason: null,
      hint:
        scope === 'elsewhere'
          ? 'CoE 中文显示仅在 beta.craftofexile.com 的 PoE2 英文界面生效。'
          : '未能确认当前页是否为 CoE。网页翻译和划词的可用性见下方入口。',
      action: null,
    }
  }
  const { reply, settled } = probe
  if (!settled && (reply.phase === 'starting' || reply.page === 'unknown')) return reading('coe')
  // 到重查上限内容脚本仍在启动：启动挂起，刷新是唯一可做的事；极慢的词典加载也会误报于此，刷新即恢复（R-T3d）
  if (reply.phase === 'failed' || reply.phase === 'starting')
    return blocked(
      '初始化失败',
      reply.phase === 'failed' && reply.error === 'dictionary'
        ? '词典加载失败，本页保持英文。请刷新页面或检查更新。'
        : '中文助手未能启动，本页保持英文。请刷新页面或检查更新。',
      'reload',
    )
  if (!saved.enabled)
    return {
      scope: 'coe',
      kind: 'mute',
      word: '未生效',
      reason: '简体中文已关闭',
      hint: '在下方打开“启用简体中文”即可生效。',
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
    return blocked('认不出原站的游戏和语言', '未识别到原站游戏和语言，请刷新页面重试或检查更新。')
  // 空白页、刚加载的首页翻译 0 处是正常情况：不写“已翻译 0 处”
  const reason = reply.translated > 0 ? `已翻译 ${reply.translated} 处` : null
  if (reply.search === 'missing')
    return {
      scope: 'coe',
      kind: 'part',
      word: '部分生效',
      reason,
      hint: `界面已显示中文，${searchName(reply.searchMissing)}暂不支持中文搜索。请刷新页面或反馈。`,
      action: 'reload',
    }
  return {
    scope: 'coe',
    kind: 'ok',
    word: '生效中',
    reason,
    hint: '未收录的术语保持英文。转换装备文本后，仍以原站的导入结果为准。',
    action: null,
  }
}
