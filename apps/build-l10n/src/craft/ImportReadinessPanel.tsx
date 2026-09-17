import type { ItemDocument, ItemInspection } from '@poe2-tools/item-core'

interface Props {
  item: ItemDocument
  inspection: ItemInspection
  dirty: boolean
  dictionaryState: 'loading' | 'ready' | 'error'
  onParse: () => void
  onLocate: (line: number | null, candidate: boolean) => void
  onOpenEntry: () => void
}

export function ImportReadinessPanel({
  item,
  inspection,
  dirty,
  dictionaryState,
  onParse,
  onLocate,
  onOpenEntry,
}: Props) {
  // 同一原文行只提供一个定位动作，同时保留不同诊断原因。
  const issues = new Map<number | null, { messages: Set<string>; candidate: boolean }>()
  const add = (line: number | null, message: string, candidate = false) => {
    const issue = issues.get(line) ?? { messages: new Set<string>(), candidate: false }
    issue.messages.add(message)
    issue.candidate ||= candidate
    issues.set(line, issue)
  }
  if (!dirty) {
    for (const diagnostic of item.diagnostics) add(diagnostic.line, diagnostic.message)
    for (const block of item.blocks) {
      if (block.kind !== 'unknown') continue
      for (const source of block.lines) {
        if (!issues.has(source.line)) add(source.line, '未知区块原文待核对')
      }
    }
    if (dictionaryState === 'ready') {
      const unresolved = (
        line: number | null,
        label: string,
        resolution: ItemInspection['base'],
      ) => {
        if (resolution.english !== null) return
        const candidate = resolution.candidates.length > 1
        add(line, `${label}${candidate ? '有多个候选，请选择' : '未识别，请核对原文'}`, candidate)
      }
      unresolved(item.nameLines.at(-1)?.line ?? null, '基底', inspection.base)
      for (const mod of inspection.mods) {
        for (const { source, resolution } of mod.stats) unresolved(source.line, '词缀', resolution)
      }
      for (const [label, entries] of [
        ['符文', inspection.runes],
        ['技能', inspection.skills],
      ] as const) {
        for (const { source, resolution } of entries) {
          if (
            (item.locale === 'en' &&
              resolution.english === null &&
              resolution.candidates.length < 2) ||
            resolution.candidates.some((candidate) => candidate.id.startsWith('skill.english:'))
          ) {
            add(source.line, `英文${label}原文待目录核对`)
          } else unresolved(source.line, label, resolution)
        }
      }
    }
  }
  return (
    <section className="import-readiness" aria-label="文本核对">
      <h3>文本核对</h3>
      {dirty ? (
        <>
          <p>原文已修改，重新解析后再核对当前行。</p>
          <button type="button" onClick={onParse}>
            重新解析装备
          </button>
        </>
      ) : (
        <>
          {inspection.comparisonOnly && <p>此装备仅供对照：{inspection.comparisonReason}</p>}
          {dictionaryState !== 'ready' && (
            <p>
              {dictionaryState === 'loading'
                ? '词典加载中，文本识别待完成。'
                : '词典加载失败，请重试英文词典后核对文本。'}
            </p>
          )}
          {issues.size > 0 ? (
            <ul>
              {[...issues].map(([line, issue]) => (
                <li key={line ?? 'document'}>
                  <span>
                    {line === null ? '' : `第 ${line} 行：`}
                    {[...issue.messages].join('；')}
                  </span>{' '}
                  <button type="button" onClick={() => onLocate(line, issue.candidate)}>
                    {line === null
                      ? '定位装备原文'
                      : issue.candidate
                        ? `选择第 ${line} 行候选`
                        : `定位第 ${line} 行原文`}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            dictionaryState === 'ready' && (
              <p>
                {inspection.comparisonOnly
                  ? '文本识别已完成，此装备仍仅供对照。'
                  : '文本识别已完成，可继续核对制作起点；制作支持范围以起点核对结果为准。'}
              </p>
            )
          )}
          {!inspection.comparisonOnly && (
            <button type="button" onClick={onOpenEntry}>
              前往制作起点核对
            </button>
          )}
        </>
      )}
    </section>
  )
}
