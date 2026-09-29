import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { FULL_DISCLAIMER, REPO_ROOT } from '@poe2-tools/ui-theme/compliance'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { parseRules } from '../../../../../packages/ui-theme/src/testing/css'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { SiteFooter } from './SiteFooter'

afterEach(cleanup)

it('页脚带完整声明（spec §5.14、§6.1）与游戏文本版权句', () => {
  render(<SiteFooter />)
  const legal = document.querySelector('.site-legal')
  expect(legal?.textContent).toContain(FULL_DISCLAIMER)
  expect(legal?.textContent).toContain('游戏文本版权归各权利方所有。')
})

it('页脚导航四个链接，“第三方许可”指向 /NOTICE.txt', () => {
  render(<SiteFooter />)
  const nav = screen.getByRole('navigation', { name: '站点信息' })
  expect(
    within(nav)
      .getAllByRole('link')
      .map((link) => [link.textContent, link.getAttribute('href')]),
  ).toEqual([
    ['反馈问题', 'https://github.com/pine2D/poe2-tools/issues'],
    ['查看源码', 'https://github.com/pine2D/poe2-tools'],
    ['扩展隐私说明', '/extension/#privacy'],
    ['第三方许可', '/NOTICE.txt'],
  ])
})

it('≤620px 时页脚链接可点高 ≥44px（spec §5.15）', () => {
  const here = dirname(fsPathFromMetaUrl(import.meta.url))
  const rules = parseRules(readFileSync(resolve(here, '../styles/site.css'), 'utf8'))
  const link = rules.find(
    (rule) =>
      rule.selectors.includes('.site-footer a') && rule.atRules.some((at) => at.includes('620px')),
  )
  expect(link?.declarations.get('min-height')).toBe('44px')
})

it('happy-dom 下导入合规模块不抛错，REPO_ROOT 仍指向仓库根（契约 C18）', () => {
  expect(existsSync(resolve(REPO_ROOT, 'pnpm-workspace.yaml'))).toBe(true)
  expect(existsSync(resolve(REPO_ROOT, 'packages/ui-theme/scripts/compliance.mjs'))).toBe(true)
})
