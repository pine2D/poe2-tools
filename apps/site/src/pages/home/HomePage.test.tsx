import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
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
  expect(screen.getByText(/开发预览/)).toBeDefined()
})
it('旧版本留下的浅色偏好不再生效：页面不写 data-theme，也没有主题控件（spec D2）', () => {
  localStorage.setItem('poe2-tools.theme', 'light')
  document.documentElement.removeAttribute('data-theme')
  render(<HomePage />)
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(screen.queryByRole('combobox', { name: '界面主题' })).toBeNull()
  localStorage.removeItem('poe2-tools.theme')
})
