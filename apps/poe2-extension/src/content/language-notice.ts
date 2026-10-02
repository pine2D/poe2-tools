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
      const style = doc.createElement('style')
      style.textContent = `
        :host { all: initial; position: fixed; left: 16px; bottom: 16px; z-index: 1000; display: block; width: min(360px, calc(100vw - 32px)); color: #f0f3f6; font: 14px/1.6 sans-serif; }
        section { padding: 14px 16px; background: #20252d; border: 1px solid #8499ae; border-radius: 8px; box-shadow: 0 4px 18px #0006; }
        header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        p { margin: 8px 0 0; }
        button { color: inherit; background: transparent; border: 1px solid #8499ae; border-radius: 4px; cursor: pointer; padding: 2px 8px; font: inherit; }
        button:focus-visible { outline: 2px solid #b6dac4; outline-offset: 2px; }
      `
      const section = doc.createElement('section')
      const header = doc.createElement('header')
      const title = doc.createElement('strong')
      title.textContent = 'PoE2 中文助手'
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
      header.append(title, close)
      section.append(header, text)
      shadow.append(style, section)
      doc.body.append(host)
    },
  }
}
