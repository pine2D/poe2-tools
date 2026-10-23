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
  // B4-09、B4-17：物品提示框两面叠放，只在主动点击后翻面；按钮名是可见的动作文字，不用 aria-label 盖住物品内容
  it('装备示例默认中文在前，只在用户主动翻面后英文在前；后卡对读屏隐藏', () => {
    render(<HomePage />)
    const figure = screen.getByRole('figure', { name: '装备文本示意 · 自造样本' })
    const front = () => figure.querySelector('.home-tip--front') as HTMLElement
    const back = () => figure.querySelector('.home-tip--back') as HTMLElement
    expect(front().getAttribute('lang')).toBe('zh-CN')
    expect(front().hasAttribute('aria-hidden')).toBe(false)
    expect(back().getAttribute('aria-hidden')).toBe('true')
    expect(front().querySelector('.home-tip__name')?.textContent).toBe('蓝玉戒指')
    expect(front().querySelector('.home-tip__name')?.className).toBe('pt-subhead home-tip__name')
    expect(back().querySelector('.home-tip__name')?.className).toBe(
      'pt-nameplate__en home-tip__name',
    )
    // 两端渐隐分隔线与居中：每面都有顶栏、分隔线与词缀区
    for (const tip of figure.querySelectorAll('.home-tip')) {
      expect([...tip.children].map((child) => child.className)).toEqual([
        'home-tip__head',
        'home-tip__sep',
        'home-tip__body',
      ])
    }
    const flip = within(figure).getByRole('button', { name: '翻面 · 查看英文原文' })
    expect(flip.hasAttribute('aria-label')).toBe(false)
    expect(flip.hasAttribute('aria-pressed')).toBe(false)
    expect(front().textContent).toContain('+60 生命上限')
    fireEvent.click(flip)
    expect(flip.textContent).toBe('翻面 · 查看中文')
    expect(front().getAttribute('lang')).toBe('en')
    expect(front().textContent).toContain('+60 to maximum Life')
    expect(back().getAttribute('lang')).toBe('zh-CN')
    fireEvent.click(flip)
    expect(front().getAttribute('lang')).toBe('zh-CN')
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
    // B4-08：每条候选只有中文、英文两行，不再有独占一行的箭头
    for (const opt of demo.querySelectorAll('.l1demo__opt')) {
      expect(opt.children).toHaveLength(2)
      expect(opt.textContent).not.toContain('→')
    }
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
    // 提示框的词缀与类别名：词缀取自正式词典 stats.json，类别名取自 CoE 界面译名
    const root = resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../../data')
    const stats = JSON.parse(readFileSync(`${root}/dict/zh-CN/stats.json`, 'utf8')) as {
      entries: { en: string; text: string }[]
    }
    const stat = (en: string) => stats.entries.find((entry) => entry.en === en)?.text
    expect(stat('# to maximum Life')).toBe('# 生命上限')
    expect(stat('#% to Fire Resistance')).toBe('火焰抗性 #%')
    const ui = JSON.parse(readFileSync(`${root}/l10n/coe-beta/ui.zh-CN.json`, 'utf8')) as {
      entries: Record<string, string>
    }
    expect(ui.entries.Rings).toBe('戒指')
    const zh = document.querySelector('.home-tip[lang="zh-CN"]') as HTMLElement
    expect(
      [...zh.querySelectorAll('.home-tip__body > span')].map((span) => span.textContent),
    ).toEqual(['+60 生命上限', '火焰抗性 +30%'])
    expect(zh.querySelector('.home-tip__cls')?.textContent).toBe('戒指')
    expect(document.body.textContent).toContain('词典里没有的行保留英文原文并标出，不猜测替换。')
    expect(document.body.textContent).toContain(
      '简体与繁体译名按国服、台服分别整理，不做繁简互转。',
    )
    expect(screen.getByRole('region', { name: COE_SCENE }).textContent).toContain(
      '部分装备的国服文本可转成英文导入（支持范围见介绍页）。',
    )
  })
})
