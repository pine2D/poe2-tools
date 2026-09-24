import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachStatLayer } from '../src/content/stat-layer'

const lex = createLexicon([
  {
    id: 'r',
    en: '#% to Lightning Resistance',
    zh: '闪电抗性 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
])
let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it('分段词缀保留原站文本、关键词节点和监听，仅叠加中文', async () => {
  document.body.innerHTML =
    '<main><div><span class="stat">+#% to <span id="keyword">Lightning Resistance</span></span></div></main>'
  const stat = document.querySelector('.stat') as HTMLElement
  const keyword = document.querySelector('#keyword')
  stop = attachStatLayer(document, lex)
  expect(stat.textContent).toBe('+#% to Lightning Resistance')
  expect(document.querySelector('#keyword')).toBe(keyword)
  expect(document.querySelector('[data-poe2-l10n="stat"]')?.shadowRoot?.textContent).toContain(
    '闪电抗性 +#%',
  )
  const textNode = stat.firstChild as Text
  textNode.textContent = '+20% to '
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('[data-poe2-l10n="stat"]')?.shadowRoot?.textContent).toContain(
    '闪电抗性 +20%',
  )
  stop()
  expect(document.querySelector('[data-poe2-l10n="stat"]')).toBeNull()
  expect(stat.textContent).toBe('+20% to Lightning Resistance')
})
it('仍连接的词缀移动到另一容器时，中文层随行且关闭可清理', async () => {
  document.body.innerHTML =
    '<main><div id="a"><span class="stat">+18% to Lightning Resistance</span></div><div id="b"></div></main>'
  const stat = document.querySelector('.stat') as HTMLElement
  stop = attachStatLayer(document, lex)
  document.querySelector('#b')?.append(stat)
  await new Promise((r) => setTimeout(r, 30))
  expect(document.querySelector('#a [data-poe2-l10n]')).toBeNull()
  expect(stat.nextElementSibling?.shadowRoot?.textContent).toContain('闪电抗性 +18%')
  stat.textContent = '+20% to Lightning Resistance'
  await new Promise((r) => setTimeout(r, 30))
  expect(stat.nextElementSibling?.shadowRoot?.textContent).toContain('闪电抗性 +20%')
  stop()
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
})
