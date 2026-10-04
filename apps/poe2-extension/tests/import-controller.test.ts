import { readFileSync } from 'node:fs'
import type { Term } from '@poe2-tools/l10n-core'
import { afterEach, expect, it } from 'vitest'
import { attachImport } from '../src/content/import-controller'

let stop = () => {}
const ui = () =>
  (document.querySelector('[data-poe2-l10n="import"]') as HTMLElement).shadowRoot as ShadowRoot
afterEach(() => {
  stop()
  document.body.innerHTML = ''
})
it('只在原站导入弹窗挂入口；不读取剪贴板且未知文本不可提交', () => {
  document.body.innerHTML =
    '<dialog open><textarea id="importerInput">私人文本</textarea><button class="importCommitButton">Proceed</button></dialog>'
  stop = attachImport(document, [])
  const preview = ui().querySelector<HTMLButtonElement>('.body > button')
  expect(preview?.textContent).toBe('预览中文转换')
  preview?.click()
  expect(document.querySelector<HTMLTextAreaElement>('#importerInput')?.value).toBe('私人文本')
  const submit = ui().querySelector<HTMLButtonElement>('.body > div > button')
  expect(submit?.disabled).toBe(true)
  stop()
  expect(document.querySelector('[data-poe2-l10n="import"]')).toBeNull()
})
it('同名 textarea 不在 dialog 时不挂载', () => {
  document.body.innerHTML = '<textarea id="importerInput"></textarea>'
  stop = attachImport(document, [])
  expect(document.querySelector('[data-poe2-l10n="import"]')).toBeNull()
})

const source = `物品类别: 法器
稀有度: 魔法
测试的 符文法器
--------
物品等级: 86
--------
{ 前缀属性 "测试的" (等阶：6) — 能量护盾 }
+40(36-41) 能量护盾上限`
function readyPreview() {
  document.body.innerHTML = '<dialog open><textarea id="importerInput"></textarea></dialog>'
  const input = document.querySelector('#importerInput') as HTMLTextAreaElement
  input.value = source
  stop = attachImport(document, [
    {
      id: 'base',
      en: 'Runed Focus',
      zh: '符文法器',
      domain: 'base',
      source: 'test',
      version: 'test',
    },
    {
      id: 'stat',
      sourceId: 'explicit.stat_4052037485',
      en: '+# to maximum Energy Shield',
      zh: '+# 能量护盾上限',
      domain: 'stat',
      source: 'test',
      version: 'test',
    },
  ])
  const preview = ui().querySelector('.body > button') as HTMLButtonElement
  preview.click()
  const fill = ui().querySelector('.body > div > button') as HTMLButtonElement
  expect(fill.disabled).toBe(false)
  return { input, preview, fill }
}
it('重复预览使旧填入按钮失效，当前预览仍可填入', () => {
  const { input, preview, fill } = readyPreview()
  preview.click()
  fill.click()
  expect(input.value).toBe(source)
  const current = ui().querySelector('.body > div > button') as HTMLButtonElement
  current.click()
  expect(input.value).toContain('Runed Focus')
})
it('停用扩展后旧预览按钮和填入按钮不能修改原站', () => {
  const { input, preview, fill } = readyPreview()
  stop()
  preview.click()
  fill.click()
  expect(input.value).toBe(source)
  expect(document.querySelector('[data-poe2-l10n]')).toBeNull()
})
it('编辑原文立即禁用旧填入入口，再次预览才可使用', () => {
  const { input, preview, fill } = readyPreview()
  input.value = source.replace('+40', '+39')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(fill.disabled).toBe(true)
  expect(ui().textContent).toContain('重新预览')
  preview.click()
  const current = ui().querySelector('.body > div > button') as HTMLButtonElement
  expect(current.disabled).toBe(false)
  current.click()
  expect(input.value).toContain('+39(36-41) to maximum Energy Shield')
})
it('点击诊断定位原输入行，不修改文本，过期诊断不能继续操作', () => {
  const { input, preview } = readyPreview()
  input.value = source.replace('40(36-41)', '42(36-41)')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  preview.click()
  const locate = ui().querySelector<HTMLButtonElement>('button[aria-label="定位第 8 行"]')
  expect(locate).not.toBeNull()
  const original = input.value
  locate?.click()
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe(original)
  expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe(
    '+42(36-41) 能量护盾上限',
  )
  input.value = source
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.setSelectionRange(0, 0)
  locate?.click()
  expect(input.selectionStart).toBe(0)
})

it('导入状态区在预览前挂载，跨重试保留，仅播报摘要且不抢焦点', () => {
  const { input, preview, fill } = readyPreview()
  const status = ui().querySelector('[role="status"]')
  expect(status).not.toBeNull()
  expect(status?.getAttribute('aria-live')).toBe('polite')
  expect(status?.getAttribute('aria-atomic')).toBe('true')
  expect(status?.textContent).toContain('可以填入')
  expect(status?.querySelector('textarea')).toBeNull()
  input.focus()
  input.value = source.replace('+40', '+39')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(status?.querySelector('span')?.textContent).toBe('原文已改变，请重新预览')
  expect(status?.querySelector('small')?.textContent).toBe('以下为改动前的结果')
  expect(document.activeElement).toBe(input)
  expect(fill.disabled).toBe(true)
  preview.click()
  expect(ui().querySelector('[role="status"]')).toBe(status)
  expect(status?.textContent).toContain('可以填入')
  const current = ui().querySelector('.body > div > button') as HTMLButtonElement
  current.click()
  expect(status?.textContent).toContain('已填入英文')
  expect(document.activeElement).toBe(input)
  input.value = '未知文本'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  preview.click()
  expect(ui().querySelector('[role="status"]')).toBe(status)
  expect(status?.textContent).toContain('仅供对照')
  expect(status?.textContent).toContain('无法识别装备文本')
  stop()
  expect(status?.isConnected).toBe(false)
})

it('未预览时状态区为空，不提前播报装备内容', () => {
  document.body.innerHTML = '<dialog open><textarea id="importerInput">私人文本</textarea></dialog>'
  stop = attachImport(document, [])
  const status = ui().querySelector('[role="status"]')
  expect(status).not.toBeNull()
  expect(status?.textContent).toBe('')
  expect(status?.classList.contains('verdict')).toBe(true)
  expect(ui().querySelector('.check')).toBeNull()
  // 未预览时主按钮是预览
  expect(primary()).toEqual([ui().querySelector('.body > button')])
})

it('关闭对话框后立即拒绝旧按钮操作，随后移除预览，重开重新挂载', async () => {
  const { input, preview, fill } = readyPreview()
  const dialog = input.closest('dialog') as HTMLDialogElement
  dialog.open = false
  fill.click()
  expect(input.value).toBe(source)
  preview.click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelector('[data-poe2-l10n="import"]')).toBeNull()
  dialog.open = true
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(document.querySelectorAll('[data-poe2-l10n="import"]')).toHaveLength(1)
  expect(ui().querySelector('[role="status"]')?.textContent).toBe('')
  fill.click()
  expect(input.value).toBe(source)
})

it('未打开的原站对话框不挂载预览', () => {
  document.body.innerHTML = '<dialog><textarea id="importerInput"></textarea></dialog>'
  stop = attachImport(document, [])
  expect(document.querySelector('[data-poe2-l10n="import"]')).toBeNull()
})

it('关闭后旧诊断不能改变选择区', () => {
  const { input, preview } = readyPreview()
  input.value = source.replace('40(36-41)', '42(36-41)')
  preview.click()
  const locate = ui().querySelector<HTMLButtonElement>('button[aria-label="定位第 8 行"]')
  expect(locate).not.toBeNull()
  ;(input.closest('dialog') as HTMLDialogElement).open = false
  input.setSelectionRange(0, 0)
  locate?.click()
  expect(input.selectionStart).toBe(0)
  expect(input.selectionEnd).toBe(0)
})

it('英文回填后可恢复原始中文，恢复后需重新预览', () => {
  const { input, preview, fill } = readyPreview()
  fill.click()
  const restore = [...ui().querySelectorAll('button')].find(
    (button) => button.textContent === '恢复粘贴原文',
  ) as HTMLButtonElement
  expect(restore).toBeDefined()
  expect(restore.disabled).toBe(false)
  restore.click()
  expect(input.value).toBe(source)
  expect(restore.disabled).toBe(true)
  expect(fill.disabled).toBe(true)
  expect(ui().querySelector('[role="status"]')?.textContent).toContain('重新预览')
  preview.click()
  const current = ui().querySelector('.body > div > button') as HTMLButtonElement
  expect(current.disabled).toBe(false)
})
it('恢复原文不覆盖后续程序化编辑，重新预览后的旧恢复按钮不能操作', () => {
  const { input, preview, fill } = readyPreview()
  fill.click()
  const restore = [...ui().querySelectorAll('button')].find(
    (button) => button.textContent === '恢复粘贴原文',
  ) as HTMLButtonElement
  expect(restore).toBeDefined()
  input.value = '后续编辑'
  restore.click()
  expect(input.value).toBe('后续编辑')
  expect(restore.disabled).toBe(true)
  input.value = source
  input.dispatchEvent(new Event('input', { bubbles: true }))
  preview.click()
  restore.click()
  expect(input.value).toBe(source)
})

it.each(['input', 'close', 'preview', 'stop'])('回填后%s使旧恢复入口失效', (action) => {
  const { input, preview, fill } = readyPreview()
  fill.click()
  const restore = [...ui().querySelectorAll('button')].find(
    (button) => button.textContent === '恢复粘贴原文',
  ) as HTMLButtonElement
  expect(restore).toBeDefined()
  const english = input.value
  if (action === 'input') input.dispatchEvent(new Event('input', { bubbles: true }))
  if (action === 'close') document.querySelector('dialog')?.removeAttribute('open')
  if (action === 'preview') preview.click()
  if (action === 'stop') stop()
  restore.click()
  expect(input.value).toBe(english)
})

it('键盘激活填入与恢复后焦点回到原导入框', () => {
  const { input, fill } = readyPreview()
  fill.focus()
  fill.click()
  expect(input.value).toContain('Item Class: Foci')
  expect(document.activeElement).toBe(input)
  const restore = [...ui().querySelectorAll('button')].find(
    (button) => button.textContent === '恢复粘贴原文',
  ) as HTMLButtonElement
  restore.focus()
  restore.click()
  expect(input.value).toBe(source)
  expect(document.activeElement).toBe(input)
})
it('回填触发原站转移焦点时不抢回', () => {
  const { input, fill } = readyPreview()
  const other = document.createElement('button')
  input.closest('dialog')?.append(other)
  input.addEventListener('input', () => other.focus())
  fill.focus()
  fill.click()
  expect(input.value).toContain('Runed Focus')
  expect(document.activeElement).toBe(other)
})

it('原站兼容性警告与翻译失败分开显示，不自动点击原站提交', () => {
  document.body.innerHTML =
    '<dialog open><textarea id="importerInput"></textarea><button id="proceed">Proceed</button></dialog>'
  const input = document.querySelector('#importerInput') as HTMLTextAreaElement
  input.value =
    '物品类别: 腰带\n稀有度: 普通\n环锁腰带\n--------\n物品等级: 79\n--------\n{ 基底属性 }\n具有 2(1-3) 个咒符位'
  stop = attachImport(document, [
    {
      id: 'base',
      en: 'Mail Belt',
      zh: '环锁腰带',
      domain: 'base',
      source: 'test',
      version: 'test',
    },
    {
      id: 'implicit.stat_1416292992',
      en: 'Has # Charm Slot',
      zh: '具有 # 个咒符位',
      domain: 'stat',
      source: 'test',
      version: 'test',
    },
  ])
  let submitted = false
  document.querySelector('#proceed')?.addEventListener('click', () => {
    submitted = true
  })
  ui().querySelector<HTMLButtonElement>('.body > button')?.click()
  expect(ui().querySelector('li[data-kind="warning"]')?.textContent).toContain('咒符位曾被')
  expect(ui().querySelectorAll('li[data-kind="issue"]')).toHaveLength(0)
  expect(ui().querySelector('p.verdict')?.textContent).toBe(
    '可以填入1 条原站兼容性提示需在导入后核对',
  )
  const fill = ui().querySelector<HTMLButtonElement>('.body > div > button')
  expect(fill?.disabled).toBe(false)
  fill?.click()
  expect(input.value).toContain('Has 2(1-3) Charm Slot')
  expect(submitted).toBe(false)
})

it('面板头部：gem + “装备文本转换” + 短署名；底部完整声明；样式只来自共享表（spec §6.9）', () => {
  readyPreview()
  const root = ui()
  expect(root.querySelector('.head svg.gem')?.getAttribute('aria-hidden')).toBe('true')
  expect(root.querySelector('.head .title')?.textContent).toBe('装备文本转换')
  expect(root.querySelector('.head .by')?.textContent).toBe('PoE2 中文助手 · 非官方')
  expect(root.querySelector('.disclaimer')?.textContent).toBe(
    '非官方工具，与 Grinding Gear Games、腾讯及 Craft of Exile 无关联，也未获其认可。',
  )
  expect(root.querySelector('style')).toBeNull()
  expect(root.adoptedStyleSheets).toHaveLength(1)
  const host = document.querySelector('[data-poe2-l10n="import"]') as HTMLElement
  expect(host.style.color).toBe('')
  expect(host.style.background).toBe('')
})

it('对话框放宽规则单独放在宿主之前的 import-dialog 样式里，随宿主一起移除（spec §6.9 例外 3）', () => {
  readyPreview()
  const host = document.querySelector('[data-poe2-l10n="import"]') as HTMLElement
  const style = host.previousElementSibling as HTMLStyleElement
  expect(style.tagName).toBe('STYLE')
  expect(style.dataset.poe2L10n).toBe('import-dialog')
  expect(style.textContent).toContain('#noticeDialog:has([data-poe2-l10n="import"])')
  expect(style.textContent).not.toMatch(/color|background|font/)
  // 首条规则让原站 showModal 对话框可滚动，“继续”与面板底部声明才够得着
  const firstRule = /#noticeDialog:has\(\[data-poe2-l10n="import"\]\)\s*\{([^}]*)\}/.exec(
    style.textContent ?? '',
  )
  expect(firstRule?.[1]).toContain('overflow-y: auto')
  expect(document.querySelectorAll('style').length).toBe(1)
  stop()
  expect(document.querySelector('style[data-poe2-l10n="import-dialog"]')).toBeNull()
})

it('英文预览框带 data-preview，填入按钮为主操作、恢复为第三级', () => {
  const { fill } = readyPreview()
  const areas = [...ui().querySelectorAll('textarea')]
  expect(areas.map((a) => a.hasAttribute('data-preview'))).toEqual([false, true])
  expect(ui().querySelector('button[data-primary]')).toBe(fill)
  expect(fill.textContent).toBe('填入英文到原站导入框')
  fill.click()
  expect(ui().querySelector('button[data-tertiary]:not([aria-label])')?.textContent).toBe(
    '恢复粘贴原文',
  )
})

// ---- 0.4.0 核对清单（裁定 21–25；样稿 phase3/import 版 B） ----
const BASE: Term = {
  id: 'base',
  en: 'Runed Focus',
  zh: '符文法器',
  domain: 'base',
  source: 'test',
  version: 'test',
}
const STAT: Term = {
  id: 'stat',
  sourceId: 'explicit.stat_4052037485',
  en: '+# to maximum Energy Shield',
  zh: '+# 能量护盾上限',
  domain: 'stat',
  source: 'test',
  version: 'test',
}
function previewWith(text: string, terms: readonly Term[]) {
  document.body.innerHTML = '<dialog open><textarea id="importerInput"></textarea></dialog>'
  const input = document.querySelector('#importerInput') as HTMLTextAreaElement
  input.value = text
  stop = attachImport(document, terms)
  const preview = ui().querySelector('.body > button') as HTMLButtonElement
  preview.click()
  return { input, preview }
}
const verdict = () => ui().querySelector('p.verdict')
const groups = () =>
  Object.fromEntries(
    [...ui().querySelectorAll('.check > .group')].map((group) => [
      group.querySelector('h3')?.textContent ?? '',
      [...group.querySelectorAll('li')].map((li) => li.textContent),
    ]),
  )
const primary = () => [...ui().querySelectorAll<HTMLButtonElement>('button[data-primary]')]

it('① 可以填入：唯一 live region 是结论行；已识别 6 / 6 行；下一步你与原站；填入是唯一主按钮', () => {
  const { preview, fill } = readyPreview()
  expect(ui().querySelectorAll('[role="status"]')).toHaveLength(1)
  expect(verdict()?.getAttribute('role')).toBe('status')
  expect(verdict()?.querySelector('span')?.textContent).toBe('可以填入')
  expect(verdict()?.querySelector('small')).toBeNull()
  expect(verdict()?.querySelector('svg.ico')?.getAttribute('aria-hidden')).toBe('true')
  expect(ui().querySelector('.result > .check')).toBe(
    ui().querySelector('.result')?.firstElementChild,
  )
  expect(groups()).toEqual({
    已完成: ['已识别 6 / 6 行，生成英文预览'],
    待核对: ['没有需要先改正的行'],
    下一步: [
      '你核对两栏后，点“填入英文到原站导入框”',
      '原站填入后点“继续”（Proceed），能否导入由原站判断',
    ],
  })
  expect(ui().querySelector('li[data-kind="clear"]')).not.toBeNull()
  expect([...ui().querySelectorAll('.who')].map((tag) => tag.textContent)).toEqual(['你', '原站'])
  expect(primary()).toEqual([fill])
  expect(preview.hasAttribute('data-primary')).toBe(false)
})

it('② 需先改正：越界一行，结论“需先改正 N 行”与“第 N 行”“改正这 M 行”同一单位，预览是唯一主按钮', () => {
  const { input, preview } = readyPreview()
  input.value = source.replace('40(36-41)', '42(36-41)')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  preview.click()
  expect(verdict()?.textContent).toBe('需先改正 1 行两栏仅供对照，暂不能填入')
  expect(groups()).toEqual({
    已完成: ['已识别 5 / 6 行，生成英文预览'],
    待核对: ['第 8 行数值无效或不在原文范围内。'],
    下一步: ['你在原站导入框改正这 1 行，再点“预览中文转换”'],
  })
  const locate = ui().querySelectorAll<HTMLButtonElement>('li[data-kind="issue"] button')
  expect(locate).toHaveLength(1)
  expect(locate[0]?.dataset.tertiary).toBe('')
  expect(locate[0]?.getAttribute('aria-label')).toBe('定位第 8 行')
  expect((ui().querySelector('.result > button') as HTMLButtonElement).disabled).toBe(true)
  expect(primary()).toEqual([preview])
})

it('同一行两条问题只出一条、一个定位按钮；处数与分数都只算一次', () => {
  previewWith(`${source}\n--------\n未知面板: 123`, [BASE, STAT])
  const issues = [...ui().querySelectorAll('li[data-kind="issue"]')]
  expect(issues).toHaveLength(1)
  expect(issues[0]?.querySelectorAll('button')).toHaveLength(1)
  expect(issues[0]?.querySelector('button')?.getAttribute('aria-label')).toBe('定位第 10 行')
  expect(issues[0]?.textContent).toBe('第 10 行无法分类的原文已保留 该行尚未完整识别或翻译。')
  expect(verdict()?.querySelector('span')?.textContent).toBe('需先改正 1 行')
  expect(groups().已完成).toEqual(['已识别 6 / 7 行，生成英文预览'])
  expect(groups().下一步).toEqual(['你在原站导入框改正这 1 行，再点“预览中文转换”'])
})

it('只有无行号问题：不显示分数、不出定位按钮，下一步按提示改正', () => {
  previewWith(source, [STAT])
  expect(verdict()?.querySelector('span')?.textContent).toBe('需先核对 1 处')
  expect(groups()).toEqual({
    已完成: ['已生成英文预览（1 条问题涉及整件装备，无法定位到行）'],
    待核对: ['基底译名未匹配或存在歧义，无法确认英文。'],
    下一步: ['你按上面的提示改正原文，再点“预览中文转换”'],
  })
  expect(ui().querySelector('.check')?.textContent).not.toMatch(/\d+ \/ \d+/)
  expect(ui().querySelector('.check li button')).toBeNull()
})

it('有行号与无行号问题并存：无行号的排前，处数为合并后条数', () => {
  previewWith(source.replace('40(36-41)', '42(36-41)'), [STAT])
  expect(verdict()?.querySelector('span')?.textContent).toBe('需先核对 2 处')
  expect(groups().待核对).toEqual([
    '基底译名未匹配或存在歧义，无法确认英文。',
    '第 8 行数值无效或不在原文范围内。',
  ])
  expect(groups().已完成).toEqual(['已生成英文预览（1 条问题涉及整件装备，无法定位到行）'])
  expect(groups().下一步).toEqual(['你按上面的提示改正原文，再点“预览中文转换”'])
})

it.each([
  [
    '传奇',
    source.replace('稀有度: 魔法', '稀有度: 传奇'),
    '传奇装备仅供解析与中英对照，不开放制作。',
  ],
  ['咒符', source.replace('类别: 法器', '类别: 咒符'), '咒符仅供解析与中英对照，不开放制作。'],
])(
  '②b %s仅供对照：副句为对照原因且不在待核对里重复，不写“改正这”，没有主按钮',
  (_, text, reason) => {
    previewWith(text, [BASE, STAT])
    expect(verdict()?.querySelector('span')?.textContent).toBe('仅供对照')
    expect(verdict()?.querySelector('small')?.textContent).toBe(reason)
    expect(groups().待核对).not.toContain(reason)
    expect(groups().下一步).toEqual(['你对照两栏阅读；此类装备暂不能填入'])
    expect(ui().querySelector('.check')?.textContent).not.toContain('改正这')
    expect(primary()).toEqual([])
  },
)

it('②b 只有对照原因时：待核对写“没有其他待核对项”，已完成照常给分数', () => {
  previewWith(source.replace('类别: 法器', '类别: 咒符'), [BASE, STAT])
  expect(groups().待核对).toEqual(['没有其他待核对项'])
  expect(ui().querySelector('li[data-kind="clear"]')).not.toBeNull()
  expect(groups().已完成).toEqual(['已识别 6 / 6 行，生成英文预览'])
})

it('②b 对照原因之外的整件问题照常列出，“已完成”只计这些问题', () => {
  previewWith(source.replace('稀有度: 魔法', '稀有度: 传奇'), [STAT])
  expect(groups().待核对).toEqual(['基底译名未匹配或存在歧义，无法确认英文。'])
  expect(groups().已完成).toEqual(['已生成英文预览（1 条问题涉及整件装备，无法定位到行）'])
})

it('②c 解析失败：无法识别装备文本；不出“已完成”组，待核对写具体原因，下一步写 Ctrl+Alt+C', () => {
  const { preview } = previewWith('任意文本', [])
  expect(verdict()?.textContent).toBe('无法识别装备文本两栏仅供对照')
  expect(groups()).toEqual({
    待核对: ['没有找到“物品类别”和“稀有度”行'],
    下一步: ['你粘贴游戏里按 Ctrl+Alt+C 复制的完整装备文本，再点“预览中文转换”'],
  })
  expect(ui().querySelector('[data-group="done"]')).toBeNull()
  expect(primary()).toEqual([preview])
})

it('②c 稀有度认不出：原因带“第 N 行”定位；改动原文后失效态补回“已完成”组', () => {
  const { input } = previewWith('物品类别: 法器\n稀有度: 奇异\n测试', [])
  expect(groups().待核对).toEqual(['第 2 行稀有度“奇异”认不出，应为普通、魔法、稀有或传奇'])
  expect(ui().querySelector('li[data-kind="issue"] button')?.getAttribute('aria-label')).toBe(
    '定位第 2 行',
  )
  input.value += ' '
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(Object.keys(groups())).toEqual(['已完成', '待核对', '下一步'])
  expect(groups().已完成).toEqual(['上次预览已失效，两栏为改动前内容'])
})

it('③ 已填入：下一步交给原站“继续”，没有主按钮；无兼容性提示时“没有待核对项”', () => {
  const { fill } = readyPreview()
  fill.click()
  expect(verdict()?.textContent).toBe('已填入英文尚未导入，导入结果由原站确认')
  expect(groups()).toEqual({
    已完成: ['英文已写入原站导入框（6 行）'],
    待核对: ['没有待核对项'],
    下一步: ['原站点原站的“继续”（Proceed）后由原站完成导入；扩展不会替你提交'],
  })
  expect(primary()).toEqual([])
})

it('④ 原文已改变：清单降级、定位停用，预览是唯一主按钮；填入后再改导入框副句不同', () => {
  const { input, preview } = readyPreview()
  input.value = source.replace('40(36-41)', '42(36-41)')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  preview.click()
  input.value = source
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(ui().querySelector('.check')?.classList.contains('stale')).toBe(true)
  expect((ui().querySelector('.check li button') as HTMLButtonElement).disabled).toBe(true)
  expect(verdict()?.querySelector('span')?.textContent).toBe('原文已改变，请重新预览')
  expect(verdict()?.querySelector('small')?.textContent).toBe('以下为改动前的结果')
  expect(groups()).toEqual({
    已完成: ['上次预览已失效，两栏为改动前内容'],
    待核对: ['第 8 行数值无效或不在原文范围内。'],
    下一步: ['你点“预览中文转换”重新生成'],
  })
  expect(primary()).toEqual([preview])
  preview.click()
  ;(ui().querySelector('.result > button') as HTMLButtonElement).click()
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(verdict()?.querySelector('small')?.textContent).toBe(
    '导入框内容已改变，以下为填入前的结果',
  )
  expect(primary()).toEqual([preview])
})

it('R-T4a 清单三组带 data-group，失效态选择器据此只降前两组', () => {
  readyPreview()
  const keys = [...ui().querySelectorAll('.check .group')].map((g) => g.getAttribute('data-group'))
  expect(keys).toEqual(['done', 'pending', 'next'])
})

it('R-T4a 已失效且副句不变时，后续 input 不重写结论行与清单', () => {
  const { input } = readyPreview()
  input.value = source.replace('40(36-41)', '42(36-41)')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(ui().querySelector('.check')?.classList.contains('stale')).toBe(true)
  const verdictChild = verdict()?.firstElementChild
  const rows = [...ui().querySelectorAll('.check li')]
  expect(rows.length).toBeGreaterThan(0)
  input.value = `${input.value} `
  input.dispatchEvent(new Event('input', { bubbles: true }))
  expect(verdict()?.firstElementChild).toBe(verdictChild)
  const after = [...ui().querySelectorAll('.check li')]
  expect(after).toHaveLength(rows.length)
  after.forEach((row, i) => {
    expect(row).toBe(rows[i])
  })
})

it('已恢复：结论行沿用原句，三组清空，预览是唯一主按钮', () => {
  const { preview, fill } = readyPreview()
  fill.click()
  ;(ui().querySelector('.result > button[data-tertiary]') as HTMLButtonElement).click()
  expect(verdict()?.textContent).toBe('已恢复粘贴原文。修改后请重新预览。')
  expect(ui().querySelector('.check')?.childElementCount).toBe(0)
  expect(primary()).toEqual([preview])
})

it('“继续”与原站按钮译名一致（ui.zh-CN.json 的 Proceed）', () => {
  const entries = JSON.parse(readFileSync('data/l10n/coe-beta/ui.zh-CN.json', 'utf8'))
    .entries as Record<string, string>
  expect(entries.Proceed).toBe('继续')
  const code = readFileSync('apps/poe2-extension/src/content/import-controller.ts', 'utf8')
  expect(code).toContain(`“${entries.Proceed}”（Proceed）`)
})
