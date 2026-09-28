import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ExtensionPage } from './ExtensionPage'

afterEach(cleanup)
it('预览版安装不伪装为商店安装，明确支持范围与升级步骤', () => {
  render(<ExtensionPage />)
  expect(screen.getByRole('link', { name: /查看源码与构建说明/ }).getAttribute('href')).toContain(
    'install.md',
  )
  expect(screen.getByText(/尚未提供公开发行包/)).toBeDefined()
  expect(
    screen.getByRole('link', { name: '下载源码 ZIP（需构建）' }).getAttribute('href'),
  ).toContain('/archive/a68f6d8bacc7f336f6136a91665ca027063a536c.zip')
  expect(screen.getByText(/pnpm extension:build/)).toBeDefined()
  expect(screen.getByText(/pnpm extension:check/)).toBeDefined()
  expect(screen.queryByText(/pnpm extension:package/)).toBeNull()
  expect(screen.getByRole('heading', { name: '安装开发预览版' })).toBeDefined()
  expect(screen.getByRole('heading', { name: '更新与恢复' })).toBeDefined()
  expect(screen.getByRole('link', { name: /打开 CoE Beta/ }).getAttribute('href')).toBe(
    'https://beta.craftofexile.com/?game=poe2',
  )
})
