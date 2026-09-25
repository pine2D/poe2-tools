import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachPageLabels } from '../src/content/page-labels'
import { attachTextLayer } from '../src/content/text-layer'

const stops: (() => void)[] = []
const originalUrl = location.href
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  history.replaceState(null, '', originalUrl)
  document.body.innerHTML = ''
})
const intro = `<main><div class="messageBox"><span>Craft of Exile 2</span> is a complete refactor of <span>Craft of Exile</span> aiming to fix the lingering issues of the old site as well as adding every possible crafting methods that were missing.<br><br>The following is a shortlist of what is <span>new</span>. Please consult the <a href="roadmap">Roadmap</a> page to see what I am working on.</div><button>new</button></main>`
it('介绍按页面上下文翻译片段，保留链接、节点身份和原文恢复', () => {
  history.replaceState(null, '', '/whats-new')
  document.body.innerHTML = intro
  const box = document.querySelector('.messageBox') as HTMLElement
  const link = document.querySelector('a') as HTMLAnchorElement
  const markup = box.innerHTML
  const stop = attachTextLayer(document, createLexicon([]))
  stops.push(stop)
  expect(box.textContent).toContain('是对')
  expect(box.textContent).toContain('的全面重构')
  expect(box.textContent).toContain('新增功能')
  expect(document.querySelector('a')).toBe(link)
  expect(link.getAttribute('href')).toBe('roadmap')
  expect(document.querySelector('button')?.textContent).toBe('new')
  stop()
  expect(box.innerHTML).toBe(markup)
})
it('其他页面的同名消息框不采用介绍片段译法', () => {
  history.replaceState(null, '', '/crafting')
  document.body.innerHTML = intro
  stops.push(attachTextLayer(document, createLexicon([])))
  expect(document.querySelector('.messageBox')?.textContent).toContain('is a complete refactor of')
  expect(document.querySelector('.messageBox')?.textContent).not.toContain('新增功能')
})
it('历史导航离开介绍页时，保留节点的介绍译文恢复为原文', () => {
  history.replaceState(null, '', '/whats-new')
  document.body.innerHTML = intro
  stops.push(attachTextLayer(document, createLexicon([])))
  history.replaceState(null, '', '/other')
  window.dispatchEvent(new PopStateEvent('popstate'))
  expect(document.querySelector('.messageBox')?.textContent).toContain('is a complete refactor of')
})

it('介绍页徽标样式支持对照、路由撤销和停止清理，不修改原站节点', async () => {
  history.replaceState(null, '', '/whats-new')
  document.body.innerHTML =
    '<main><div class="layout"><article><li><span class="emulator"></span></li></article></div></main>'
  const html = document.body.innerHTML
  const stop = attachPageLabels(document, true)
  stops.push(stop)
  expect(document.head.querySelector('[data-poe2-l10n="page-labels"]')?.textContent).toContain(
    '制作演练 · Emulator',
  )
  expect(document.body.innerHTML).toBe(html)
  history.replaceState(null, '', '/other')
  window.dispatchEvent(new PopStateEvent('popstate'))
  expect(document.head.querySelector('[data-poe2-l10n="page-labels"]')).toBeNull()
  history.replaceState(null, '', '/whats-new')
  document.body.append(document.createElement('div'))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.head.querySelectorAll('[data-poe2-l10n="page-labels"]')).toHaveLength(1)
  stop()
  expect(document.head.querySelector('[data-poe2-l10n="page-labels"]')).toBeNull()
})
it('原站给现有容器添加介绍类时开始翻译', async () => {
  history.replaceState(null, '', '/whats-new')
  document.body.innerHTML = '<main><div>new</div></main>'
  stops.push(attachTextLayer(document, createLexicon([])))
  const box = document.querySelector('main div') as HTMLElement
  expect(box.textContent).toBe('new')
  box.className = 'messageBox'
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(box.textContent).toBe('新增功能')
})
