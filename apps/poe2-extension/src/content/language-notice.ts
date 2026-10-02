import { adoptL1, createGem } from './l1'

export function createLanguageNotice(doc: Document) {
  let host: HTMLElement | null = null
  let dismissed = false
  return {
    update(required: boolean) {
      if (!required) {
        host?.remove()
        host = null
        dismissed = false
        return
      }
      if (dismissed || host?.isConnected) return
      host = doc.createElement('aside')
      host.dataset.poe2L10n = 'language-notice'
      host.setAttribute('role', 'status')
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
        dismissed = true
        host?.remove()
        host = null
      })
      const text = doc.createElement('p')
      text.textContent = '请将右上角原站语言切换为 English，即可使用简体显示、中文搜索和装备转换。'
      header.append(createGem(doc, 16), title, by, close)
      section.append(header, text)
      shadow.append(section)
      doc.body.append(host)
    },
  }
}
