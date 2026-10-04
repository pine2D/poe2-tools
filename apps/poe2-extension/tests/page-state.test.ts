import { afterEach, expect, it, vi } from 'vitest'
import { snapshot } from '../src/content/page-state'
import { parseReply } from '../src/protocol'

const BETA = 'https://beta.craftofexile.com/?game=poe2'
type Input = Parameters<typeof snapshot>[0]
function input(patch: Partial<Input> = {}): Input {
  return {
    phase: 'ready',
    error: null,
    enabled: true,
    mode: 'zh-CN',
    doc: document,
    href: BETA,
    counters: [],
    ...patch,
  }
}
function page(game: string, key: string, main = '') {
  document.body.innerHTML =
    `<div id="gameToggler"><a class="${game} selected">POE</a></div>` +
    `<div id="languageToggler"><div class="list"><div key="${key}" class="active">Lang</div></div></div>` +
    `<main>${main}</main>`
}
afterEach(() => {
  document.body.innerHTML = ''
})

it('生效：已翻译处数为各层计数之和；恰好 8 个协议字段，弹窗 parseReply 原样接受', () => {
  page('poe2', 'us', '<div id="searchItemInput"><input></div>')
  const reply = snapshot(input({ counters: [() => 3, () => 2] }))
  expect(reply).toEqual({
    v: 1,
    phase: 'ready',
    error: null,
    page: 'supported',
    enabled: true,
    translated: 5,
    search: 'ok',
    searchMissing: [],
  })
  expect(parseReply(reply)).toEqual(reply)
})

it('mode 为空（关闭或不满足条件）：不调用计数、不查搜索框，translated 为 0、search 为 none', () => {
  page('poe2', 'us', '<div id="searchItemInput"></div>')
  const count = vi.fn(() => 9)
  expect(snapshot(input({ mode: '', enabled: false, counters: [count] }))).toMatchObject({
    enabled: false,
    translated: 0,
    search: 'none',
    searchMissing: [],
  })
  expect(count).not.toHaveBeenCalled()
})

it.each([
  ['poe2', 'us', 'supported'],
  ['poe2', 'cn', 'english-required'],
  ['poe2', 'tw', 'english-required'],
  ['poe1', 'us', 'unsupported'],
])('页面状态在应答时现算：游戏 %s、语言 %s → %s', (game, key, expected) => {
  page(game, key)
  expect(snapshot(input({ mode: '' })).page).toBe(expected)
})

it('认不出原站的游戏或语言控件（还没渲染完或改版）为 unknown', () => {
  document.body.innerHTML = '<main></main>'
  expect(snapshot(input({ mode: '' })).page).toBe('unknown')
  page('poe2', 'us')
  document
    .querySelector('#languageToggler .list')
    ?.insertAdjacentHTML('beforeend', '<div key="tw" class="active">Lang</div>')
  expect(snapshot(input({ mode: '' })).page).toBe('unknown')
})

it('阶段与错误类别原样转交', () => {
  page('poe2', 'us')
  expect(snapshot(input({ phase: 'failed', error: 'dictionary', mode: '' }))).toMatchObject({
    phase: 'failed',
    error: 'dictionary',
    translated: 0,
  })
  expect(snapshot(input({ phase: 'starting', mode: '' }))).toMatchObject({
    phase: 'starting',
    error: null,
  })
})

it('生效模式下认得的搜索容器缺输入框：search=missing，并按用途列出', () => {
  page(
    'poe2',
    'us',
    '<div id="searchItemInput"><div class="custom-select"></div></div><div id="searchInput"><input type="text"></div>',
  )
  expect(snapshot(input({ counters: [() => 40] }))).toMatchObject({
    translated: 40,
    search: 'missing',
    searchMissing: ['base'],
  })
})

it('应答不含网址、查询参数与页面文字', () => {
  page('poe2', 'us', '<p>Secret build notes</p>')
  const text = JSON.stringify(
    snapshot(input({ href: 'https://beta.craftofexile.com/?token=abc123' })),
  )
  expect(text).not.toContain('craftofexile')
  expect(text).not.toContain('abc123')
  expect(text).not.toContain('Secret')
})
