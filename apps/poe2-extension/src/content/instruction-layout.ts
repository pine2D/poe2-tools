// 原站横向 flex 会把多段中文压成竖排；使用文字行排版，保留键鼠节点。
export function attachInstructionLayout(doc: Document): () => void {
  const style = doc.createElement('style')
  style.dataset.poe2L10n = 'instruction-layout'
  style.textContent = `
    #instructions > .flex > .flex { display: block; line-height: 1.8; overflow-wrap: anywhere; }
    #instructions .keyboardKey { display: inline-block; white-space: nowrap; }
    #instructions img { display: inline-block; vertical-align: middle; }
  `
  doc.head.append(style)
  return () => style.remove()
}
