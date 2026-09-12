import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NumericControls } from './NumericControls'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Editor() {
  const [values, setValues] = useState([12, 3])
  return (
    <NumericControls
      label="测试词缀"
      patterns={['Adds (10-20) to (3-5) Damage', 'Grants Level 12 Skill']}
      values={values}
      onChange={setValues}
    />
  )
}

describe('NumericControls', () => {
  it('编辑范围值并预览，固定数字不产生输入', () => {
    render(<Editor />)
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('测试词缀 · 数值 1'), { target: { value: '18' } })
    expect(screen.getByText('Adds 18(10-20) to 3(3-5) Damage')).toBeDefined()
    expect(screen.getByText('Grants Level 12 Skill')).toBeDefined()
  })
  it('空白和超范围值显示错误，不默认为 0', () => {
    render(<Editor />)
    fireEvent.change(screen.getByLabelText('测试词缀 · 数值 1'), { target: { value: '' } })
    expect(screen.getByRole('alert')).toBeDefined()
    expect((screen.getByLabelText('测试词缀 · 数值 1') as HTMLInputElement).value).toBe('')
    fireEvent.change(screen.getByLabelText('测试词缀 · 数值 1'), { target: { value: '21' } })
    expect(screen.getByRole('alert')).toBeDefined()
  })
  it('试掷使用可验证的范围模型并显式说明假设', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    render(<Editor />)
    fireEvent.click(screen.getByRole('button', { name: '按范围试掷：测试词缀' }))
    expect(screen.getByText('Adds 10(10-20) to 3(3-5) Damage')).toBeDefined()
    expect(screen.getByText(/独立等概率/)).toBeDefined()
  })
})
