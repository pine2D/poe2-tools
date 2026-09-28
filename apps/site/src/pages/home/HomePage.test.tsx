import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { HomePage } from './HomePage'

afterEach(cleanup)
it('按任务提供两个直达入口，不推荐已搁置的工坊', () => {
  render(<HomePage />)
  expect(screen.getByRole('link', { name: /打开构筑汉化/ }).getAttribute('href')).toBe('/build/')
  expect(screen.getByRole('link', { name: /查看扩展与安装方式/ }).getAttribute('href')).toBe(
    '/extension/',
  )
  expect(document.querySelector('a[href="/craft/"]')).toBeNull()
  expect(screen.getByText(/开发预览/)).toBeDefined()
})
it('主题选择与工作台共享本地偏好', () => {
  render(<HomePage />)
  fireEvent.change(screen.getByRole('combobox', { name: '界面主题' }), {
    target: { value: 'dark' },
  })
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('poe2-tools.theme')).toBe('dark')
})
