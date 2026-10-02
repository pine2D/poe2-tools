import { createLexicon } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { supportsPage } from '../src/adapters/coe-beta/context'
import { attachStatLayer } from '../src/content/stat-layer'
import { attachTextLayer } from '../src/content/text-layer'

const lex = createLexicon([
  { id: 'f', en: 'Runed Focus', zh: '符文法器', domain: 'base', source: 'test', version: 'test' },
  {
    id: 'r',
    en: '#% to Lightning Resistance',
    zh: '闪电抗性 #%',
    domain: 'stat',
    source: 'test',
    version: 'test',
  },
])
const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  document.body.innerHTML = ''
})
const settle = () => new Promise((r) => setTimeout(r, 30))
it('仅真实 Beta 域的英文 PoE2 模式启用，不能信任 URL 参数', () => {
  document.body.innerHTML =
    '<div id="gameToggler"><a class="poe2 selected"></a></div><div id="languageToggler"><div class="list"><div key="us" class="active"></div></div></div>'
  expect(supportsPage(document, 'https://beta.craftofexile.com/?game=poe2')).toBe(true)
  expect(supportsPage(document, 'https://www.craftofexile.com/?game=poe2')).toBe(false)
  expect(supportsPage(document, 'https://beta.craftofexile.com.evil.invalid/')).toBe(false)
  document.querySelector('[key]')?.setAttribute('key', 'tw')
  expect(supportsPage(document, 'https://beta.craftofexile.com/?game=poe2')).toBe(false)
  document.querySelector('[key]')?.setAttribute('key', 'us')
  document.querySelector('.poe2')?.setAttribute('class', 'poe2')
  expect(supportsPage(document, 'https://beta.craftofexile.com/?game=poe2')).toBe(false)
})
it('原站重新写值后翻译新值，关闭恢复最新原文', async () => {
  document.body.innerHTML = '<main><span>+18% to Lightning Resistance</span></main>'
  const span = document.querySelector('span') as HTMLSpanElement
  const stop = attachTextLayer(document, lex)
  stops.push(stop)
  expect(span.textContent).toBe('闪电抗性 +18%')
  const textNode = span.firstChild as Text
  textNode.textContent = '+20% to Lightning Resistance'
  await settle()
  expect(span.textContent).toBe('闪电抗性 +20%')
  stop()
  expect(span.textContent).toBe('+20% to Lightning Resistance')
})
it('立即关闭不能用旧值覆盖原站尚未处理的新值', () => {
  document.body.innerHTML = '<main><span>Runed Focus</span></main>'
  const stop = attachTextLayer(document, lex)
  stops.push(stop)
  const span = document.querySelector('span') as HTMLSpanElement
  span.textContent = 'Changed by site'
  stop()
  expect(document.querySelector('span')?.textContent).toBe('Changed by site')
})
it('新增节点被翻译且双语不会无限重复', async () => {
  document.body.innerHTML = '<main></main>'
  stops.push(attachTextLayer(document, lex, true))
  const main = document.querySelector('main') as HTMLElement
  main.innerHTML = '<button>Runed Focus</button>'
  await settle()
  await settle()
  expect(document.querySelector('button')?.textContent).toBe('符文法器 · Runed Focus')
})
it('不修改输入、备注、代码、扩展自身、广告和业务属性', () => {
  document.body.innerHTML =
    '<main><input value="Runed Focus"><textarea>Runed Focus</textarea><code>Runed Focus</code><span contenteditable="true">Runed Focus</span><div data-poe2-l10n>Runed Focus</div><div id="coe_ad_zone">Runed Focus</div><button data-key="Runed Focus">Runed Focus</button></main>'
  stops.push(attachTextLayer(document, lex))
  expect(document.querySelector('input')?.value).toBe('Runed Focus')
  for (const selector of [
    'textarea',
    'code',
    '[contenteditable]',
    '[data-poe2-l10n]',
    '#coe_ad_zone',
  ])
    expect(document.querySelector(selector)?.textContent).toBe('Runed Focus')
  expect(document.querySelector('button')?.dataset.key).toBe('Runed Focus')
  expect(document.querySelector('button')?.textContent).toBe('符文法器')
})
it('暂时移除再复用的文字节点仍可恢复原文', async () => {
  document.body.innerHTML = '<main><span>Runed Focus</span></main>'
  const node = document.querySelector('span') as HTMLSpanElement
  const stop = attachTextLayer(document, lex)
  stops.push(stop)
  node.remove()
  await settle()
  document.querySelector('main')?.append(node)
  await settle()
  stop()
  expect(node.textContent).toBe('Runed Focus')
})
it('节点移入备注编辑区后恢复英文，用户改值后关闭不覆盖', async () => {
  document.body.innerHTML =
    '<main><span>Runed Focus</span><div contenteditable="true"></div></main>'
  const node = document.querySelector('span') as HTMLElement
  const stop = attachTextLayer(document, lex)
  stops.push(stop)
  document.querySelector('[contenteditable]')?.append(node)
  await settle()
  expect(node.textContent).toBe('Runed Focus')
  node.textContent = '我的备注'
  stop()
  expect(node.textContent).toBe('我的备注')
})
it('祖先切换隐藏与编辑状态会撤销译文，恢复普通区域后重新翻译', async () => {
  document.body.innerHTML = '<main><section><span>Runed Focus</span></section></main>'
  stops.push(attachTextLayer(document, lex))
  const section = document.querySelector('section') as HTMLElement
  const node = document.querySelector('span') as HTMLElement
  section.classList.add('hidden')
  await settle()
  expect(node.textContent).toBe('Runed Focus')
  section.classList.remove('hidden')
  await settle()
  expect(node.textContent).toBe('符文法器')
  section.contentEditable = 'true'
  await settle()
  expect(node.textContent).toBe('Runed Focus')
})
it('说明连词与条件标签分别翻译，移动节点后更新上下文并可恢复', async () => {
  const dictionary = createLexicon([
    { id: 'and', en: 'And', zh: '全部满足', domain: 'ui', source: 'test', version: 'test' },
    { id: 'or', en: 'Or', zh: '满足任一', domain: 'ui', source: 'test', version: 'test' },
  ])
  document.body.innerHTML =
    '<main><div id="instructions"><span> and </span><b>or</b></div><div id="condition"><span> and </span><b>or</b></div></main>'
  const stop = attachTextLayer(document, dictionary)
  stops.push(stop)
  const instruction = document.querySelector('#instructions') as HTMLElement
  const condition = document.querySelector('#condition') as HTMLElement
  expect(instruction.textContent).toBe(' 与 或')
  expect(condition.textContent).toBe(' 全部满足 满足任一')
  const moved = instruction.querySelector('span') as HTMLElement
  condition.append(moved)
  await settle()
  expect(moved.textContent).toBe(' 全部满足 ')
  instruction.append(moved)
  await settle()
  expect(moved.textContent).toBe(' 与 ')
  stop()
  expect(moved.textContent).toBe(' and ')
})
it('说明容器身份改变后，中英对照使用新上下文而不拼接旧译文', async () => {
  const dictionary = createLexicon([
    { id: 'and', en: 'And', zh: '全部满足', domain: 'ui', source: 'test', version: 'test' },
  ])
  document.body.innerHTML = '<main><div id="instructions">and</div></main>'
  const stop = attachTextLayer(document, dictionary, true)
  stops.push(stop)
  const container = document.querySelector('#instructions') as HTMLElement
  expect(container.textContent).toBe('与 · and')
  container.id = 'condition'
  await settle()
  expect(container.textContent).toBe('全部满足 · and')
  stop()
  expect(container.textContent).toBe('and')
})

it('计算结果动态次数保留原数字，耗时节点不重建，离开上下文恢复原文', async () => {
  document.body.innerHTML =
    '<main><section id="calculationsZone"><div class="tries">1 out of 1,234 tries</div><div class="status">2 of 10</div><label>Executed in <b>0.209</b> seconds</label><div>Confidence :</div></section><section id="outside"></section></main>'
  const stop = attachTextLayer(document, createLexicon([]))
  stops.push(stop)
  const root = document.querySelector('#calculationsZone') as HTMLElement
  const tries = root.querySelector('.tries') as HTMLElement
  const time = root.querySelector('b') as HTMLElement
  expect(tries.textContent).toBe('平均约每 1,234 次成功 1 次')
  expect(root.querySelector('.status')?.textContent).toBe('2 / 10')
  expect(root.querySelector('label')?.textContent).toBe('耗时 0.209 秒')
  expect(root.textContent).toContain('累计成功率：')
  tries.textContent = '1 out of 20 tries'
  time.textContent = '0.315'
  await settle()
  expect(tries.textContent).toBe('平均约每 20 次成功 1 次')
  expect(root.querySelector('b')).toBe(time)
  document.querySelector('#outside')?.append(tries)
  await settle()
  expect(tries.textContent).toBe('1 out of 20 tries')
  stop()
  expect(root.querySelector('label')?.textContent).toBe('Executed in 0.315 seconds')
})

it('标签限定翻译保留筛选身份，动态移出标签区域恢复英文', async () => {
  document.body.innerHTML =
    '<main><ul id="filterSelector"><li class="tag lightning" value="313">Lightning</li><li class="tag lightning" value="100313">Non-Lightning</li></ul><span class="modTag tag caster">Caster</span><span id="outside">Lightning</span></main>'
  const stop = attachTextLayer(document, createLexicon([]))
  stops.push(stop)
  const tag = document.querySelector('li') as HTMLElement
  expect(tag.textContent).toBe('闪电')
  expect(tag.getAttribute('value')).toBe('313')
  expect(document.querySelector('[value="100313"]')?.textContent).toBe('非闪电')
  expect(document.querySelector('.modTag')?.textContent).toBe('施法')
  expect(document.querySelector('#outside')?.textContent).toBe('Lightning')
  tag.classList.remove('tag')
  await settle()
  expect(tag.textContent).toBe('Lightning')
  tag.classList.add('tag')
  await settle()
  expect(tag.textContent).toBe('闪电')
  stop()
  expect(document.querySelector('[value="100313"]')?.textContent).toBe('Non-Lightning')
  expect(document.querySelector('.modTag')?.textContent).toBe('Caster')
})

it('流程导入分段提示限定区域翻译，保留强调节点并支持恢复', () => {
  document.body.innerHTML =
    '<dialog open><div id="simulatorImporterZone">This appears to be a single simulation export, this function requires an <b>Export all</b> dataset.<br>To import a singular simulation please go to <b>New Simulation</b> and then <b>IMPORT A SIMULATION</b>.</div><p> and then </p></dialog>'
  const root = document.querySelector('#simulatorImporterZone') as HTMLElement
  const bold = root.querySelector('b')
  const original = root.innerHTML
  const stop = attachTextLayer(document, createLexicon([]))
  stops.push(stop)
  expect(root.textContent?.replace(/\s/g, '')).toContain(
    '这是单个流程的导出数据；此入口需要使用Exportall生成的数据。',
  )
  expect(root.textContent?.replace(/\s/g, '')).toContain(
    '导入单个流程，请进入NewSimulation，然后选择IMPORTASIMULATION。',
  )
  expect(root.querySelector('b')).toBe(bold)
  expect(document.querySelector('p')?.textContent).toBe(' and then ')
  stop()
  expect(root.innerHTML).toBe(original)
})

it('其他导入提示的独立句号不添加无配对引号', () => {
  document.body.innerHTML =
    '<dialog open><div id="simulatorImporterZone"><span>Unknown message</span>.</div></dialog>'
  const root = document.querySelector('#simulatorImporterZone') as HTMLElement
  const stop = attachTextLayer(document, createLexicon([]))
  stops.push(stop)
  expect(root.textContent).toBe('Unknown message。')
  stop()
  expect(root.textContent).toBe('Unknown message.')
})

it('装备卡属性分段译文保留数值与关键词身份，移出属性区域恢复英文', async () => {
  document.body.innerHTML =
    '<main><div class="item"><div class="property"><label>Focus</label></div><div class="property itemProperty"><label><span class="keyword" id="EnergyShield">Energy Shield</span>:</label><div>42</div></div><div class="property"><label><span id="Ward">Runic Ward</span>:</label><div>32</div></div><div class="property"><div>45<span class="label" id="requirement">, Int</span> 64</div></div></div><p id="outside">, Int</p></main>'
  const stop = attachTextLayer(document, lex)
  stops.push(stop)
  const stopStats = attachStatLayer(document, lex)
  stops.push(stopStats)
  expect(document.querySelector('.item')?.textContent).toBe(
    'FocusEnergy Shield:42Runic Ward:3245, Int 64',
  )
  const translated = Array.from(
    document.querySelectorAll('[data-poe2-l10n]'),
    (host) => host.shadowRoot?.textContent,
  ).join(' ')
  for (const word of ['法器', '能量护盾', '符文结界', '智慧', '42', '32', '64'])
    expect(translated).toContain(word)
  expect(document.querySelector('#outside')?.textContent).toBe(', Int')
  const keyword = document.querySelector('#EnergyShield') as HTMLElement
  document.querySelector('main')?.append(keyword)
  await settle()
  expect(keyword.textContent).toBe('Energy Shield')
  const requirement = document.querySelector('#requirement') as HTMLElement
  requirement.parentElement?.parentElement?.classList.remove('property')
  await settle()
  expect(requirement.textContent).toBe(', Int')
  stop()
  expect(document.querySelector('#Ward')?.textContent).toBe('Runic Ward')
})

it('筛选摘要区分搜索词和加载状态，清空动作说明范围并支持恢复', async () => {
  document.body.innerHTML =
    '<main><div class="filterFeedback"><label>Searching</label><button>Clear all</button></div><p>Searching</p></main>'
  const stop = attachTextLayer(
    document,
    createLexicon([
      {
        id: 'searching',
        en: 'Searching',
        zh: '搜索中',
        domain: 'ui',
        source: 'test',
        version: 'test',
      },
    ]),
  )
  stops.push(stop)
  const feedback = document.querySelector('.filterFeedback') as HTMLElement
  expect(feedback.textContent).toBe('搜索词清空全部筛选')
  expect(document.querySelector('p')?.textContent).toBe('搜索中')
  feedback.classList.remove('filterFeedback')
  await settle()
  expect(feedback.textContent).toBe('搜索中Clear all')
  feedback.classList.add('filterFeedback')
  await settle()
  expect(feedback.textContent).toBe('搜索词清空全部筛选')
  stop()
  expect(feedback.textContent).toBe('SearchingClear all')
})

it('中英对照保留文本片段两端空白，避免相邻强调节点粘连', () => {
  document.body.innerHTML =
    '<main><div id="instructions">Hold <b>advanced</b> and <b>classic</b></div></main>'
  const box = document.querySelector('#instructions') as HTMLElement
  const original = box.innerHTML
  const stop = attachTextLayer(document, createLexicon([]), true)
  stops.push(stop)
  expect(box.textContent).toBe('按住 · Hold 高级 · advanced 与 · and 经典 · classic')
  stop()
  expect(box.innerHTML).toBe(original)
})

it('背包容量只翻译用途文字，保留数字单位并恢复动态最新值', async () => {
  document.body.innerHTML =
    '<dialog open><div id="inventoryZone"><div class="tabs">quota</div><div class="usage"><div class="details">(15.59 KB used of 5.00 MB <span>quota</span>)</div></div></div><div id="outside">quota</div></dialog>'
  const stop = attachTextLayer(document, lex)
  stops.push(stop)
  const details = document.querySelector('.details') as HTMLElement
  expect(details.textContent).toBe('(已用 15.59 KB / 5.00 MB 容量限额)')
  expect(document.querySelector('.tabs')?.textContent).toBe('quota')
  expect(document.querySelector('#outside')?.textContent).toBe('quota')
  const value = details.firstChild as Text
  value.data = '(16.65 KB used of 5.00 MB '
  await settle()
  expect(details.textContent).toBe('(已用 16.65 KB / 5.00 MB 容量限额)')
  stop()
  expect(details.textContent).toBe('(16.65 KB used of 5.00 MB quota)')
})
