import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachAttributeLayer } from '../src/content/attribute-layer'
import { attachStatLayer } from '../src/content/stat-layer'
import { attachTextLayer } from '../src/content/text-layer'

const lex = createLexicon([
  {
    id: 'base',
    en: 'Runed Focus',
    zh: '符文法器',
    domain: 'base',
    source: 'test',
    version: 'test',
  },
  { id: 'ui', en: 'Search', zh: '搜索', domain: 'ui', source: 'test', version: 'test' },
  {
    id: 'stat',
    en: '#% to Lightning Resistance',
    zh: '闪电抗性 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
])
let stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops) stop()
  stops = []
  document.body.innerHTML = ''
})
function start() {
  stops = [
    attachTextLayer(document, lex),
    attachAttributeLayer(document, lex),
    attachStatLayer(document, lex),
  ]
}
it('保留保存流程名称、步骤标题和描述提示，仍翻译公共按钮及装备名', () => {
  document.body.innerHTML =
    '<main><div class="simulationsList"><div class="row" simulationid="test"><div class="title">Runed Focus</div><button>Search</button></div></div><div class="simulatorStep"><div class="header"><div class="title">Runed Focus<div class="description" tooltip="Search"><div class="hover tooltip">Search</div><button title="Search">Search</button><span class="stat">+18% to Lightning Resistance</span></div></div></div></div><span id="base">Runed Focus</span></main>'
  start()
  expect(document.querySelector('.simulationsList .title')?.textContent).toBe('Runed Focus')
  expect(document.querySelector('.simulatorStep .title')?.firstChild?.textContent).toBe(
    'Runed Focus',
  )
  expect(document.querySelector('.description .tooltip')?.textContent).toBe('Search')
  expect(document.querySelector('.description button')?.getAttribute('title')).toBe('Search')
  expect(document.querySelector('.description [data-poe2-l10n]')).toBeNull()
  expect(document.querySelector('.simulationsList button')?.textContent).toBe('搜索')
  expect(document.querySelector('#base')?.textContent).toBe('符文法器')
})
it('节点复用为步骤用户标题时恢复原文，原站后续用户修改不会覆盖', async () => {
  document.body.innerHTML =
    '<main><section><div class="header"><div class="title">Runed Focus</div></div></section></main>'
  start()
  const section = document.querySelector('section') as HTMLElement
  const title = document.querySelector('.title') as HTMLElement
  expect(title.textContent).toBe('符文法器')
  section.className = 'simulatorStep'
  await new Promise((r) => setTimeout(r, 30))
  expect(title.textContent).toBe('Runed Focus')
  title.textContent = '我的步骤'
  for (const stop of stops) stop()
  expect(title.textContent).toBe('我的步骤')
})

it('结果表保留用户步骤名，边界改变与关闭不会覆盖用户文本', async () => {
  document.body.innerHTML =
    '<main><div class="simulatorResultsTable"><div class="header"><div>Search</div></div><div class="row"><div class="title"><div>Runed Focus</div></div></div></div></main>'
  start()
  const table = document.querySelector('.simulatorResultsTable') as HTMLElement
  const title = document.querySelector('.title') as HTMLElement
  expect(title.textContent).toBe('Runed Focus')
  expect(document.querySelector('.header')?.textContent).toBe('搜索')
  table.className = ''
  await new Promise((r) => setTimeout(r, 30))
  expect(title.textContent).toBe('符文法器')
  table.className = 'simulatorResultsTable'
  await new Promise((r) => setTimeout(r, 30))
  expect(title.textContent).toBe('Runed Focus')
  title.textContent = '我的结果步骤'
  for (const stop of stops) stop()
  expect(title.textContent).toBe('我的结果步骤')
})

it('统计表头虽使用 stat 类仍翻译界面文案，不改写数据行词缀', () => {
  document.body.innerHTML =
    '<main><div class="simulatorResultsTable"><div class="header"><div class="stat">Search</div></div><div class="row"><div class="stat">+18% to Lightning Resistance</div></div></div></main>'
  start()
  expect(document.querySelector('.header .stat')?.textContent).toBe('搜索')
  expect(document.querySelector('.header [data-poe2-l10n]')).toBeNull()
  expect(document.querySelector('.row .stat')?.textContent).toBe('+18% to Lightning Resistance')
  expect(document.querySelector('.row [data-poe2-l10n]')?.shadowRoot?.textContent).toBe(
    '闪电抗性 +18%',
  )
})
it('保存目标弹窗的仓库页名称按 UUID 身份保留，普通动作仍翻译', async () => {
  document.body.innerHTML =
    '<dialog id="noticeDialog" open><div class="message"><div class="text"><button id="12345678-1234-4234-8234-123456789abc" title="Search">Runed Focus<span class="stat">+18% to Lightning Resistance</span></button><button id="0">Search</button></div></div></dialog><main><button id="other">Search</button></main>'
  start()
  const target = document.getElementById('12345678-1234-4234-8234-123456789abc') as HTMLElement
  expect(target.firstChild?.textContent).toBe('Runed Focus')
  expect(target.title).toBe('Search')
  expect(target.querySelector('[data-poe2-l10n]')).toBeNull()
  expect(document.getElementById('0')?.textContent).toBe('搜索')
  expect(document.getElementById('other')?.textContent).toBe('搜索')
  const action = document.getElementById('0') as HTMLElement
  action.id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(action.textContent).toBe('Search')
  action.id = '0'
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(action.textContent).toBe('搜索')
})
