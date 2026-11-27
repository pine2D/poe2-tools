import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { CRAFT_RULES_VERSION } from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { miniBundle } from '../../../../../packages/build-core/src/testing/miniDict'
import {
  catalog as makeCatalog,
  state,
} from '../../../../../packages/item-core/src/partialTargetFixture'
import { parseRules } from '../../../../../packages/ui-theme/src/testing/css'
import { createDictLoader } from '../../shared/dict/loadDict'
import { fakeDictFetch } from '../../shared/testing/fakeDictFetch'
import { fsPathFromMetaUrl } from '../../shared/testing/fsPath'
import { ComparisonDictionaryLoader } from './ProjectComparison'
import { ProjectControls, REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { LIBRARY_PREFIX } from './projectLibrary'
import { RECOVERY_KEY } from './projectRecovery'
import { RehearsalPanel } from './RehearsalPanel'

const catalog = makeCatalog()
const initial = state('normal')
const project = {
  schemaVersion: 1,
  rulesVersion: CRAFT_RULES_VERSION,
  sourceCommit: catalog._meta.sourceCommit,
  initialState: initial,
  operations: [{ currency: 'transmutation', modIds: ['p1'] }],
  cursor: 1,
  targetModIds: ['p1'],
}
function save(id: string, name: string, text: string) {
  localStorage.setItem(
    LIBRARY_PREFIX + id,
    JSON.stringify({ version: 1, name, savedAt: '2026-11-27T00:00:00Z', text }),
  )
}
function open() {
  fireEvent.click(screen.getByText('演练收藏'))
  const trigger = screen.getByRole('button', { name: '比较收藏' })
  fireEvent.click(trigger)
  return trigger
}
function select(side: string, id: string) {
  fireEvent.change(screen.getByLabelText(side), { target: { value: LIBRARY_PREFIX + id } })
}
const storage = () =>
  Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    .filter((key): key is string => key !== null)
    .sort()
    .map((key) => [key, localStorage.getItem(key)])
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

it('窄栏允许长收藏名换行，两份结果保持第一份在前的阅读顺序', async () => {
  const longName = 'W'.repeat(80)
  save('a', longName, JSON.stringify(project))
  save('b', '第二条路线', JSON.stringify(project))
  render(<ProjectControls catalog={catalog} onRestore={vi.fn()} />)
  open()
  select('第一份收藏', 'a')
  select('第二份收藏', 'b')
  fireEvent.click(screen.getByRole('button', { name: '查看比较' }))
  const results = await screen.findByRole('region', { name: '收藏比较结果' })
  const sides = within(results).getAllByRole('region')
  expect(sides.map((side) => side.getAttribute('aria-label'))).toEqual([
    `第一份 ${longName}`,
    '第二份 第二条路线',
  ])
  const stylesheet = resolve(dirname(fsPathFromMetaUrl(import.meta.url)), 'project-library.css')
  const rules = parseRules(readFileSync(stylesheet, 'utf8'))
  const style = (selector: string, prop: string) =>
    rules.find((rule) => rule.selectors.includes(selector))?.declarations.get(prop)
  expect(sides[0]?.parentElement?.classList.contains('project-comparison-pair')).toBe(true)
  expect(style('.project-comparison-pair', 'grid-template-columns')).toBe(
    'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))',
  )
  expect(style('.project-comparison-side', 'min-inline-size')).toBe('0')
  expect(style('.project-comparison', 'overflow-wrap')).toBe('anywhere')
})

it('活动演练有待应用草稿时，取消与退出比较均回焦，手动保存、恢复记录和收藏保持原样', async () => {
  save('a', '同名', JSON.stringify(project))
  save('b', '同名', JSON.stringify({ ...project, cursor: 0 }))
  localStorage.setItem(REHEARSAL_PROJECT_KEY, JSON.stringify(project))
  localStorage.setItem(
    'poe2-tools.craft.project',
    JSON.stringify({ version: 1, rawText: '自造文本' }),
  )
  localStorage.setItem(RECOVERY_KEY, '原恢复记录')
  render(<RehearsalPanel catalog={catalog} initialState={initial} translations={{}} />)
  fireEvent.click(screen.getByRole('button', { name: '蜕变石' }))
  fireEvent.click(within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /p1/ }))
  const draft = screen.getByLabelText('本次指定结果')
  const beforeDraft = draft.textContent
  const before = storage()
  const trigger = open()
  expect(document.activeElement).toBe(screen.getByLabelText('第一份收藏'))
  select('第一份收藏', 'a')
  fireEvent.click(screen.getByRole('button', { name: '取消比较' }))
  expect(document.activeElement).toBe(trigger)
  fireEvent.click(trigger)
  select('第一份收藏', 'a')
  select('第二份收藏', 'b')
  fireEvent.click(screen.getByRole('button', { name: '查看比较' }))
  const preview = await screen.findByRole('region', { name: '收藏比较结果' })
  expect(document.activeElement).toBe(preview)
  expect(preview.textContent).toContain('蜕变石 × 1')
  expect(preview.textContent).toContain('尚未消耗材料')
  expect(preview.textContent).toContain('已达成')
  expect(preview.textContent).toContain('尚未达成')
  fireEvent.keyDown(preview, { key: 'Escape' })
  expect(screen.queryByRole('region', { name: '收藏比较结果' })).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(storage()).toEqual(before)
  expect(draft.textContent).toBe(beforeDraft)
  expect((screen.getByRole('button', { name: '应用本次结果' }) as HTMLButtonElement).disabled).toBe(
    false,
  )
})

it('空工作台也可比较收藏，损坏与不同起点给出原因，修正选择后可再比较', async () => {
  save('a', '起点', JSON.stringify(project))
  save('b', '另一件', JSON.stringify({ ...project, initialState: { ...initial, itemLevel: 84 } }))
  save('c', '损坏项目', '{')
  save('d', '另一份可用收藏', JSON.stringify(project))
  localStorage.setItem(`${LIBRARY_PREFIX}bad`, '{')
  const restore = vi.fn()
  render(<ProjectControls catalog={catalog} onRestore={restore} />)
  const trigger = open()
  select('第一份收藏', 'a')
  for (const [id, reason] of [
    ['c', /第二份.*JSON/],
    ['b', /起始装备.*物等|物等.*起点/],
  ] as const) {
    select('第二份收藏', id)
    fireEvent.click(screen.getByRole('button', { name: '查看比较' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(reason)
    expect(screen.queryByRole('region', { name: '收藏比较结果' })).toBeNull()
  }
  const second = screen.getByLabelText<HTMLSelectElement>('第二份收藏')
  expect(
    Array.from(second.options).find((option) => option.value === `${LIBRARY_PREFIX}a`)?.disabled,
  ).toBe(true)
  expect(
    Array.from(second.options).find((option) => option.value === `${LIBRARY_PREFIX}bad`)?.disabled,
  ).toBe(true)
  select('第二份收藏', 'd')
  fireEvent.click(screen.getByRole('button', { name: '查看比较' }))
  const preview = await screen.findByRole('region', { name: '收藏比较结果' })
  fireEvent.click(within(preview).getByRole('button', { name: '重新选择' }))
  expect(document.activeElement).toBe(screen.getByLabelText('第一份收藏'))
  fireEvent.click(screen.getByRole('button', { name: '查看比较' }))
  fireEvent.click(await screen.findByRole('button', { name: '退出比较' }))
  expect(document.activeElement).toBe(trigger)
  expect(restore).not.toHaveBeenCalled()
  expect(localStorage.getItem(`${LIBRARY_PREFIX}bad`)).toBe('{')
})

it('按两份收藏原文分别读地区词典，加载时取消后不会弹出过期结果', async () => {
  const originals = [
    ['cn', '物品类别: 法器\n稀有度: 普通\n测试法器\n--------\n物品等级: 70'],
    ['tw', '物品種類: 法器\n稀有度: 普通\n測試法器\n--------\n物品等級: 70'],
  ] as const
  for (const [id, sourceText] of originals)
    save(id, id, JSON.stringify({ ...project, initialState: { ...initial, sourceText } }))
  const items = miniBundle.items
  if (!items) throw Error('夹具缺少物品表')
  const fake = (name: string) =>
    fakeDictFetch({ ...miniBundle, items: { ...items, bases: { ...items.bases, Focus: name } } })
  const cn = fake('测试法器')
  const tw = fake('測試法器')
  let finishLoading: () => void = () => {}
  const loading = new Promise<void>((resolve) => {
    finishLoading = resolve
  })
  const loader = createDictLoader('/', async (url) => {
    await loading
    return url.startsWith('/dict/zh-TW/') ? tw(url) : cn(url)
  })
  const restore = vi.fn()
  render(
    <ComparisonDictionaryLoader.Provider value={loader}>
      <ProjectControls catalog={catalog} onRestore={restore} />
    </ComparisonDictionaryLoader.Provider>,
  )
  const before = storage()
  const trigger = open()
  const compare = () => {
    select('第一份收藏', 'cn')
    select('第二份收藏', 'tw')
    fireEvent.click(screen.getByRole('button', { name: '查看比较' }))
  }
  compare()
  expect(document.activeElement).toBe(screen.getByRole('region', { name: '选择比较的收藏' }))
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
  await act(async () => finishLoading())
  expect(screen.queryByRole('region', { name: '收藏比较结果' })).toBeNull()
  expect(document.activeElement).toBe(trigger)
  fireEvent.click(trigger)
  compare()
  expect((await screen.findByRole('region', { name: '收藏比较结果' })).textContent).toContain(
    '词缀、数值和标记均一致',
  )
  expect(storage()).toEqual(before)
  expect(restore).not.toHaveBeenCalled()
})
