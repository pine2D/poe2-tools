import type { GuideBlock } from '@poe2-tools/guide-core'
import { type SelectionResult, selectionDocument } from '../selection/protocol'
import { type ControllerDeps, createController } from './controller'

type SelectionDeps = Omit<ControllerDeps, 'extract' | 'page' | 'view'>
/** 无 DOM 的单段入口。沿用完整准备、词典路由、缓存、接纳、用量与取消机制。 */
export async function translateSelection(
  block: GuideBlock,
  deps: SelectionDeps,
  signal: AbortSignal,
): Promise<SelectionResult> {
  const outcome: { result: Extract<SelectionResult, { ok: true }> | null } = { result: null }
  let setup = false,
    usage = '',
    error = '没有收到合格译文，请重试。'
  const noop = () => {}
  const controller = createController({
    ...deps,
    extract: async () => ({ ok: true, doc: selectionDocument(block) }),
    view: {
      showDocument: noop,
      clearDocument: noop,
      setStageState: noop,
      setBusy: noop,
      setReady: noop,
      setProgress: noop,
      setPageState: noop,
      setTranslation: (_, text, origin, issues) => {
        outcome.result = { ok: true, text, origin, issues, usage }
      },
      setBlockState: (_, state, message) => {
        if (state === 'skipped')
          outcome.result = {
            ok: true,
            text: block.text,
            origin: 'preserved',
            issues: [],
            usage,
            ...(message ? { message } : {}),
          }
        if (state === 'failed' || state === 'missing')
          error = message ?? '模型未返回合格译文，请重试。'
      },
      setBanner: (kind, message) => {
        if (kind === 'setup') {
          setup = true
          error = '请先在扩展的“翻译此页 → 设置”中配置翻译服务。'
        } else if (kind === 'error' || kind === 'info') error = message
      },
      setUsage: (text) => {
        usage = text
      },
      ask: async () => {
        error = '选中文字超过设置的字符上限，请缩小选区或在侧栏设置中调整。'
        return false
      },
    },
  })
  const cancel = () => controller.stop()
  signal.addEventListener('abort', cancel, { once: true })
  try {
    if (!signal.aborted) await controller.start('selection')
    if (!signal.aborted && !outcome.result && !setup) await controller.begin()
    if (signal.aborted) return { ok: false, message: '已取消翻译。' }
    return outcome.result ? { ...outcome.result, usage } : { ok: false, message: error }
  } finally {
    signal.removeEventListener('abort', cancel)
    controller.stop()
  }
}
