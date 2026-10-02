import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachStatLayer } from '../src/content/stat-layer'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it('属性中文叠加不污染原站读取与复制，数字更新和停用保留最新英文', async () => {
  document.body.innerHTML =
    '<main><div class="item"><div class="property itemProperty"><label><span id="Critical" class="keyword">Critical Hit</span> Chance:</label><div>5.00%</div></div><div class="property"><label>Attacks per Second:</label><div id="speed">1.20</div></div></div></main>'
  const item = document.querySelector('.item') as HTMLElement
  const original = item.textContent
  const keyword = document.querySelector('#Critical')
  const lex = createLexicon([])
  const text = attachTextLayer(document, lex)
  const stats = attachStatLayer(document, lex)
  stop = () => {
    text()
    stats()
  }
  expect(item.textContent).toBe(original)
  expect(document.querySelector('#Critical')).toBe(keyword)
  const hosts = Array.from(item.querySelectorAll('[data-poe2-l10n]'))
  expect(hosts[0]?.shadowRoot?.textContent).toBe('暴击 几率： 5.00%')
  expect(hosts.map((h) => h.shadowRoot?.textContent).join(' ')).toContain('每秒攻击次数')
  const speed = document.querySelector('#speed') as HTMLElement
  speed.textContent = '1.35'
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(item.textContent).toContain('Attacks per Second:1.35')
  expect(
    Array.from(item.querySelectorAll('[data-poe2-l10n]'))
      .map((h) => h.shadowRoot?.textContent)
      .join(' '),
  ).toContain('1.35')
  stop()
  expect(item.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(item.textContent).toContain('Attacks per Second:1.35')
})
