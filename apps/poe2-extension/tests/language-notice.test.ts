import { afterEach, expect, it } from 'vitest'
import { pageStatus, supportsPage } from '../src/adapters/coe-beta/context'
import { createLanguageNotice } from '../src/content/language-notice'

const url = 'https://beta.craftofexile.com/'
afterEach(() => {
  document.body.innerHTML = ''
})
function context(key: string) {
  document.body.innerHTML = `<div id="gameToggler"><a class="poe2 selected"></a></div><div id="languageToggler"><div class="list"><div key="${key}" class="active"></div></div></div>`
}
it('区分受支持、需要英文、未知及不支持页面，不推断 URL 中的游戏模式', () => {
  context('us')
  expect(pageStatus(document, url)).toBe('supported')
  expect(supportsPage(document, url)).toBe(true)
  context('cn')
  expect(pageStatus(document, url)).toBe('english-required')
  expect(supportsPage(document, url)).toBe(false)
  expect(pageStatus(document, 'https://www.craftofexile.com/')).toBe('unsupported')
  document.querySelector('#gameToggler a')?.setAttribute('class', 'poe1 selected')
  expect(pageStatus(document, url)).toBe('unsupported')
  document.body.innerHTML = ''
  expect(pageStatus(document, `${url}?game=poe2`)).toBe('unknown')
  context('')
  expect(pageStatus(document, url)).toBe('unknown')
})
it('语言提示可关闭且不自动切换原站，离开非英文状态后允许再次提示', () => {
  context('cn')
  const notice = createLanguageNotice(document)
  notice.update(true)
  notice.update(true)
  expect(document.querySelectorAll('[data-poe2-l10n="language-notice"]')).toHaveLength(1)
  const host = document.querySelector('[data-poe2-l10n="language-notice"]') as HTMLElement
  expect(host.shadowRoot?.textContent).toContain('English')
  host.shadowRoot?.querySelector('button')?.click()
  notice.update(true)
  expect(document.querySelector('[data-poe2-l10n="language-notice"]')).toBeNull()
  expect(document.querySelector('#languageToggler .active')?.getAttribute('key')).toBe('cn')
  notice.update(false)
  notice.update(true)
  expect(document.querySelector('[data-poe2-l10n="language-notice"]')).not.toBeNull()
  notice.update(false)
  expect(document.querySelector('[data-poe2-l10n="language-notice"]')).toBeNull()
})

it('语言提示条首行：gem + “PoE2 中文助手” + “· 非官方”，产品名只出现一次，右侧“关闭”；样式来自共享表（spec §6.9）', () => {
  context('cn')
  const notice = createLanguageNotice(document)
  notice.update(true)
  const host = document.querySelector('[data-poe2-l10n="language-notice"]') as HTMLElement
  const root = host.shadowRoot as ShadowRoot
  const header = root.querySelector('header') as HTMLElement
  expect(header.querySelector('svg.gem')?.getAttribute('aria-hidden')).toBe('true')
  expect(header.textContent).toBe('PoE2 中文助手· 非官方关闭')
  expect(root.textContent?.split('PoE2 中文助手').length).toBe(2)
  expect(header.lastElementChild?.textContent).toBe('关闭')
  expect(root.querySelector('style')).toBeNull()
  expect(root.adoptedStyleSheets).toHaveLength(1)
  notice.update(false)
})
