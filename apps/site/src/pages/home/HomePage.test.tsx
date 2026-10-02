import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { parseRules } from '../../../../../packages/ui-theme/src/testing/css'
import { fsPathFromMetaUrl } from '../../shared/testing/fsPath'
import { HomePage } from './HomePage'

afterEach(cleanup)
it('按任务提供两个直达入口，不推荐已搁置的工坊', () => {
  render(<HomePage />)
  expect(screen.getAllByRole('link', { name: /打开构筑汉化/ })[0]?.getAttribute('href')).toBe(
    '/build/',
  )
  expect(screen.getByRole('link', { name: /查看扩展与安装方式/ }).getAttribute('href')).toBe(
    '/extension/',
  )
  expect(document.querySelector('a[href="/craft/"]')).toBeNull()
  expect(screen.getByText('可直接下载 · 电脑版 Chrome')).toBeDefined()
  expect(screen.queryByText(/开发预览|需自行构建/)).toBeNull()
})
it('旧版本留下的浅色偏好不再生效：页面不写 data-theme，也没有主题控件（spec D2）', () => {
  localStorage.setItem('poe2-tools.theme', 'light')
  document.documentElement.removeAttribute('data-theme')
  render(<HomePage />)
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(screen.queryByRole('combobox', { name: '界面主题' })).toBeNull()
  localStorage.removeItem('poe2-tools.theme')
})

it('一扇没有标题栏的 hero 框装着 hero 与两张入口卡，不嵌套框（spec §4.2、§6.2）', () => {
  render(<HomePage />)
  const frames = document.querySelectorAll('.pt-frame')
  expect(frames).toHaveLength(1)
  const frame = frames[0]
  expect(frame?.getAttribute('class')).toBe('pt-frame pt-frame--hero')
  expect(frame?.querySelector(':scope > .pt-titlebar')).toBeNull()
  expect(frame?.querySelector('.pt-frame')).toBeNull()
  const title = screen.getByRole('heading', { level: 1 })
  expect(title.getAttribute('class')).toBe('pt-hero-title')
  expect(title.querySelector('.pt-hero-title__gold')?.textContent).toBe('多研究构筑。')
  expect(frame?.querySelector('.pt-divider--hero')).not.toBeNull()
})

it('入口卡是带标题栏与 chip 的 pt-panel card；唯一的金属主按钮是构筑卡的“打开构筑汉化”', () => {
  render(<HomePage />)
  const cards = [...document.querySelectorAll('.tool-entry')]
  expect(cards.map((card) => card.getAttribute('class'))).toEqual([
    'pt-panel pt-panel--card pt-panel--titled tool-entry',
    'pt-panel pt-panel--card pt-panel--titled tool-entry',
  ])
  expect(
    cards.map((card) => [
      card.querySelector('h2.pt-titlebar__title--lg')?.textContent,
      card.querySelector('.pt-titlebar > .pt-chip')?.textContent,
    ]),
  ).toEqual([
    ['构筑汉化', '网页工具'],
    ['PoE2 中文助手', 'Chrome 扩展'],
  ])
  const forge = document.querySelectorAll('.pt-forge-btn')
  expect(forge).toHaveLength(1)
  expect(forge[0]?.getAttribute('class')).toBe('pt-forge-btn pt-forge-btn--wide')
  expect(forge[0]?.getAttribute('href')).toBe('/build/')
  expect(cards[0]?.contains(forge[0] ?? null)).toBe(true)
  const extension = within(cards[1] as HTMLElement).getByRole('link', {
    name: /查看扩展与安装方式/,
  })
  expect(extension.getAttribute('class')).toBe('pt-btn pt-btn--wide')
  expect(cards[0]?.querySelector('.pt-divider--indent')).not.toBeNull()
})

it('窄屏快捷入口：“构筑汉化”用默认 pt-btn，“中文助手”用 pt-btn--quiet（spec §6.7）', () => {
  render(<HomePage />)
  const shortcuts = screen.getByRole('navigation', { name: '快速打开工具' })
  expect(
    within(shortcuts)
      .getAllByRole('link')
      .map((link) => [link.getAttribute('class'), link.getAttribute('href')]),
  ).toEqual([
    ['pt-btn', '/build/'],
    ['pt-btn pt-btn--quiet', '/extension/'],
  ])
})

it('“本次站点更新”里的站内链接用“→”，页面上不再有外链箭头“↗”（spec §6.2）', () => {
  render(<HomePage />)
  const notes = screen.getByRole('region', { name: '本次站点更新' })
  expect(within(notes).getByRole('link').textContent).toBe('打开构筑汉化 →')
  expect(notes.querySelector('.pt-divider')).not.toBeNull()
  expect(document.body.textContent).not.toContain('↗')
})

it('621–850px 入口卡改单列，通栏按钮不撑出卡片（spec §6.7 621–850px 一条）', () => {
  const css = readFileSync(
    resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../shared/styles/home.css'),
    'utf8',
  )
  const pair = parseRules(css).find(
    (rule) =>
      rule.selectors.includes('.tool-pair') && rule.atRules.some((at) => at.includes('850px')),
  )
  expect(pair?.declarations.get('grid-template-columns')).toBe('minmax(0, 1fr)')
})
