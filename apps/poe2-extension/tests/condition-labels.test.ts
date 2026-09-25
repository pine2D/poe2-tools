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

it('条件属性类别和路线优先级可翻译检索，不改原站筛选键与用户步骤名', () => {
  const terms: Term[] = Object.entries(ui.entries).map(([en, zh]) => ({
    id: en,
    en,
    zh,
    domain: 'ui',
    source: 'manual',
    version: 'test',
  }))
  const lex = createLexicon(terms)
  document.body.innerHTML = `<main><div id="simulatorStepEditor"><div class="links"><label>Route priority order</label><div class="routeOrder"><div class="row" target="step-2"><div class="title">Property</div></div></div></div></div>
    <div id="simulatorConditionRequirements"><div class="dropdown"><div class="editing"><input type="text"></div><ul>
    <li value="property:energy-shield" search="propertyenergy shield"><div class="type">Property</div><span>Energy Shield</span></li>
    <li value="flag:corrupted" search="flagcorrupted"><div class="type">Flag</div><span>Corrupted</span></li>
    <li value="pseudo:resists" search="pseudototal resists"><div class="type">Pseudo</div><span>Total Resists</span></li>
    </ul></div></div></main>`
  const before = document.body.innerHTML
  const rows = [...document.querySelectorAll('li')]
  stop = attachTextLayer(document, lex)
  expect(document.querySelector('.links > label')?.textContent).toBe('路线优先顺序')
  expect(document.querySelector('.routeOrder .title')?.textContent).toBe('Property')
  expect(rows.map((r) => r.textContent)).toEqual(['装备属性能量护盾', '状态腐化', '汇总属性总抗性'])
  const input = document.querySelector('input') as HTMLInputElement
  input.value = '能量护盾'
  expect(searchCandidates(input, lex).map((c) => c.term.en)).toContain('Energy Shield')
  expect(rows[0]?.getAttribute('search')).toBe('propertyenergy shield')
  stop()
  expect(document.body.innerHTML).toBe(before)
})
