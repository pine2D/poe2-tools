// 侧栏文件列表（spec §5.12 文件项）：构筑名为主、文件名为辅；当前项由选择按钮上的 aria-current 表达（R6）。
// 看板同时展示多个阶段时（stages）没有单选语义，不写 aria-current（2026-10-03 修订 1）；
// 此时点当前构筑组里的文件进入该份的逐项核对。
// 状态：有待核对项时“⚠ 待核对 n”（n 与信息行同一口径，含名称类，B1），否则“✓ 词缀 x/y”；
// “待词典就绪”“解析失败”沿用改版前。
// B4-15：翻译结果就绪后按构筑分组（groups，来自 fileGroups），组标题是构筑名，组内按看板阶段顺序列文件、
// 显示阶段名；词典未就绪时无从归组，保持平铺。
import { useId } from 'react'
import { Icon } from '../../../shared/components/Icon'
import type { SourceFile, TranslateResult } from '../translate/runTranslation'
import type { FileGroup } from './fileGroups'

export interface FileListProps {
  sources: readonly SourceFile[]
  results: readonly TranslateResult[]
  /** 已解析文件的待核对条数（collectMisses 的条数，含基底名、传奇名未收录），键为文件 id */
  misses: ReadonlyMap<string, number>
  selectedId: string | null
  /** 看板正展示多个阶段：不标单份当前项 */
  stages?: boolean | undefined
  /** 按构筑分组；null 或缺省时平铺 */
  groups?: readonly FileGroup[] | null | undefined
  /** 看板当前展示的构筑 */
  currentKey?: string | undefined
  onSelect(id: string): void
  onRemove(id: string): void
}

function FileStatus({ result, misses }: { result: TranslateResult | undefined; misses: number }) {
  if (result === undefined) {
    return (
      <span className="app__file-note">
        <Icon name="refresh" size={15} />
        待词典就绪
      </span>
    )
  }
  if (!result.ok) {
    return (
      <span className="app__file-note">
        <Icon name="warning" size={15} />
        解析失败
      </span>
    )
  }
  if (misses > 0) {
    return (
      <span className="pt-file__warn">
        <Icon name="warning" size={15} />
        {`待核对 ${misses}`}
      </span>
    )
  }
  const { modTranslated, modCandidates } = result.file.report
  return (
    <span className="pt-file__ok">
      <Icon name="check" size={15} />
      {`词缀 ${modTranslated}/${modCandidates}`}
    </span>
  )
}

interface FileItemProps {
  source: SourceFile
  /** 同名文件的区分序号取导入顺序 */
  label: string
  result: TranslateResult | undefined
  misses: number
  /** 分组时可见名称用看板阶段名；平铺时用构筑名 */
  visible: string | null
  current: boolean
  /** 点击进入该份的逐项核对（看板正并排展示它所在的构筑） */
  review: boolean
  onSelect(id: string): void
  onRemove(id: string): void
}

// 构筑名（文件里的 name）；缺失或为空时退到文件名
function titleOf(source: SourceFile, result: TranslateResult | undefined): string {
  const name = result?.ok ? result.file.input.name : undefined
  return name === undefined || name === '' ? source.name : name
}

function FileItem({
  source,
  label,
  result,
  misses,
  visible,
  current,
  review,
  onSelect,
  onRemove,
}: FileItemProps) {
  const title = titleOf(source, result)
  // 可访问名称以可见文字开头（WCAG 2.5.3）：有构筑名时写“构筑名，文件名”，否则只写文件名；
  // 分组时可见的阶段名是构筑名“ - ”之前的部分，仍是可访问名称的开头
  const name = title !== source.name ? `${title}，${label}` : label
  return (
    <li className="pt-file">
      <button
        type="button"
        className="pt-file__pick"
        data-file-id={source.id}
        title={review ? `逐项核对 ${title} · ${label}` : `${title} · ${label}`}
        aria-label={name}
        aria-current={current ? 'true' : undefined}
        onClick={() => onSelect(source.id)}
      >
        {visible !== null && <span className="pt-file__name">{visible}</span>}
        <span className="pt-file__orig">{label}</span>
      </button>
      <span className="pt-file__status">
        <FileStatus result={result} misses={misses} />
      </span>
      <button
        type="button"
        className="pt-file__remove"
        aria-label={`移除 ${label}`}
        onClick={() => onRemove(source.id)}
      >
        <Icon name="close" size={18} />
      </button>
      {result !== undefined && !result.ok && <p className="app__file-error">{result.error}</p>}
    </li>
  )
}

export function FileList({
  sources,
  results,
  misses,
  selectedId,
  stages = false,
  groups = null,
  currentKey,
  onSelect,
  onRemove,
}: FileListProps) {
  const idBase = useId()
  if (sources.length === 0) return null
  const labelOf = (source: SourceFile) => {
    const index = sources.indexOf(source)
    const duplicate = sources.filter((item) => item.name === source.name).length > 1
    return duplicate ? `${source.name}（第 ${index + 1} 份）` : source.name
  }
  const resultOf = (id: string) => results.find((item) => item.id === id)
  if (groups === null) {
    return (
      <ul className="app__files" aria-label="已导入文件">
        {sources.map((source) => {
          const result = resultOf(source.id)
          return (
            <FileItem
              key={source.id}
              source={source}
              label={labelOf(source)}
              result={result}
              misses={misses.get(source.id) ?? 0}
              visible={titleOf(source, result)}
              current={!stages && source.id === selectedId}
              review={stages}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          )
        })}
      </ul>
    )
  }
  return (
    <ul className="app__groups" aria-label="已导入文件">
      {groups.map((group, at) => {
        const current = group.kind === 'series' && group.key === currentKey
        const titleId = `${idBase}-g${at}`
        const metaId = `${titleId}-meta`
        const count = group.items.length
        const meta =
          group.kind === 'failed'
            ? `${count} 个文件 · 不导出`
            : count > 1
              ? `${count} 个阶段`
              : '1 个文件'
        return (
          <li
            key={group.key}
            className={group.kind === 'failed' ? 'app__group app__group--failed' : 'app__group'}
            data-current={current ? 'true' : undefined}
          >
            <p className="app__group-h">
              <span
                id={titleId}
                className="app__group-title"
                title={group.title}
                data-user-text={group.kind === 'series' ? '' : undefined}
              >
                {group.title}
              </span>
              <span id={metaId} className="app__group-meta">
                {meta}
              </span>
            </p>
            <ul className="app__files app__files--group" aria-labelledby={`${titleId} ${metaId}`}>
              {group.items.map((item) => {
                const { source, stage } = item
                const label = labelOf(source)
                return (
                  <FileItem
                    key={source.id}
                    source={source}
                    label={label}
                    result={resultOf(source.id)}
                    misses={misses.get(source.id) ?? 0}
                    visible={stage === null || stage === source.name ? null : stage}
                    current={!(stages && current) && source.id === selectedId}
                    review={stages && current}
                    onSelect={onSelect}
                    onRemove={onRemove}
                  />
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
