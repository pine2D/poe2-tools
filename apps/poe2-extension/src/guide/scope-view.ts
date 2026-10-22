import type { GuideBlock, GuideDocument } from '@poe2-tools/guide-core'
import { el } from './dom'

/** 章节是预览选择单元；语境由最终选中的原始块重新准备。 */
export function scopeChapters(blocks: readonly GuideBlock[]) {
  const groups: { title: string; level: number; ids: string[] }[] = []
  for (const b of blocks) {
    if (b.kind === 'heading' || !groups.length)
      groups.push({
        title: b.kind === 'heading' ? b.text : '正文',
        level: b.context?.headingLevel ?? 1,
        ids: [],
      })
    groups.at(-1)?.ids.push(b.id)
  }
  return groups
}

export function chapterPicker(
  doc: Document,
  guide: GuideDocument,
  stage: string | null,
  selected: readonly string[],
  change: (ids: string[]) => void,
) {
  const blocks = guide.blocks.filter((b) => stage === null || !b.stageId || b.stageId === stage)
  const groups = scopeChapters(blocks)
  const parents: { title: string; level: number }[] = []
  const pathsByTitle = new Map<string, string[][]>()
  const entries = groups.map((group) => {
    while (parents.length && (parents.at(-1)?.level ?? 0) >= group.level) parents.pop()
    const path = [...parents.map((parent) => parent.title), group.title]
    const matches = pathsByTitle.get(group.title) ?? []
    matches.push(path)
    pathsByTitle.set(group.title, matches)
    parents.push(group)
    return { group, path }
  })
  const chosen = new Set(selected)
  const details = el(doc, 'div', { class: 'guide-chapters' })
  const label = el(doc, 'p', { class: 'chapter-label' }, `章节 · ${groups.length} 节`)
  const checks: { input: HTMLInputElement; ids: string[] }[] = []
  const emit = () => change(checks.flatMap((c) => (c.input.checked ? c.ids : [])))
  for (const { group, path } of entries) {
    const matches = pathsByTitle.get(group.title) ?? []
    let depth = matches.length > 1 ? 2 : 1
    // 重名时只保留足以区分的父路径；父级也重名才继续向上展开。
    while (
      depth < path.length &&
      matches.some(
        (other) =>
          other !== path &&
          JSON.stringify(other.slice(-depth)) === JSON.stringify(path.slice(-depth)),
      )
    )
      depth++
    const title = path.slice(-depth).join(' › ')
    const input = el(doc, 'input', { type: 'checkbox', class: 'chapter-check' })
    input.checked = group.ids.every((id) => chosen.has(id))
    input.indeterminate = !input.checked && group.ids.some((id) => chosen.has(id))
    input.addEventListener('change', emit)
    const row = el(
      doc,
      'label',
      { class: 'guide-chapter' },
      input,
      `${title} · ${group.ids.length} 段`,
    )
    if (title !== path.join(' › ')) {
      row.title = path.join(' › ')
      input.setAttribute('aria-description', `完整章节路径：${row.title}`)
    }
    row.style.paddingInlineStart = `calc(${Math.min(group.level - 1, 3)} * var(--sp-2))`
    checks.push({ input, ids: group.ids })
    details.append(row)
  }
  const actions = el(doc, 'div', { class: 'chapter-actions' })
  for (const [label, value] of [
    ['全选', true],
    ['全不选', false],
  ] as const) {
    const button = el(doc, 'button', { type: 'button', class: 'pt-btn pt-btn--quiet' }, label)
    button.addEventListener('click', () => {
      for (const c of checks) c.input.checked = value
      emit()
    })
    actions.append(button)
  }
  details.prepend(el(doc, 'div', { class: 'chapter-heading' }, label, actions))
  return details
}
