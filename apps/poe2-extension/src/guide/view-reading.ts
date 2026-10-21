import {
  type GuideDocument,
  type Issue,
  type PreparedBlock,
  translatedTerms,
} from '@poe2-tools/guide-core'
import type { PageResult } from '../extract/inline'
import type { ReadingMode } from '../extract/session'
import { annotate } from './annotate'
import type { ReadScope } from './controller'
import { el } from './dom'
import { chapterPicker, scopeChapters } from './scope-view'
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

export interface ReadingView {
  root: HTMLElement
  showIntro(show: boolean): void
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
  const scopeText = el(doc, 'p', { class: 'guide-scope' })
  const scopeChoice = el(doc, 'select', { 'aria-label': '读取范围' })
  for (const [value, text] of [
    ['full', '整页正文'],
    ['selection', '选中文字'],
    ['region', '点选区域'],
  ])
    scopeChoice.append(el(doc, 'option', { value }, text))
  scopeChoice.addEventListener('change', () => h.onScope(scopeChoice.value as ReadScope))
  let mode: ReadingMode = 'inline'
  let lastProgress: ReadingProgress | null = null
  const modeChoice = el(doc, 'select', { 'aria-label': '阅读位置' })
  modeChoice.append(
    el(doc, 'option', { value: 'inline' }, '原文旁对照'),
    el(doc, 'option', { value: 'sidebar' }, '仅侧栏'),
  )
  modeChoice.addEventListener('change', () => {
    mode = modeChoice.value as ReadingMode
    mountBlocks()
    refreshSummary()
    h.onMode(mode)
  })
  const begin = btn('开始翻译', () => h.onBegin())
  begin.classList.add('guide-begin')
  begin.classList.remove('pt-btn--quiet')
  let ready = false,
    busy = false
  const updateBegin = () => {
    const left = lastProgress
      ? lastProgress.selected - lastProgress.completed - lastProgress.preserved
      : null
    begin.disabled = !ready || busy || left === 0
    begin.textContent = busy
      ? '正在翻译…'
      : left === 0
        ? '翻译完成'
        : lastProgress?.failed && left === lastProgress.failed
          ? `重试失败段（${left}）`
          : lastProgress?.completed
            ? `继续翻译（${left}）`
            : '开始翻译'
  }
  updateBegin()
  const progress = el(doc, 'p', { class: 'guide-progress', role: 'status' })
  const chapters = el(doc, 'div', { class: 'guide-scope-options' })
  const stop = btn('停止', () => h.onStop())
  stop.hidden = true
  const usage = el(doc, 'p', { class: 'guide-usage' })
  const options = el(
    doc,
    'details',
    { class: 'guide-options' },
    el(doc, 'summary', {}, '调整翻译范围'),
    scopeChoice,
    scopeText,
    chapters,
  )
  const more = el(
    doc,
    'details',
    { class: 'guide-more' },
    el(doc, 'summary', {}, '更多操作'),
    el(
      doc,
      'div',
      { class: 'guide-actions' },
      btn('重新读取', () => h.onReload()),
      btn('恢复原文', () => h.onRestore()),
      btn('设置', () => h.onSettings()),
    ),
  )
  const header = el(
    doc,
    'header',
    { class: 'guide-header' },
    title,
    site,
    el(doc, 'div', { class: 'guide-actions' }, modeChoice, options),
    progress,
    el(doc, 'div', { class: 'guide-actions' }, begin, stop, more),
    usage,
  )

  const introOk = btn('知道了', () => {
    intro.hidden = true
    h.onIntroSeen()
  })
  const intro = el(
    doc,
    'section',
    { class: 'guide-intro', hidden: true },
    el(
      doc,
      'p',
      {},
      '先读取当前页并预览范围，点“开始翻译”后才发送模型请求。默认将合格译文显示在原文旁，可随时恢复原文。',
    ),
    el(
      doc,
      'p',
      {},
      '只有在你点击开始翻译或单段重试后，所选正文、本段术语和选定范围内的少量原文语境才会发给你选择的服务商；扩展不内置任何 Key。',
    ),
    el(doc, 'p', {}, 'Key 与译文缓存只存在本机扩展存储里，未加密，网页读不到；可在“设置”里清除。'),
    introOk,
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
  const directory = el(doc, 'nav', { class: 'guide-directory', 'aria-label': '正文目录' })
  const directoryItems = el(doc, 'div', { class: 'guide-directory-items' })
  const directoryBox = el(
    doc,
    'details',
    { open: true },
    el(doc, 'summary', {}, '目录'),
    directoryItems,
  )
  directory.append(directoryBox)
  const placement = el(doc, 'p', { class: 'guide-placement' })
  const exceptions = el(doc, 'details', { class: 'guide-exceptions' })
  const exceptionSummary = el(doc, 'summary', {}, '异常与保留 0')
  const exceptionItems = el(doc, 'div', { class: 'guide-exception-items' })
  exceptions.append(exceptionSummary, exceptionItems)
  const currentLabel = el(doc, 'h2', { class: 'guide-current-title' }, '当前段')
  const previous = btn('上一段', () => move(-1))
  const next = btn('下一段', () => move(1))
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
    header,
    intro,
    banner,
    askBox,
    stagesBar,
    directory,
    placement,
    exceptions,
    currentBar,
    list,
    footer,
  )

  const items = new Map<
    string,
    {
      node: HTMLElement
      dst: HTMLElement
      status: HTMLElement
      issues: HTMLElement
      retry: HTMLButtonElement
      page: HTMLElement
      stageId: string | undefined
      block: PreparedBlock
      warning: boolean
    }
  >()
  const stageButtons = new Map<string, HTMLButtonElement>()

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
    directory.hidden = !visible.length
    root.dataset.mode = mode
    for (const button of directoryItems.querySelectorAll('button'))
      button.setAttribute('aria-current', String(button.dataset.target === currentId))
  }
  function focusBlock(id: string, locate = true) {
    if (!items.has(id)) return
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
  function refreshSummary() {
    let inline = 0,
      fallback = 0,
      stale = 0
    const rows: HTMLElement[] = []
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
      const reason =
        failed || preserved
          ? item.status.textContent
          : pageState === 'stale' || pageState === 'sidebar'
            ? item.page.textContent
            : item.warning
              ? '译文待核对'
              : null
      if (!reason) continue
      const button = btn('', () => focusBlock(item.block.id))
      button.className = 'guide-exception'
      button.dataset.target = item.block.id
      button.append(
        el(
          doc,
          'strong',
          {},
          failed
            ? '翻译失败'
            : preserved
              ? '原样保留'
              : pageState === 'sidebar'
                ? '仅侧栏显示'
                : pageState === 'stale'
                  ? '位置失效'
                  : '待核对',
        ),
        el(doc, 'span', {}, item.block.source.slice(0, 100)),
        el(doc, 'small', {}, reason),
      )
      rows.push(button)
    }
    placement.textContent = `${mode === 'sidebar' ? '可在原文旁显示' : '原文旁'} ${inline} · 仅侧栏 ${fallback}${stale ? ` · 位置失效 ${stale}` : ''}`
    exceptionSummary.textContent = `异常与保留 ${rows.length}`
    exceptions.hidden = rows.length === 0
    exceptionItems.replaceChildren(...rows)
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
    showDocument(guide, blocks, stageId, selectedIds = blocks.map((b) => b.id)) {
      title.textContent = guide.source.title
      // 常驻说明写在站点行，不占横幅（横幅会被“配置服务”“出错”覆盖）
      const notes = [
        guide.source.siteId === 'generic' || guide.source.fallback
          ? '通用提取，仅支持 PoE2 术语'
          : '',
        guide.source.fallback ? fallbackNote(guide.source.siteId) : '',
        guide.diagnostics?.length ? '提取达到长度或段数上限，部分内容未完整读取；请缩小选区' : '',
      ].filter(Boolean)
      site.textContent = [new URL(guide.source.url).hostname, ...notes].join(' · ')
      scopeChoice.value = guide.source.scope
      scopeText.textContent = `${{ full: '当前页正文', selection: '仅选中文字', region: '仅点选区域' }[guide.source.scope]} · 仅已加载的可访问正文，不含隐藏/折叠内容和子页`
      const wasOpen = chapters.querySelector('details')?.open ?? false
      const picker = chapterPicker(doc, guide, stageId, selectedIds, h.onSelection)
      picker.open = wasOpen
      chapters.replaceChildren(picker)
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
      const chosen = new Set(blocks.map((b) => b.id))
      for (const chapter of scopeChapters(
        guide.blocks.filter(
          (b) => chosen.has(b.id) && (stageId === null || !b.stageId || b.stageId === stageId),
        ),
      )) {
        const target = chapter.ids[0]
        if (!target) continue
        const button = btn(`${chapter.title} · ${chapter.ids.length} 段`, () => focusBlock(target))
        button.className = 'guide-directory-link'
        button.dataset.target = target
        directoryItems.append(button)
      }
      for (const b of blocks) {
        const dst = el(doc, 'p', { class: 'dst', lang: 'zh-CN' })
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
          try {
            if (!navigator.clipboard) throw Error('clipboard unavailable')
            await navigator.clipboard.writeText(dst.textContent ?? '')
            copy.textContent = '已复制'
          } catch {
            copy.textContent = '复制失败，请选中文字复制'
          }
        })
        const level = b.processing?.structure?.headingLevel ?? 2
        const src = el(doc, b.kind === 'heading' ? 'h3' : 'p', { class: 'src', lang: 'en' })
        if (b.kind === 'heading') src.setAttribute('aria-level', String(level))
        const page = el(doc, 'p', { class: 'page-status' })
        const locate = btn('定位原文', () => h.onLocate(b.id))
        locate.classList.add('locate-block')
        src.append(annotate(doc, b.source, b.terms, b.abbreviations))
        const node = el(
          doc,
          'article',
          { class: 'block', 'data-id': b.id, 'data-kind': b.kind, tabindex: '-1' },
          src,
          dst,
          status,
          issues,
          page,
          el(doc, 'div', { class: 'block-actions' }, locate, copy, retry),
        )
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
        })
      }
      if (stageId) showStage(stageId)
      else {
        mountBlocks()
        refreshSummary()
      }
    },
    clearDocument() {
      title.textContent = ''
      site.textContent = ''
      scopeText.textContent = ''
      chapters.replaceChildren()
      progress.textContent = ''
      ready = false
      updateBegin()
      stagesBar.replaceChildren()
      stageButtons.clear()
      stagesBar.hidden = true
      list.replaceChildren()
      items.clear()
      directoryItems.replaceChildren()
      exceptions.hidden = true
      currentBar.hidden = true
      placement.textContent = ''
      lastProgress = null
    },
    showStage,
    setTranslation(blockId, text, origin, issueList) {
      const item = items.get(blockId)
      if (!item) return
      item.dst.replaceChildren(translatedText(doc, text, translatedTerms(text, item.block.terms)))
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
        item.issues.append(el(doc, 'summary', {}, `核对提示 ${issueList.length} 条`))
        for (const i of issueList) item.issues.append(el(doc, 'p', {}, i.detail))
      }
      refreshSummary()
    },
    setBlockState(blockId, state, message) {
      const item = items.get(blockId)
      if (!item) return
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
          signal?.removeEventListener('abort', onAbort)
          askBox.hidden = true
          askBox.removeEventListener('keydown', onKey)
          askBox.replaceChildren()
          if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
            previousFocus.focus()
          resolve(value)
        }
        pendingAsk = finish
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
    setReady(value) {
      ready = value
      updateBegin()
    },
    setProgress(value) {
      lastProgress = value
      updateBegin()
      progress.textContent = `已选 ${value.selected} 段 / ${value.characters} 字 · 完成 ${value.completed} · 失败 ${value.failed} · 原样保留 ${value.preserved}`
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
        refreshSummary()
      }
    },
    setBusy(value) {
      busy = value
      updateBegin()
      stop.hidden = !busy
      root.setAttribute('aria-busy', String(busy))
    },
  }
}
