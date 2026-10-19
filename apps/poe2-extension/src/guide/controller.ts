import {
  buildMessages,
  type ChatMessage,
  cacheKey,
  checkTranslation,
  chunkBlocks,
  createMatcher,
  createTagSplitter,
  type GuideDictionary,
  type GuideDocument,
  PROMPT_VERSION,
  type PreparedBlock,
  parseExtractResult,
  prepareBlock,
  restore,
  sendable,
} from '@poe2-tools/guide-core'
import { type ChunkResult, EngineError } from './engines/openai'
import { estimateTokens } from './engines/presets'
import type { GuidePrefs } from './prefs'
import type { GuideStore } from './store/types'
import type { ReadingView } from './view-reading'

export interface EngineRunner {
  run(
    messages: readonly ChatMessage[],
    onText: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<ChunkResult>
}

export interface EngineHandle {
  runner: EngineRunner
  provider: string
  model: string
  params: string
  costText(prompt: number, completion: number): string
}

export interface ControllerDeps {
  extract(): Promise<unknown>
  dictionary(): Promise<GuideDictionary>
  translateLine(line: string): string | null
  store: GuideStore
  prefs(): Promise<GuidePrefs>
  engine(): Promise<EngineHandle | null>
  view: ReadingView
  random(): string
}

export interface Controller {
  start(): Promise<void>
  translateStage(stageId: string | null): Promise<void>
  retryBlock(id: string): Promise<void>
  stop(): void
}

const REASONS = {
  coe: 'CoE 页面请使用扩展原有的中文显示，这里不翻译。',
  poe1: '这是 PoE1 页面，本工具只支持 PoE2。',
  empty: '没有读到正文。可以先选中要翻译的文字，再点扩展图标。',
} as const

/** 一次翻译任务：被新任务、停止或重新读取取代时整体中止，之后不再写入任何状态 */
interface Run {
  controller: AbortController
  /** 发起任务的阶段；undefined 表示单段重试 */
  stageId: string | null | undefined
  /** 本任务标为“翻译中”、还没有结果的段落 */
  inflight: Set<string>
  /** 任务结束（完成或被中止）时兑现，排队的单段重试据此接着执行 */
  ended: Promise<void>
  end(): void
}

interface Failure {
  state: 'failed' | 'missing'
  message: string | undefined
}

function newRun(stageId: string | null | undefined): Run {
  let end = () => {}
  const ended = new Promise<void>((resolve) => (end = resolve))
  return { controller: new AbortController(), stageId, inflight: new Set(), ended, end }
}

export function createController(deps: ControllerDeps): Controller {
  const { view } = deps
  // 读取成功后才有文档；读取中或读取失败时为 null，阶段与重试操作一律不执行
  let guide: GuideDocument | null = null
  let blocks: PreparedBlock[] = []
  let dictHash = ''
  const done = new Set<string>()
  // 标为失败或未返回的段：停止、切换阶段时保留错误说明与重试按钮
  const failures = new Map<string, Failure>()
  let active: Run | null = null
  // 排队等当前任务结束的单段重试；停止或重新读取时整体作废
  let queueEpoch = 0
  const queued = new Set<string>()
  // 每次 start() 加一；旧文档的任务与回调据此放弃写入
  let generation = 0
  let tokens = { prompt: 0, completion: 0 }
  let cacheHits = 0
  const usageText = (engine: EngineHandle) =>
    `本次约 ${tokens.prompt}+${tokens.completion} tokens · ${engine.costText(tokens.prompt, tokens.completion)} · 缓存命中 ${cacheHits} 段`

  const keyOf = (b: PreparedBlock, e: EngineHandle) =>
    cacheKey({
      text: b.source,
      protectedText: b.protectedText,
      tokens: b.tokens,
      game: 'poe2',
      locale: 'zh-CN',
      dictHash,
      terms: b.terms,
      provider: e.provider,
      model: e.model,
      params: e.params,
      promptVersion: PROMPT_VERSION,
    })

  // 未完成的段：之前失败过的回到失败状态，其余回到 idle
  const resetBlock = (id: string) => {
    const f = failures.get(id)
    if (f) view.setBlockState(id, f.state, f.message)
    else view.setBlockState(id, 'idle')
  }
  const markFailed = (run: Run, id: string, state: Failure['state'], message?: string) => {
    run.inflight.delete(id)
    failures.set(id, { state, message })
    view.setBlockState(id, state, message)
  }

  // 同步中止当前任务：未完成段复位，挂起的确认框随信号按取消结束
  function cancelRun(): boolean {
    const run = active
    if (!run) return false
    active = null
    run.controller.abort()
    for (const id of run.inflight) if (!done.has(id)) resetBlock(id)
    run.end()
    return true
  }

  // 作废排队中的单段重试，段落复位
  function dropQueued() {
    queueEpoch++
    for (const id of queued) resetBlock(id)
    queued.clear()
  }

  async function translate(
    targets: PreparedBlock[],
    force: boolean,
    stageId: string | null | undefined,
  ): Promise<void> {
    // 先同步登记，保证旧任务在新任务的任何 await 之前就已失效
    cancelRun()
    const run = newRun(stageId)
    active = run
    const { signal } = run.controller
    const live = () => !signal.aborted
    view.setBusy(true)
    try {
      let engine: EngineHandle | null
      try {
        engine = await deps.engine()
      } catch {
        if (live()) view.setBanner('error', '读取翻译服务设置失败，请重新打开侧边栏。')
        return
      }
      if (!live()) return
      if (!engine) {
        view.setBanner('setup', '配置翻译服务后即可整段翻译；现在显示原文与术语标注。')
        return
      }
      const pending: PreparedBlock[] = []
      const keys = new Map<string, string>()
      for (const b of targets) {
        const key = await keyOf(b, engine)
        if (!live()) return
        keys.set(b.id, key)
        let hit: Awaited<ReturnType<GuideStore['getCached']>> = null
        if (!force) {
          try {
            hit = await deps.store.getCached(key)
          } catch {
            hit = null // 缓存不可用按未命中处理
          }
          if (!live()) return
        }
        if (hit) {
          view.setTranslation(b.id, hit.text, 'cache', hit.issues)
          done.add(b.id)
          failures.delete(b.id)
          cacheHits++
        } else pending.push(b)
      }
      const chars = pending.reduce((n, b) => n + b.source.length, 0)
      const estimate = estimateTokens(pending.map((b) => b.protectedText).join('\n'))
      view.setUsage(
        pending.length
          ? `待翻译 ${pending.length} 段，约 ${estimate} tokens · ${engine.costText(estimate * 2, estimate)}`
          : usageText(engine),
      )
      let prefs: GuidePrefs
      try {
        prefs = await deps.prefs()
      } catch {
        if (live()) view.setBanner('error', '读取设置失败，请重新打开侧边栏。')
        return
      }
      if (!live()) return
      if (chars > prefs.charLimit) {
        const ok = await view.ask(
          `本次要发送约 ${chars} 个英文字符，超过设定的 ${prefs.charLimit}，继续吗？`,
          '继续翻译',
          signal,
        )
        if (!live()) return
        if (!ok) {
          view.setBanner('info', '已取消发送。可以切换阶段、选中部分文字，或在设置里调高上限。')
          return
        }
      }
      for (const chunk of chunkBlocks(pending)) {
        if (!live()) return
        for (const b of chunk) {
          run.inflight.add(b.id)
          view.setBlockState(b.id, 'pending')
        }
        let streamed = ''
        const splitter = createTagSplitter(
          chunk.map((b) => b.id),
          (id, raw) => {
            if (!live()) return
            const b = chunk.find((x) => x.id === id)
            if (!b) return
            const restored = restore(raw, b.tokens)
            const issues = checkTranslation(b, restored.text, restored, null)
            view.setTranslation(id, restored.text, 'engine', issues)
            done.add(id)
            run.inflight.delete(id)
            failures.delete(id)
            const key = keys.get(id)
            if (key)
              void deps.store.putCached({ hash: key, text: restored.text, issues }).catch(() => {})
          },
        )
        const messages = buildMessages(chunk, deps.random())
        try {
          const result = await engine.runner.run(
            messages,
            (d) => {
              if (!live()) return
              streamed += d
              splitter.push(d)
            },
            signal,
          )
          if (!live()) return
          // 服务没回用量时：输入按提示词估算，输出按已收到的流式文本估算
          const usage = result.usage ?? {
            prompt: estimateTokens(messages.map((m) => m.content).join('')),
            completion: estimateTokens(streamed),
          }
          tokens = {
            prompt: tokens.prompt + usage.prompt,
            completion: tokens.completion + usage.completion,
          }
          view.setUsage(usageText(engine))
          for (const id of splitter.end())
            markFailed(
              run,
              id,
              'missing',
              result.finishReason === 'length' ? '输出被截断，可单独重试' : undefined,
            )
        } catch (error) {
          // 已被取代或停止：cancelRun 已复位本任务的段落，这里不再写任何状态
          if (!live()) return
          const kind = error instanceof EngineError ? error.kind : 'network'
          const unfinished = chunk.filter((b) => !done.has(b.id))
          if (kind === 'aborted') {
            for (const b of pending.filter((x) => !done.has(x.id))) resetBlock(b.id)
            break
          }
          const message = error instanceof Error ? error.message : '翻译失败'
          for (const b of unfinished) markFailed(run, b.id, 'failed', message)
          if (kind === 'auth') {
            view.setBanner('setup', message) // 横幅带“配置翻译服务”按钮，直达设置
            break
          }
          if (kind === 'balance' || kind === 'rate') {
            // rate 已由 withRetry 自动重试过一次，再失败就停下
            view.setBanner('error', message)
            break
          }
        }
      }
    } finally {
      // 只有仍是当前任务时才收尾，避免旧任务隐藏新任务的停止按钮
      if (active === run) {
        active = null
        view.setBusy(false)
      }
      run.end()
    }
  }

  const stageTargets = (stageId: string | null) =>
    blocks.filter(
      (b) =>
        sendable(b) &&
        !done.has(b.id) &&
        (stageId === null || b.stageId === undefined || b.stageId === stageId),
    )

  return {
    async start() {
      const gen = ++generation
      dropQueued()
      if (cancelRun()) view.setBusy(false)
      // 读取期间旧视图保留，但阶段与重试操作不执行；读取成功后才替换文档与状态
      guide = null
      view.setBanner('none', '')
      // 读取失败：清空旧视图，避免旧页面的阶段与段落继续可点
      const fail = (message: string) => {
        if (gen !== generation) return
        blocks = []
        done.clear()
        failures.clear()
        view.clearDocument()
        view.setBanner('error', message)
      }
      let raw: unknown
      try {
        raw = await deps.extract()
      } catch {
        fail('页面已更换或无法读取，请在攻略页重新点扩展图标。')
        return
      }
      if (gen !== generation) return
      const result = parseExtractResult(raw)
      if (!result) {
        fail('读取结果无效，请刷新攻略页后重试。')
        return
      }
      if (!result.ok) {
        fail(REASONS[result.reason])
        return
      }
      let dict: GuideDictionary
      try {
        dict = await deps.dictionary()
      } catch {
        fail('术语词典载入失败，请重新打开侧边栏。')
        return
      }
      if (gen !== generation) return
      guide = result.doc
      dictHash = dict.hash
      done.clear()
      failures.clear()
      tokens = { prompt: 0, completion: 0 }
      cacheHits = 0
      const matcher = createMatcher(dict)
      blocks = guide.blocks.map((b) => prepareBlock(b, matcher))
      const current = guide.stages.find((s) => s.current)?.id ?? null
      view.showDocument(guide, blocks, current)
      for (const b of blocks) {
        if (b.kind === 'modline') {
          const zh = deps.translateLine(b.source)
          if (zh) view.setTranslation(b.id, zh, 'dictionary', [])
          else view.setBlockState(b.id, 'skipped', '词典未收录，保留原文')
        } else if (b.kind === 'verbatim') view.setBlockState(b.id, 'skipped', '原样保留')
      }
      await this.translateStage(current)
    },
    async translateStage(stageId) {
      const gen = generation
      if (!guide) return
      if (stageId) {
        view.showStage(stageId)
        view.setStageState(stageId, 'translating')
      }
      await translate(stageTargets(stageId), false, stageId)
      // 文档已更换，或同一阶段已有新任务接手时，不改阶段状态
      if (gen !== generation || !stageId || active?.stageId === stageId) return
      view.setStageState(stageId, stageTargets(stageId).length ? 'idle' : 'done')
    },
    async retryBlock(id) {
      if (!guide || queued.has(id)) return
      const b = blocks.find((x) => x.id === id && sendable(x))
      if (!b) return
      // 有任务进行中时排队，等它结束再重试，不中止正在翻译的阶段
      if (active) {
        const epoch = queueEpoch
        queued.add(id)
        view.setBlockState(id, 'pending', '排队中，当前任务结束后重试')
        while (active && epoch === queueEpoch) await active.ended
        if (epoch !== queueEpoch) return
        queued.delete(id)
        // 排队期间已被阶段任务译出，不再重复请求
        if (done.has(id)) return
      }
      done.delete(id)
      await translate([b], true, undefined)
    },
    stop() {
      dropQueued()
      if (cancelRun()) view.setBusy(false)
    },
  }
}
