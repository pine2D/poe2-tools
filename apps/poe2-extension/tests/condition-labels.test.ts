import { createLexicon, type Term } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import ui from '../../../data/l10n/coe-beta/ui.zh-CN.json'
import { searchCandidates } from '../src/adapters/coe-beta/search'
import { attachTextLayer } from '../src/content/text-layer'

let stop = () => {}
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it('实际词典翻译条件标签并支持空余前缀位搜索，保留原站身份与英文筛选属性', () => {
  const terms: Term[] = Object.entries(ui.entries).map(([en, zh]) => ({
    id: en,
    en,
    zh,
    domain: 'ui',
    source: 'manual',
    version: 'test',
  }))
  const lex = createLexicon(terms)
  document.body.innerHTML = `<main><div id="calculatorZone"><div class="requirements"><div class="dropdown"><div class="editing"><input type="text"></div><ul>
    <li value="77" search="suffix+#% to cold resistance"><div class="type">Suffix</div><span class="stat">+#% to Cold Resistance</span></li>
    <li value="special:open-prefix" search="metaopen prefix"><div class="type">Meta</div><span>Open Prefix</span></li>
    <li value="77_1001" search="essencesuffix+#% to cold resistance"><div class="influence"><img src="essence.webp">Essence</div><div class="type">Suffix</div></li>
  </ul></div></div></div></main>`
  const original = document.body.innerHTML
  const rows = [...document.querySelectorAll('li')]
  const image = document.querySelector('img')
  stop = attachTextLayer(document, lex)
  expect(rows[0]?.querySelector('.type')?.textContent).toBe('后缀')
  expect(rows[1]?.textContent).toBe('特殊条件空余前缀位')
  expect(rows[2]?.textContent).toBe('精华后缀')
  expect(rows[0]?.getAttribute('search')).toBe('suffix+#% to cold resistance')
  expect(rows[1]?.getAttribute('value')).toBe('special:open-prefix')
  expect(rows[2]?.getAttribute('search')).toBe('essencesuffix+#% to cold resistance')
  expect(document.querySelector('img')).toBe(image)
  const input = document.querySelector('input') as HTMLInputElement
  input.value = '空余前缀位'
  expect(searchCandidates(input, lex).map((c) => c.term.en)).toContain('Open Prefix')
  stop()
  expect(document.body.innerHTML).toBe(original)
})

it('原站复制已翻译的选项到当前标签时，停用恢复选中项英文', async () => {
  const terms: Term[] = Object.entries(ui.entries).map(([en, zh]) => ({
    id: en,
    en,
    zh,
    domain: 'ui',
    source: 'manual',
    version: 'test',
  }))
  document.body.innerHTML =
    '<main><div class="dropdown"><label><div class="current"></div></label><div class="editing"><ul><li class="selected" value="special:open-prefix"><div class="type">Meta</div><div class="modifier">Open Prefix</div></li></ul></div></div></main>'
  stop = attachTextLayer(document, createLexicon(terms))
  const current = document.querySelector('.current') as HTMLElement
  const source = document.querySelector('li') as HTMLElement
  for (const child of source.children) current.append(child.cloneNode(true))
  document.querySelector('.editing')?.classList.add('hidden')
  await new Promise((r) => setTimeout(r, 0))
  expect(current.textContent).toBe('特殊条件空余前缀位')
  stop()
  expect(current.textContent).toBe('MetaOpen Prefix')
  expect(source.getAttribute('value')).toBe('special:open-prefix')
})
