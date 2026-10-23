import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { L1_DEMO_CANDIDATES, L1_DEMO_LABEL } from '../../shared/l1Demo'
import { fsPathFromMetaUrl } from '../../shared/testing/fsPath'
import { HomePage } from './HomePage'

afterEach(cleanup)

const BUILD_SCENE = '我拿到了一份英文 .build'
const COE_SCENE = '我在 Craft of Exile 做装'

describe('v4 首页', () => {
  it('装备示例默认中文，只在用户主动翻面后显示英文，状态与内容同步', () => {
    render(<HomePage />)
    const flip = screen.getByRole('button', { name: '中英装备示例翻面' })
    expect(flip.getAttribute('aria-pressed')).toBe('false')
    expect(flip.textContent).toContain('蓝玉戒指')
    fireEvent.click(flip)
    expect(flip.getAttribute('aria-pressed')).toBe('true')
    expect(flip.textContent).toContain('Sapphire Ring')
    expect(flip.textContent).toContain('+60 to maximum Life')
    fireEvent.click(flip)
    expect(flip.getAttribute('aria-pressed')).toBe('false')
    expect(flip.textContent).toContain('+60 生命上限')
  })

  it('主视觉和工具区入口去往正确页面，工具区附适用范围，不推荐冻结工坊', () => {
    render(<HomePage />)
    for (const [name, href] of [
      ['打开构筑汉化', '/build/'],
      ['安装中文助手', '/extension/'],
    ] as const) {
      const links = screen.getAllByRole('link', { name })
      expect(links).toHaveLength(2)
      for (const link of links) expect(link.getAttribute('href')).toBe(href)
    }
    for (const scene of [BUILD_SCENE, COE_SCENE]) {
      const link = within(screen.getByRole('region', { name: scene })).getByRole('link')
      expect(
        document.getElementById(link.getAttribute('aria-describedby') ?? '')?.textContent,
      ).toMatch(/国服/)
    }
    expect(document.querySelector('a[href="/craft/"]')).toBeNull()
    expect(
      within(screen.getByRole('region', { name: BUILD_SCENE })).getByText('尚未在游戏里实测加载。'),
    ).toBeDefined()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      BUILD_SCENE,
      COE_SCENE,
    ])
  })

  it('两个工具示意分别跟随所属说明，标明自造或自绘，候选不伪装成可操作原站', () => {
    render(<HomePage />)
    const build = screen.getByRole('region', { name: BUILD_SCENE })
    const coe = screen.getByRole('region', { name: COE_SCENE })
    expect(within(build).getByRole('figure', { name: /自造/ })).toBeDefined()
    const demo = within(coe).getByRole('figure', { name: /自绘示意，不是 CoE 截图/ })
    expect(demo.querySelectorAll('button, input, [tabindex], [aria-selected]')).toHaveLength(0)
    expect(demo.querySelector('.l1demo__label')?.textContent).toBe(L1_DEMO_LABEL)
    expect(
      [...demo.querySelectorAll('.l1demo__opt')].map((opt) => [
        opt.firstElementChild?.textContent,
        opt.querySelector('[lang="en"]')?.textContent,
      ]),
    ).toEqual(L1_DEMO_CANDIDATES.map(([zh, en]) => [zh, en]))
  })

  it('装备示例名称取自正式国服词典，未命中和简繁边界有说明', () => {
    render(<HomePage />)
    const items = JSON.parse(
      readFileSync(
        resolve(
          dirname(fsPathFromMetaUrl(import.meta.url)),
          '../../../../../data/dict/zh-CN/items.json',
        ),
        'utf8',
      ),
    ) as { bases: Record<string, string>; uniques: Record<string, string> }
    for (const cell of document.querySelectorAll('.mini-cell')) {
      const en = cell.querySelector('.mini-cell__en [lang="en"]')?.textContent ?? ''
      expect(items.bases[en] ?? items.uniques[en], en).toBe(
        cell.querySelector('.mini-cell__zh')?.textContent,
      )
    }
    expect(items.bases['Sapphire Ring']).toBe('蓝玉戒指')
    expect(document.body.textContent).toContain('词典里没有的行保留英文原文并标出，不猜测替换。')
    expect(document.body.textContent).toContain(
      '简体与繁体译名按国服、台服分别整理，不做繁简互转。',
    )
    expect(screen.getByRole('region', { name: COE_SCENE }).textContent).toContain(
      '部分装备的国服文本可转成英文导入（支持范围见介绍页）。',
    )
  })
})
