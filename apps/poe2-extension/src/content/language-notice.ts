import { adoptL1, createGem } from './l1'

interface NoticeOptions {
  /** 提示显示期间持有 L1 衬线子集（标题与“关闭”用固定子集）；返回释放函数 */
  holdFont?: () => () => void
}

export function createLanguageNotice(doc: Document, options: NoticeOptions = {}) {
  let host: HTMLElement | null = null
  let dismissed = false
  let releaseFont = () => {}
  // 焦点进入提示前所在的原站元素；键盘关闭后归还，避免落到 body（B3-08）
  let previous: HTMLElement | null = null
  const remove = () => {
    host?.remove()
    host = null
    previous = null
    releaseFont()
    releaseFont = () => {}
  }
  return {
    update(required: boolean) {
      if (!required) {
        remove()
        dismissed = false
        return
      }
      if (dismissed || host?.isConnected) return
      // 宿主被原站移除后重建：先释放旧宿主持有的字体引用，计数才能回到 0
      remove()
      host = doc.createElement('aside')
      host.dataset.poe2L10n = 'language-notice'
      host.setAttribute('aria-label', 'PoE2 中文助手语言提示')
      host.addEventListener('focusin', (event) => {
        const from = event.relatedTarget
        if (from instanceof HTMLElement && !host?.contains(from) && from !== host) previous = from
      })
      const shadow = host.attachShadow({ mode: 'open' })
      adoptL1(shadow)
      const section = doc.createElement('section')
      section.className = 'notice'
      const header = doc.createElement('header')
      const title = doc.createElement('strong')
      title.textContent = 'PoE2 中文助手'
      const by = doc.createElement('span')
      by.className = 'by'
      by.textContent = '· 非官方'
      const close = doc.createElement('button')
      close.type = 'button'
      close.textContent = '关闭'
      close.setAttribute('aria-label', '关闭语言提示')
      close.addEventListener('click', () => {
        const hadFocus = shadow.activeElement === close
        const back = previous
        dismissed = true
        remove()
        if (hadFocus && back?.isConnected) back.focus()
      })
      // 只有提示正文是 live region；“关闭”按钮不放进 status 里（B3-08）
      const text = doc.createElement('p')
      text.setAttribute('role', 'status')
      text.textContent = '请将右上角原站语言切换为 English，即可使用简体显示、中文搜索和装备转换。'
      header.append(createGem(doc, 16), title, by, close)
      section.append(header, text)
      shadow.append(section)
      doc.body.append(host)
      releaseFont = options.holdFont?.() ?? (() => {})
    },
  }
}
