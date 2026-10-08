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

export function createController(deps: ControllerDeps): Controller {
  const { view } = deps
  let guide: GuideDocument | null = null
  let blocks: PreparedBlock[] = []
  let dictHash = ''
  const done = new Set<string>()
  let abort: AbortController | null = null
  let tokens = { prompt: 0, completion: 0 }
  let cacheHits = 0
  const usageText = (engine: EngineHandle) =>
    `本次约 ${tokens.prompt}+${tokens.completion} tokens · ${engine.costText(tokens.prompt, tokens.completion)} · 缓存命中 ${cacheHits} 段`

  const keyOf = (b: PreparedBlock, e: EngineHandle) =>
    cacheKey({
      text: b.source,
      game: 'poe2',
      locale: 'zh-CN',
      dictHash,
      terms: b.terms,
      provider: e.provider,
      model: e.model,
      params: e.params,
      promptVersion: PROMPT_VERSION,
    })

  async function translate(targets: PreparedBlock[], force: boolean): Promise<void> {
    const engine = await deps.engine()
    if (!engine) {
      view.setBanner('setup', '配置翻译服务后即可整段翻译；现在显示原文与术语标注。')
      return
    }
    abort?.abort()
    const controller = new AbortController()
    abort = controller
    view.setBusy(true)
    try {
      const pending: PreparedBlock[] = []
      const keys = new Map<string, string>()
      for (const b of targets) {
        const key = await keyOf(b, engine)
        keys.set(b.id, key)
        const hit = force ? null : await deps.store.getCached(key)
        if (hit) {
          view.setTranslation(b.id, hit.text, 'cache', hit.issues)
          done.add(b.id)
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
      const prefs = await deps.prefs()
      if (
        chars > prefs.charLimit &&
        !(await view.ask(
          `本次要发送约 ${chars} 个英文字符，超过设定的 ${prefs.charLimit}，继续吗？`,
          '继续翻译',
        ))
      ) {
        view.setBanner('info', '已取消发送。可以切换阶段、选中部分文字，或在设置里调高上限。')
        return
      }
      for (const chunk of chunkBlocks(pending)) {
        if (controller.signal.aborted) break
        for (const b of chunk) view.setBlockState(b.id, 'pending')
        const splitter = createTagSplitter(
          chunk.map((b) => b.id),
          (id, raw) => {
            const b = chunk.find((x) => x.id === id)
            if (!b) return
            const restored = restore(raw, b.tokens)
            const issues = checkTranslation(b, restored.text, restored, null)
            view.setTranslation(id, restored.text, 'engine', issues)
            done.add(id)
            const key = keys.get(id)
            if (key)
              void deps.store.putCached({ hash: key, text: restored.text, issues }).catch(() => {})
          },
        )
        const messages = buildMessages(chunk, deps.random())
        try {
          const result = await engine.runner.run(
            messages,
            (d) => splitter.push(d),
            controller.signal,
          )
          const usage = result.usage ?? {
            prompt: estimateTokens(messages.map((m) => m.content).join('')),
            completion: 0,
          }
          tokens = {
            prompt: tokens.prompt + usage.prompt,
            completion: tokens.completion + usage.completion,
          }
          view.setUsage(usageText(engine))
          for (const id of splitter.end())
            view.setBlockState(
              id,
              'missing',
              result.finishReason === 'length' ? '输出被截断，可单独重试' : undefined,
            )
        } catch (error) {
          const kind = error instanceof EngineError ? error.kind : 'network'
          const unfinished = chunk.filter((b) => !done.has(b.id))
          if (kind === 'aborted') {
            for (const b of pending.filter((x) => !done.has(x.id))) view.setBlockState(b.id, 'idle')
            break
          }
          const message = error instanceof Error ? error.message : '翻译失败'
          for (const b of unfinished) view.setBlockState(b.id, 'failed', message)
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
      if (abort === controller) abort = null
      view.setBusy(false)
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
      done.clear()
      tokens = { prompt: 0, completion: 0 }
      cacheHits = 0
      view.setBanner('none', '')
      let raw: unknown
      try {
        raw = await deps.extract()
      } catch {
        view.setBanner('error', '页面已更换或无法读取，请在攻略页重新点扩展图标。')
        return
      }
      const result = parseExtractResult(raw)
      if (!result) {
        view.setBanner('error', '读取结果无效，请刷新攻略页后重试。')
        return
      }
      if (!result.ok) {
        view.setBanner('error', REASONS[result.reason])
        return
      }
      guide = result.doc
      const dict = await deps.dictionary()
      dictHash = dict.hash
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
      if (stageId) {
        view.showStage(stageId)
        view.setStageState(stageId, 'translating')
      }
      await translate(stageTargets(stageId), false)
      if (stageId) view.setStageState(stageId, stageTargets(stageId).length ? 'idle' : 'done')
    },
    async retryBlock(id) {
      const b = blocks.find((x) => x.id === id && sendable(x))
      if (!b) return
      done.delete(id)
      await translate([b], true)
    },
    stop() {
      abort?.abort()
    },
  }
}
