import {
  type GuideDocument,
  type Issue,
  type PreparedBlock,
  translatedTerms,
} from '@poe2-tools/guide-core'
import type { PageResult } from '../extract/inline'
import type { ReadingMode } from '../extract/session'
import { disclosure, icon, labelIcon } from '../ui/icons'
import { annotate } from './annotate'
import type { ReadScope } from './controller'
import { el } from './dom'
import { type ChapterPicker, chapterPicker, scopeChapters } from './scope-view'
import { blockLayout } from './structure-view'
import { TERM_STYLE, translatedText } from './translated-text'

export type BlockState = 'idle' | 'pending' | 'failed' | 'missing' | 'skipped'
export type Origin = 'engine' | 'cache' | 'dictionary'
export type StageState = 'idle' | 'translating' | 'done'

export interface ReadingHandlers {
  onStage(stageId: string): void
  onRetryBlock(id: string): void
  onStop(): void
  onReload(): void
  onSettings(): void
  onScope(scope: ReadScope): void
  onSelection(ids: string[]): void
  onBegin(): void
  onMode(mode: ReadingMode): void
  onLocate(id: string): void
  onRestore(): void
  onIntroSeen(): void
}

export interface ReadingProgress {
  selected: number
  completed: number
  failed: number
  preserved: number
  characters: number
}

/** 开始翻译前的发送摘要；数值来自 controller 按当前选择算出的待发送段落。 */
export interface SendSummary {
  blocks: number
  chars: number
  host: string
  preserved: number
}

export interface ReadingView {
  root: HTMLElement
  showIntro(show: boolean): void
  /** 设置往返后恢复同一篇文章中的阅读锚点；重新排版时按段落位置恢复。 */
  rememberPosition(): () => void
  showDocument(
    doc: GuideDocument,
    blocks: readonly PreparedBlock[],
    stageId: string | null,
    selectedIds?: readonly string[],
  ): void
  /** 读取失败时清空旧文档（标题、站点行、阶段条与段落） */
  clearDocument(): void
  showStage(stageId: string): void
  setTranslation(blockId: string, text: string, origin: Origin, issues: readonly Issue[]): void
  setBlockState(blockId: string, state: BlockState, message?: string): void
  setStageState(stageId: string, state: StageState): void
  setBanner(kind: 'none' | 'setup' | 'error' | 'info', message: string): void
  /** signal 中止或被新的确认框取代时按“取消”（false）结束 */
  ask(message: string, okLabel: string, signal?: AbortSignal): Promise<boolean>
  setUsage(text: string): void
  /** null 表示当前没有要发送的段落或尚未配置服务 */
  setSendSummary?(summary: SendSummary | null): void
  setBusy(busy: boolean): void
  setReady(ready: boolean): void
  setProgress(progress: ReadingProgress): void
  setPageState(id: string, result: PageResult): void
}

const ORIGIN: Record<Origin, string> = {
  engine: '机器译文',
  cache: '机器译文（缓存）',
  dictionary: '词典译文',
}
const STATE: Record<BlockState, string> = {
  idle: '',
  pending: '翻译中…',
  failed: '翻译失败',
  missing: '模型没有返回这一段',
  skipped: '原样保留',
}
// 图例只列会着色的类型；关键词、行话与职业只保留下划线。
const LEGEND = [
  ['gem', '宝石'],
  ['unique', '传奇'],
  ['base', '基底'],
  ['passive', '天赋·升华'],
  ['stat', '词缀'],
] as const
const COLORED: ReadonlySet<string> = new Set([
  'gem',
  'unique',
  'base',
  'passive',
  'ascendancy',
  'stat',
])
const STAGE: Record<StageState, string> = { idle: '未翻译', translating: '翻译中', done: '已翻译' }
const UPDATE_URL = 'https://poe2-tools.pine2d.com/extension/'

// Mobalytics 站内跳转后内嵌数据仍是上一个构筑，回退通用读取是预期情况，刷新即可恢复
const fallbackNote = (siteId: GuideDocument['source']['siteId']) =>
  siteId === 'mobalytics'
    ? '页面数据与地址不一致（站内跳转后常见），已改用通用读取；刷新页面可恢复完整阶段'
    : '站点可能改版，可检查扩展更新'

export function createReadingView(doc: Document, h: ReadingHandlers, version: string): ReadingView {
  const title = el(doc, 'p', { class: 'guide-title' })
  const site = el(doc, 'p', { class: 'guide-site' })
  const btn = (label: string, on: () => void) => {
    const b = el(doc, 'button', { class: 'pt-btn pt-btn--quiet', type: 'button' }, label)
    b.addEventListener('click', on)
    return b
  }
  // 展开内容留在文档流；Escape 收回并把焦点还给入口。
  const panelControl = (label: string, panel: HTMLElement, className: string) => {
    const setOpen = (open: boolean) => {
      panel.hidden = !open
      button.setAttribute('aria-expanded', String(open))
    }
    const button = btn(label, () => setOpen(Boolean(panel.hidden)))
    button.classList.add(className)
    button.setAttribute('aria-controls', panel.id)
    setOpen(false)
    panel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      button.focus({ preventScroll: true })
    })
    return { button, setOpen }
  }
  const scopeText = el(doc, 'p', { class: 'guide-scope' })
  const scopeChoice = el(doc, 'div', {
    class: 'scope-choices',
    role: 'group',
    'aria-label': '读取范围',
  })
  for (const [value, text] of [
    ['full', '整页正文'],
    ['selection', '选中文字'],
    ['region', '点选区域'],
  ] as const) {
    const button = btn(text, () => {
      // 先同步选中态：读取失败时界面与“重新读取”沿用的范围一致。
      for (const b of scopeChoice.querySelectorAll('button'))
        b.setAttribute('aria-pressed', String(b.dataset.scope === value))
      h.onScope(value)
    })
    button.dataset.scope = value
    scopeChoice.append(button)
  }
  let mode: ReadingMode = 'inline'
  let lastProgress: ReadingProgress | null = null
  const modeChoice = el(doc, 'div', {
    class: 'reading-mode',
    role: 'group',
    'aria-label': '阅读位置',
  })
  for (const [value, label] of [
    ['inline', '原文旁对照'],
    ['sidebar', '仅侧栏'],
  ] as const) {
    const button = btn(label, () => {
      mode = value
      for (const b of modeChoice.querySelectorAll('button'))
        b.setAttribute('aria-pressed', String(b.dataset.mode === value))
      for (const item of items.values()) {
        item.setToolsOpen(value === 'inline')
        syncDetails(item)
      }
      mountBlocks()
      refreshSummary()
      h.onMode(mode)
    })
    button.dataset.mode = value
    button.setAttribute('aria-pressed', String(value === mode))
    modeChoice.append(button)
  }
  const begin = btn('开始翻译', () => h.onBegin())
  begin.classList.add('guide-begin')
  begin.classList.remove('pt-btn--quiet')
  let ready = false,
    busy = false,
    awaitingConfirmation = false,
    sendSummary: SendSummary | null = null
  const summary = el(doc, 'p', { class: 'guide-send-summary', hidden: true })
  const updateBegin = () => {
    const left = lastProgress
      ? lastProgress.selected - lastProgress.completed - lastProgress.preserved
      : null
    begin.disabled = !ready || busy || left === 0
    // 禁用时按钮文字写原因：恢复原文、页面变化或读取失败后需要先重新读取。
    begin.textContent = awaitingConfirmation
      ? '等待确认…'
      : busy
        ? '正在翻译…'
        : lastProgress?.selected === 0
          ? '先选择章节'
          : left === 0
            ? '翻译完成'
            : !ready
              ? '先重新读取'
              : lastProgress?.failed && left === lastProgress.failed
                ? `重试失败段（${left}）`
                : lastProgress?.completed
                  ? `继续翻译（${left}）`
                  : '开始翻译'
    summary.hidden = !sendSummary || begin.disabled || begin.hidden
    if (sendSummary)
      summary.textContent = `点击后发送 ${sendSummary.blocks} 段到 ${sendSummary.host}，正文和原文语境约 ${sendSummary.chars} 字符。${sendSummary.preserved ? `另有 ${sendSummary.preserved} 段原样保留，不发送。` : ''}`
  }
  updateBegin()
  const progress = el(doc, 'p', { class: 'guide-progress', role: 'status' })
  const chapters = el(doc, 'div', { class: 'guide-scope-options' })
  const stop = btn('停止', () => h.onStop())
  stop.hidden = true
  const usage = el(doc, 'p', { class: 'guide-usage' })
  const options = el(
    doc,
    'section',
    { class: 'guide-options', id: 'guide-scope', 'aria-label': '翻译范围' },
    el(doc, 'div', { class: 'scope-content' }, scopeChoice, scopeText, chapters),
  )
  const scopeControl = panelControl('翻译范围', options, 'guide-scope-toggle')
  scopeControl.button.append(icon(doc, 'chevronDown'))
  const reload = btn('重新读取', () => h.onReload())
  labelIcon(reload, 'reload', '重新读取当前页')
  const settings = btn('设置', () => h.onSettings())
  labelIcon(settings, 'settings', '设置翻译服务')
  const restore = btn('恢复原文', () => h.onRestore())
  restore.classList.add('guide-restore')
  const progressMeter = el(doc, 'progress', {
    class: 'guide-meter',
    max: '100',
    value: '0',
    'aria-label': '翻译进度',
  })
  // 侧栏译文出现着色术语后才显示；颜色只区分术语类别，不表示译文准确。
  const termLegend = el(
    doc,
    'p',
    { class: 'guide-term-legend', hidden: true },
    el(doc, 'span', { class: 'guide-term-legend-label' }, '颜色只表示术语类别：'),
    ...LEGEND.map(([kind, label]) => el(doc, 'span', { 'data-kind': kind }, label)),
  )
  const header = el(
    doc,
    'header',
    { class: 'guide-header' },
    el(doc, 'div', { class: 'guide-taskbar' }, begin, stop, reload, settings),
    summary,
    el(doc, 'div', { class: 'guide-progress-row' }, progress, progressMeter),
    termLegend,
  )
  const documentHeader = el(doc, 'div', { class: 'guide-document-header' }, title, site)
  const usageDetails = el(
    doc,
    'details',
    { class: 'guide-usage-details' },
    disclosure(doc, '用量详情'),
    usage,
  )

  const introOk = btn('知道了', () => {
    intro.hidden = true
    h.onIntroSeen()
    const next = !begin.hidden && !begin.disabled ? begin : settings
    next.focus()
  })
  const intro = el(
    doc,
    'section',
    { class: 'guide-intro', hidden: true },
    el(doc, 'p', {}, '点“开始翻译”后才发送所选正文。'),
    el(
      doc,
      'div',
      { class: 'intro-actions' },
      el(
        doc,
        'details',
        {},
        disclosure(doc, '发送与存储说明'),
        el(
          doc,
          'p',
          {},
          '先预览范围，再开始翻译；只有点击开始翻译或单段重试后，所选正文、本段术语和选定范围内的少量原文语境才会发给你选择的服务商。',
        ),
        el(
          doc,
          'p',
          {},
          '扩展不内置任何 Key。Key 与译文缓存只存在本机扩展存储里，未加密，网页读不到；可在“设置”里清除。译文默认显示在原文旁，可切到侧栏阅读，也可随时恢复原文。',
        ),
      ),
      introOk,
    ),
  )
  const bannerText = el(doc, 'span')
  const bannerAction = btn('配置翻译服务', () => h.onSettings())
  const banner = el(
    doc,
    'div',
    { class: 'guide-banner', role: 'status', hidden: true },
    bannerText,
    bannerAction,
  )
  const askBox = el(doc, 'div', { class: 'guide-ask', role: 'alertdialog', hidden: true })
  let pendingAsk: ((value: boolean) => void) | null = null
  const stagesBar = el(doc, 'nav', {
    class: 'guide-stages',
    'aria-label': '构筑阶段',
    hidden: true,
  })
  const list = el(doc, 'div', { class: 'guide-blocks' })
  const directory = el(doc, 'nav', {
    class: 'guide-directory',
    id: 'guide-directory',
    'aria-label': '正文目录',
  })
  const directoryItems = el(doc, 'div', { class: 'guide-directory-items' })
  directory.append(directoryItems)
  const directoryControl = panelControl('目录', directory, 'guide-directory-toggle')
  directoryControl.button.append(icon(doc, 'chevronDown'))
  scopeControl.button.addEventListener('click', () => {
    if (!options.hidden) directoryControl.setOpen(false)
  })
  directoryControl.button.addEventListener('click', () => {
    if (!directory.hidden) scopeControl.setOpen(false)
  })
  const controls = el(
    doc,
    'div',
    { class: 'guide-controls' },
    el(
      doc,
      'div',
      { class: 'guide-controlbar' },
      modeChoice,
      scopeControl.button,
      directoryControl.button,
    ),
    options,
    directory,
  )
  const placement = el(doc, 'p', { class: 'guide-placement' })
  const exceptions = el(doc, 'details', { class: 'guide-exceptions' })
  const exceptionSummary = disclosure(doc, '异常与保留 0')
  const exceptionItems = el(doc, 'div', { class: 'guide-exception-items' })
  exceptions.append(exceptionSummary, exceptionItems)
  const currentLabel = el(doc, 'h2', { class: 'guide-current-title' }, '当前段')
  const previous = btn('上一段', () => move(-1))
  const next = btn('下一段', () => move(1))
  labelIcon(previous, 'previous', '上一段')
  labelIcon(next, 'next', '下一段')
  const currentBar = el(
    doc,
    'div',
    { class: 'guide-current-bar' },
    currentLabel,
    el(doc, 'div', { class: 'guide-actions' }, previous, next),
  )
  const link = el(
    doc,
    'a',
    { href: UPDATE_URL, target: '_blank', rel: 'noopener noreferrer' },
    '检查更新',
  )
  const footer = el(
    doc,
    'footer',
    { class: 'guide-footer' },
    el(doc, 'span', {}, `版本 ${version} · `, link),
  )
  const root = el(
    doc,
    'main',
    { class: 'guide' },
    el(doc, 'style', {}, TERM_STYLE),
    documentHeader,
    banner,
    header,
    controls,
    intro,
    askBox,
    stagesBar,
    el(doc, 'div', { class: 'guide-reading-status' }, placement, exceptions),
    currentBar,
    list,
    el(doc, 'div', { class: 'guide-bottom' }, restore, usageDetails),
    footer,
  )

  interface ReadingItem {
    node: HTMLElement
    dst: HTMLElement
    status: HTMLElement
    issues: HTMLElement
    retry: HTMLButtonElement
    page: HTMLElement
    stageId: string | undefined
    block: PreparedBlock
    warning: boolean
    tools: HTMLElement
    toolsButton: HTMLButtonElement
    setToolsOpen(open: boolean): void
    meta: HTMLElement
    notices: HTMLElement
    actions: HTMLElement
  }
  const items = new Map<string, ReadingItem>()
  let picker: (ChapterPicker & { guide: GuideDocument; stage: string | null }) | null = null
  const stageButtons = new Map<string, HTMLButtonElement>()
  interface DirectoryEntry {
    target: string
    original: string
    level: number
    parents: DirectoryEntry[]
    /** 需要显示的最近父级数量；不重名为 0，缩进已表示层级 */
    contextDepth: number
    button: HTMLButtonElement
    label: HTMLElement
    context: HTMLElement
  }
  const directoryEntries: DirectoryEntry[] = []
  const directoryTitle = (entry: DirectoryEntry) => {
    const item = items.get(entry.target)
    return item?.block.kind === 'heading' && item.node.dataset.state === 'complete' && !item.warning
      ? item.dst.textContent?.trim() || entry.original
      : entry.original
  }
  const refreshDirectory = () => {
    for (const entry of directoryEntries) {
      const text = directoryTitle(entry)
      entry.label.textContent = text
      entry.context.textContent = entry.parents
        .slice(entry.parents.length - entry.contextDepth)
        .map(directoryTitle)
        .join(' / ')
      entry.context.hidden = entry.contextDepth === 0
      entry.button.title = text === entry.original ? entry.original : `原文：${entry.original}`
    }
  }
  // 正常来源和工具按需展开；异常、进行中状态与重试入口保持可见。
  const syncDetails = (item: ReadingItem, restoreRetryFocus = false) => {
    const state = item.node.dataset.state
    const failed = state === 'failed' || state === 'missing'
    const showStatus = failed || state === 'pending' || state === 'skipped' || item.warning
    // 仅侧栏模式本来就在侧栏阅读，“只能在侧栏阅读”收进工具区，不在每段重复。
    const showPage =
      item.page.dataset.state === 'stale' ||
      (item.page.dataset.state === 'sidebar' && mode === 'inline')
    ;(showStatus ? item.notices : item.meta).append(item.status)
    ;(showPage ? item.notices : item.meta).append(item.page)
    if (failed) item.notices.append(item.retry)
    else item.actions.insertBefore(item.retry, item.actions.querySelector('.copy-feedback'))
    if (restoreRetryFocus && item.node.isConnected && !root.hidden) {
      const target =
        item.retry.hidden || (!failed && item.tools.hidden) ? item.toolsButton : item.retry
      target?.focus({ preventScroll: true })
    }
  }

  let sourceUrl: string | null = null
  let currentId: string | null = null
  let activeStage: string | null = null
  const visibleItems = () =>
    [...items.values()].filter(
      (i) => activeStage === null || !i.stageId || i.stageId === activeStage,
    )
  function mountBlocks() {
    const visible = visibleItems()
    if (!visible.some((i) => i.block.id === currentId)) currentId = visible[0]?.block.id ?? null
    list.replaceChildren()
    if (mode === 'sidebar') {
      const append = blockLayout(doc, list)
      for (const item of visible) {
        item.node.hidden = false
        append(item.block, item.node)
      }
    } else {
      const item = currentId ? items.get(currentId) : null
      if (item) {
        item.node.hidden = false
        list.append(item.node)
      }
    }
    const index = visible.findIndex((i) => i.block.id === currentId)
    currentLabel.textContent = `当前段 ${index < 0 ? 0 : index + 1} / ${visible.length}`
    previous.disabled = index <= 0
    next.disabled = index < 0 || index === visible.length - 1
    currentBar.hidden = mode === 'sidebar' || !visible.length
    directoryControl.button.hidden = !visible.length
    if (!visible.length) directoryControl.setOpen(false)
    root.dataset.mode = mode
    for (const button of directoryItems.querySelectorAll('button'))
      button.setAttribute('aria-current', String(button.dataset.target === currentId))
  }
  function focusBlock(id: string, locate = true) {
    if (!items.has(id)) return
    directoryControl.setOpen(false)
    currentId = id
    mountBlocks()
    const node = items.get(id)?.node
    if (mode === 'sidebar' && node) {
      // 工具栏可展开且高度随侧栏宽度变化，跳转时按实际高度避让。
      node.style.scrollMarginTop = `${header.getBoundingClientRect().height}px`
      node.scrollIntoView?.({ block: 'start' })
    }
    node?.focus({ preventScroll: true })
    if (locate) h.onLocate(id)
  }
  function move(delta: number) {
    const visible = visibleItems()
    const index = visible.findIndex((i) => i.block.id === currentId)
    const item = visible[index + delta]
    if (item) focusBlock(item.block.id)
  }
  function refreshLegend() {
    termLegend.hidden = ![...items.values()].some(
      (i) =>
        i.node.dataset.origin === 'dictionary' ||
        [...i.dst.querySelectorAll<HTMLElement>('.poe2-term[data-kind]')].some((t) =>
          COLORED.has(t.dataset.kind ?? ''),
        ),
    )
  }
  function refreshSummary() {
    let inline = 0,
      fallback = 0,
      stale = 0
    const rows: { rank: number; node: HTMLElement }[] = []
    for (const item of visibleItems()) {
      const state = item.node.dataset.state
      const failed = state === 'failed' || state === 'missing'
      const preserved = state === 'skipped'
      const pageState = item.page.dataset.state
      if (item.dst.textContent && !failed) {
        if (pageState === 'inline') inline++
        if (pageState === 'sidebar') fallback++
      }
      if (pageState === 'stale') stale++
      // 仅侧栏模式下“只能在侧栏阅读”不算异常，避免盖住真实失败。
      const sidebarOnly = pageState === 'sidebar' && mode === 'inline'
      const reason =
        failed || preserved
          ? item.status.textContent
          : pageState === 'stale' || sidebarOnly
            ? item.page.textContent
            : item.warning
              ? '译文待核对'
              : null
      if (!reason) continue
      const button = btn('', () => focusBlock(item.block.id))
      button.className = 'guide-exception'
      button.dataset.target = item.block.id
      // 失败用危险色、待核对用玫红，其余是位置与保留说明，保持中性。
      const label = failed
        ? '翻译失败'
        : preserved
          ? '原样保留'
          : sidebarOnly
            ? '仅侧栏显示'
            : pageState === 'stale'
              ? '位置失效'
              : '待核对'
      const kind = failed ? 'failed' : label === '待核对' ? 'warning' : 'info'
      button.dataset.kind = kind
      button.append(
        el(doc, 'strong', {}, label),
        el(doc, 'span', {}, item.block.source.slice(0, 100)),
        el(doc, 'small', {}, reason),
      )
      rows.push({ rank: kind === 'failed' ? 0 : kind === 'warning' ? 1 : 2, node: button })
    }
    // 分隔符放在 inline-block 片段之间，片段开头的空格不会被折叠掉。
    const counts = [
      `${mode === 'sidebar' ? '可在原文旁显示' : '原文旁'} ${inline}`,
      `仅侧栏 ${fallback}`,
      ...(stale ? [`位置失效 ${stale}`] : []),
    ]
    placement.replaceChildren(
      ...counts.flatMap((text, i) => [...(i ? [' · '] : []), el(doc, 'span', {}, text)]),
    )
    const countLabel = exceptionSummary.querySelector('span')
    if (countLabel) countLabel.textContent = `异常与保留 ${rows.length}`
    exceptions.hidden = rows.length === 0
    exceptionItems.replaceChildren(...rows.sort((a, b) => a.rank - b.rank).map((r) => r.node))
  }
  const showStage = (stageId: string) => {
    activeStage = stageId
    for (const [id, b] of stageButtons) b.setAttribute('aria-pressed', String(id === stageId))
    mountBlocks()
    refreshSummary()
  }

  return {
    root,
    showIntro(show) {
      intro.hidden = !show
    },
    rememberPosition() {
      const win = doc.defaultView
      if (!win) return () => {}
      const url = sourceUrl
      const { scrollX, scrollY } = win
      const headerHeight = header.getBoundingClientRect().height
      const anchor = [...items.values()].find(
        (item) => item.node.isConnected && item.node.getBoundingClientRect().bottom > headerHeight,
      )
      const offset = anchor ? anchor.node.getBoundingClientRect().top - headerHeight : 0
      return () => {
        if (root.hidden) return
        let top = 0
        if (sourceUrl === url && scrollY > 0) {
          if (!anchor) top = scrollY
          else {
            const item = items.get(anchor.block.id)
            if (item?.node.isConnected && item.block.source === anchor.block.source)
              top =
                win.scrollY +
                item.node.getBoundingClientRect().top -
                header.getBoundingClientRect().height -
                offset
          }
        }
        win.scrollTo({ left: scrollX, top, behavior: 'instant' })
      }
    },
    showDocument(guide, blocks, stageId, selectedIds = blocks.map((b) => b.id)) {
      sourceUrl = guide.source.url
      title.textContent = guide.source.title
      // 标题最多显示两行，完整标题放在悬停提示里。
      title.title = guide.source.title
      // 常驻说明写在站点行，不占横幅（横幅会被“配置服务”“出错”覆盖）
      const notes = [
        guide.source.siteId === 'generic' || guide.source.fallback
          ? '通用提取，仅支持 PoE2 术语'
          : '',
        guide.source.fallback ? fallbackNote(guide.source.siteId) : '',
        guide.diagnostics?.length ? '提取达到长度或段数上限，部分内容未完整读取；请缩小选区' : '',
      ].filter(Boolean)
      site.textContent = [new URL(guide.source.url).hostname, ...notes].join(' · ')
      for (const button of scopeChoice.querySelectorAll('button'))
        button.setAttribute('aria-pressed', String(button.dataset.scope === guide.source.scope))
      scopeText.textContent = `${{ full: '当前页正文', selection: '仅选中文字', region: '仅点选区域' }[guide.source.scope]} · 仅已加载的可访问正文，不含隐藏/折叠内容和子页`
      // 同一文档同一阶段只改勾选状态；换文档或阶段才重建，并按章节编号找回焦点。
      if (picker && picker.guide === guide && picker.stage === stageId) picker.update(selectedIds)
      else {
        const focused = doc.activeElement
        const key =
          focused instanceof HTMLElement && chapters.contains(focused)
            ? (focused.dataset.chapter ?? focused.dataset.action)
            : undefined
        picker = {
          ...chapterPicker(doc, guide, stageId, selectedIds, h.onSelection),
          guide,
          stage: stageId,
        }
        chapters.replaceChildren(picker.root)
        if (key)
          [...chapters.querySelectorAll<HTMLElement>('[data-chapter], [data-action]')]
            .find((n) => (n.dataset.chapter ?? n.dataset.action) === key)
            ?.focus({ preventScroll: true })
      }
      stagesBar.replaceChildren()
      stageButtons.clear()
      stagesBar.hidden = guide.stages.length === 0
      for (const s of guide.stages) {
        const b = el(
          doc,
          'button',
          {
            class: 'stage',
            type: 'button',
            'aria-pressed': 'false',
            'data-state': 'idle',
            'aria-description': STAGE.idle,
          },
          s.name,
        )
        b.addEventListener('click', () => h.onStage(s.id))
        stageButtons.set(s.id, b)
        stagesBar.append(b)
      }
      list.replaceChildren()
      items.clear()
      activeStage = stageId
      directoryItems.replaceChildren()
      directoryEntries.length = 0
      const parents: DirectoryEntry[] = []
      const chosen = new Set(blocks.map((b) => b.id))
      for (const chapter of scopeChapters(
        guide.blocks.filter(
          (b) => chosen.has(b.id) && (stageId === null || !b.stageId || b.stageId === stageId),
        ),
      )) {
        const target = chapter.ids[0]
        if (!target) continue
        while (parents.length && (parents.at(-1)?.level ?? 0) >= chapter.level) parents.pop()
        const button = btn('', () => focusBlock(target))
        button.className = 'guide-directory-link'
        button.dataset.target = target
        button.dataset.level = String(chapter.level)
        button.style.setProperty('--directory-depth', String(parents.length))
        const label = el(doc, 'span', { class: 'directory-title' }, chapter.title)
        const context = el(doc, 'small', { class: 'directory-context' })
        button.append(
          context,
          label,
          el(doc, 'small', { class: 'directory-count' }, ` · ${chapter.ids.length} 段`),
        )
        const entry = {
          target,
          original: chapter.title,
          level: chapter.level,
          parents: [...parents],
          contextDepth: 0,
          button,
          label,
          context,
        }
        directoryEntries.push(entry)
        parents.push(entry)
        directoryItems.append(button)
      }
      // 只在重名时显示足以区分的最近父级，作为页面标题的根节点因此通常省略。
      const pathOf = (entry: DirectoryEntry) => [
        ...entry.parents.map((p) => p.original),
        entry.original,
      ]
      for (const entry of directoryEntries) {
        const others = directoryEntries.filter(
          (other) => other !== entry && other.original === entry.original,
        )
        if (!others.length) continue
        const path = pathOf(entry)
        let depth = 1
        while (
          depth < entry.parents.length &&
          others.some(
            (other) =>
              JSON.stringify(pathOf(other).slice(-(depth + 1))) ===
              JSON.stringify(path.slice(-(depth + 1))),
          )
        )
          depth++
        entry.contextDepth = Math.min(depth, entry.parents.length)
      }
      for (const b of blocks) {
        const heading = b.kind === 'heading'
        const dst = el(doc, heading ? 'span' : 'p', { class: 'dst', lang: 'zh-CN' })
        const status = el(doc, 'p', { class: 'block-status' })
        const issues = el(doc, 'details', { class: 'issues', hidden: true })
        const retry = el(
          doc,
          'button',
          { class: 'pt-btn pt-btn--quiet retry-block', type: 'button', hidden: true },
          '重新翻译',
        )
        retry.addEventListener('click', () => h.onRetryBlock(b.id))
        const copy = el(
          doc,
          'button',
          { class: 'pt-btn pt-btn--quiet copy-block', type: 'button', hidden: true },
          '复制译文',
        )
        copy.addEventListener('click', async () => {
          if (copy.hidden || !dst.textContent?.trim()) return
          try {
            if (!navigator.clipboard) throw Error('clipboard unavailable')
            await navigator.clipboard.writeText(dst.textContent ?? '')
            labelIcon(copy, 'check', '已复制译文')
            itemCopyStatus.textContent = '已复制译文。'
          } catch {
            itemCopyStatus.textContent = '复制失败，请选中文字复制。'
          }
        })
        const itemCopyStatus = el(doc, 'span', { class: 'copy-feedback', role: 'status' })
        labelIcon(copy, 'copy', '复制译文')
        labelIcon(retry, 'reload', '重新翻译此段')
        const level = b.processing?.structure?.headingLevel ?? 2
        const src = el(doc, heading ? 'span' : 'p', { class: 'src', lang: 'en' })
        const page = el(doc, 'p', { class: 'page-status' })
        const locate = btn('定位原文', () => h.onLocate(b.id))
        locate.classList.add('locate-block')
        src.append(annotate(doc, b.source, b.terms, b.abbreviations))
        const notices = el(doc, 'div', { class: 'block-notices' })
        const meta = el(doc, 'div', { class: 'block-meta' }, status, page)
        const actions = el(
          doc,
          'div',
          { class: 'block-actions' },
          locate,
          copy,
          retry,
          itemCopyStatus,
        )
        const tools = el(
          doc,
          'div',
          { class: 'block-tools', id: `guide-block-tools-${items.size}` },
          meta,
          actions,
        )
        const toolControl = panelControl('工具', tools, 'block-tools-toggle')
        toolControl.button.setAttribute('aria-label', '段落工具')
        toolControl.button.title = '段落工具'
        toolControl.setOpen(mode === 'inline')
        const node = el(
          doc,
          'article',
          { class: 'block', 'data-id': b.id, 'data-kind': b.kind, tabindex: '-1' },
          ...(heading
            ? [
                el(doc, 'h3', { class: 'block-heading', 'aria-level': String(level) }, dst, src),
                toolControl.button,
              ]
            : [src, toolControl.button, dst]),
          notices,
          issues,
          tools,
        )
        if (heading) node.dataset.headingLevel = String(level)
        const structure = b.processing?.structure
        if (structure?.listId) node.dataset.list = structure.listId
        if (structure?.tableId) {
          node.dataset.table = structure.tableId
          node.dataset.row = structure.rowId
          node.dataset.column = String(structure.column ?? 0)
        }
        items.set(b.id, {
          node,
          dst,
          status,
          issues,
          retry,
          page,
          stageId: b.stageId,
          block: b,
          warning: false,
          tools,
          toolsButton: toolControl.button,
          setToolsOpen: toolControl.setOpen,
          meta,
          notices,
          actions,
        })
      }
      refreshDirectory()
      refreshLegend()
      if (stageId) showStage(stageId)
      else {
        mountBlocks()
        refreshSummary()
      }
    },
    clearDocument() {
      sourceUrl = null
      title.textContent = ''
      site.textContent = ''
      scopeText.textContent = ''
      chapters.replaceChildren()
      picker = null
      progress.textContent = ''
      ready = false
      lastProgress = null
      updateBegin()
      stagesBar.replaceChildren()
      stageButtons.clear()
      stagesBar.hidden = true
      list.replaceChildren()
      items.clear()
      directoryItems.replaceChildren()
      directoryEntries.length = 0
      termLegend.hidden = true
      directoryControl.setOpen(false)
      directoryControl.button.hidden = true
      exceptions.hidden = true
      currentBar.hidden = true
      placement.textContent = ''
    },
    showStage,
    setTranslation(blockId, text, origin, issueList) {
      const item = items.get(blockId)
      if (!item) return
      const retryFocused = doc.activeElement === item.retry
      item.dst.replaceChildren(
        translatedText(
          doc,
          text,
          translatedTerms(text, item.block.terms, item.block.statEvidence),
          true,
          true,
        ),
      )
      item.status.textContent = `${issueList.length ? '待核对 · ' : ''}${ORIGIN[origin]}`
      item.node.dataset.origin = origin
      item.node.dataset.state = 'complete'
      item.warning = issueList.length > 0
      item.retry.hidden = origin === 'dictionary'
      const copy = item.node.querySelector<HTMLButtonElement>('.copy-block')
      if (copy) copy.hidden = false
      item.issues.replaceChildren()
      item.issues.hidden = issueList.length === 0
      if (issueList.length) {
        item.issues.append(disclosure(doc, `核对提示 ${issueList.length} 条`))
        for (const i of issueList) item.issues.append(el(doc, 'p', {}, i.detail))
      }
      syncDetails(item, retryFocused)
      if (item.block.kind === 'heading') refreshDirectory()
      refreshLegend()
      refreshSummary()
    },
    setBlockState(blockId, state, message) {
      const item = items.get(blockId)
      if (!item) return
      const retryFocused = doc.activeElement === item.retry
      item.node.dataset.state = state
      item.status.textContent = message ?? STATE[state]
      item.retry.hidden = !(state === 'failed' || state === 'missing')
      if (state === 'failed' || state === 'missing') {
        item.dst.textContent = ''
        const copy = item.node.querySelector<HTMLButtonElement>('.copy-block')
        if (copy) copy.hidden = true
        item.issues.hidden = true
        delete item.node.dataset.origin
        item.warning = false
        item.page.textContent = ''
        delete item.page.dataset.state
      }
      syncDetails(item, retryFocused)
      if (item.block.kind === 'heading') refreshDirectory()
      refreshLegend()
      refreshSummary()
    },
    setStageState(stageId, state) {
      const b = stageButtons.get(stageId)
      if (!b) return
      // 状态有文字（CSS ::after 显示，读屏读 aria-description），不只靠颜色
      b.dataset.state = state
      b.setAttribute('aria-description', STAGE[state])
    },
    setBanner(kind, message) {
      banner.hidden = kind === 'none'
      banner.dataset.kind = kind
      bannerText.textContent = message
      bannerAction.hidden = kind !== 'setup'
      begin.hidden = kind === 'setup'
      updateBegin()
    },
    ask(message, okLabel, signal) {
      // 同一时间只有一个确认框：旧的先按取消结束，避免其 Promise 永远挂起
      pendingAsk?.(false)
      if (signal?.aborted) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        const previousFocus = doc.activeElement
        const onKey = (event: KeyboardEvent) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            finish(false)
          }
        }
        const onAbort = () => finish(false)
        const finish = (value: boolean) => {
          if (pendingAsk !== finish) return
          pendingAsk = null
          awaitingConfirmation = false
          updateBegin()
          signal?.removeEventListener('abort', onAbort)
          askBox.hidden = true
          askBox.removeEventListener('keydown', onKey)
          askBox.replaceChildren()
          if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
            previousFocus.focus()
          resolve(value)
        }
        pendingAsk = finish
        awaitingConfirmation = true
        updateBegin()
        signal?.addEventListener('abort', onAbort, { once: true })
        const ok = el(doc, 'button', { class: 'pt-btn ask-ok', type: 'button' }, okLabel)
        const cancel = el(
          doc,
          'button',
          { class: 'pt-btn pt-btn--quiet ask-cancel', type: 'button' },
          '取消',
        )
        ok.addEventListener('click', () => finish(true))
        cancel.addEventListener('click', () => finish(false))
        askBox.replaceChildren(el(doc, 'p', {}, message), ok, cancel)
        askBox.hidden = false
        askBox.addEventListener('keydown', onKey)
        ok.focus()
      })
    },
    setUsage(text) {
      usage.textContent = text
    },
    setSendSummary(value) {
      sendSummary = value
      updateBegin()
    },
    setReady(value) {
      ready = value
      updateBegin()
    },
    setProgress(value) {
      lastProgress = value
      progressMeter.max = Math.max(1, value.selected)
      progressMeter.value = value.completed + value.preserved
      updateBegin()
      progress.textContent =
        value.selected === 0
          ? '尚未选择正文'
          : `完成 ${value.completed} / ${value.selected} 段${value.failed ? ` · ${value.failed} 段失败` : ''}${value.preserved ? ` · ${value.preserved} 段保留原文` : ''}`
      progress.title = `已选 ${value.selected} 段 / ${value.characters} 字`
    },
    setPageState(id, result) {
      const item = items.get(id)
      if (item) {
        if (result.state === 'located') {
          item.node.setAttribute('aria-description', result.message)
          return
        }
        item.page.textContent = result.message
        item.page.dataset.state = result.state
        syncDetails(item)
        refreshSummary()
      }
    },
    setBusy(value) {
      // 忙碌时开始按钮禁用；焦点原在开始或停止上时交给停止，结束后交回开始。
      const active = doc.activeElement
      const fromBegin = active === begin
      const fromStop = active === stop
      busy = value
      updateBegin()
      stop.hidden = !busy
      root.setAttribute('aria-busy', String(busy))
      if (busy && fromBegin && begin.disabled) stop.focus({ preventScroll: true })
      else if (!busy && fromStop && !root.hidden)
        (begin.hidden || begin.disabled ? reload : begin).focus({ preventScroll: true })
    },
  }
}
