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
  const chosen = new Set(selected)
  const details = el(doc, 'div', { class: 'guide-chapters' })
  details.append(el(doc, 'p', { class: 'chapter-label' }, `选择章节 · ${groups.length} 节`))
  const checks: { input: HTMLInputElement; ids: string[] }[] = []
  const emit = () => change(checks.flatMap((c) => (c.input.checked ? c.ids : [])))
  for (const group of groups) {
    const input = el(doc, 'input', { type: 'checkbox', class: 'chapter-check' })
    input.checked = group.ids.every((id) => chosen.has(id))
    input.indeterminate = !input.checked && group.ids.some((id) => chosen.has(id))
    input.addEventListener('change', emit)
    const row = el(
      doc,
      'label',
      { class: 'guide-chapter' },
      input,
      `${group.title} · ${group.ids.length} 段`,
    )
    row.style.paddingInlineStart = `${Math.min(group.level - 1, 3) * 10}px`
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
  details.append(actions)
  return details
}
