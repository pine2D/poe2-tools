/** 按实际文字布局把选区滚入视野；不改变原文、选区或输入框样式。 */
export function revealTextareaSelection(input: HTMLTextAreaElement): void {
  const doc = input.ownerDocument
  const view = doc.defaultView
  if (!view || input.clientWidth === 0 || input.clientHeight === 0) return
  const style = view.getComputedStyle(input)
  const measure = doc.createElement('textarea')
  measure.setAttribute('aria-hidden', 'true')
  measure.tabIndex = -1
  measure.wrap = input.wrap
  // 使用已计算样式，避免临时元素缺少原站 ID 规则而测出不同的折行。
  for (const property of [
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'font-stretch',
    'font-variant',
    'line-height',
    'letter-spacing',
    'word-spacing',
    'text-indent',
    'text-transform',
    'tab-size',
    'direction',
    'white-space',
    'word-break',
    'overflow-wrap',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
  ])
    measure.style.setProperty(property, style.getPropertyValue(property))
  Object.assign(measure.style, {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    border: '0',
    height: '0',
    minHeight: '0',
    maxHeight: 'none',
    // clientWidth 已扣除原输入框的滚动条；测量框不再留出第二条滚动条。
    width: `${input.clientWidth}px`,
    overflow: 'hidden',
  })
  input.after(measure)
  try {
    // 零宽字符让空行也产生行高；相减抵消内边距与 normal 行高的不确定性。
    measure.value = '\u200b'
    const first = measure.scrollHeight
    measure.value = `${input.value.slice(0, input.selectionStart)}\u200b`
    const top = measure.scrollHeight - first + Number.parseFloat(style.paddingTop)
    measure.value = `${input.value.slice(0, input.selectionEnd)}\u200b`
    const bottom = measure.scrollHeight - Number.parseFloat(style.paddingBottom)
    // 能容纳时居中；单行折成很长的一段时从该行开头显示。
    const offset = top - Math.max(0, (input.clientHeight - (bottom - top)) / 2)
    input.scrollTop = Math.max(0, Math.min(input.scrollHeight - input.clientHeight, offset))
    input.scrollLeft = 0
  } finally {
    measure.remove()
  }
}
