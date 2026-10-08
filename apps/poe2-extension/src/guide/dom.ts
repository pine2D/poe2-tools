export type Child = Node | string | null | undefined | false

// 只用 createElement + textContent 构造界面，任何外部文本都不会被当作 HTML 解析。
export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    if (name === 'hidden') node.hidden = value === true
    else node.setAttribute(name, value === true ? '' : value)
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.append(typeof child === 'string' ? doc.createTextNode(child) : child)
  }
  return node
}
