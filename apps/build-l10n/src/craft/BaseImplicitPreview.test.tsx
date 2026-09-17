import type { CatalogBase } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { BaseImplicitPreview } from './BaseImplicitPreview'

afterEach(cleanup)
const base: CatalogBase = {
  id: 'skill-amulet',
  name: 'Synthetic Skill Amulet',
  type: 'Amulet',
  tags: ['amulet'],
  requirements: {},
  properties: {},
  implicitTags: [],
  sourceQuality: null,
  socketLimit: null,
  hidden: false,
  runeforged: false,
  variantList: ['Arctic Armour', 'Herald of Ash'],
  implicit:
    '-1 Prefix Modifier allowed\n{variant:1}Grants Skill: Level (1-20) Arctic Armour\n{variant:2}Grants Skill: Level (1-20) Herald of Ash',
}

it('候选技能先不择一，切换只展示所选项并提供中文翻译', () => {
  const before = JSON.stringify(base)
  render(
    <BaseImplicitPreview
      base={base}
      translateLine={(line) =>
        line.endsWith('Arctic Armour') ? '获得技能: 等级 (1-20) 极地装甲' : null
      }
    />,
  )
  expect(screen.getByText('-1 Prefix Modifier allowed')).toBeTruthy()
  expect(screen.getByText(/只授予其中一项技能/)).toBeTruthy()
  const select = screen.getByLabelText('查看候选技能') as HTMLSelectElement
  expect(select.value).toBe('')
  expect(screen.queryByText('Grants Skill: Level (1-20) Arctic Armour')).toBeNull()
  fireEvent.change(select, { target: { value: '1' } })
  expect(screen.getByText('Grants Skill: Level (1-20) Arctic Armour')).toBeTruthy()
  expect(screen.getAllByText('获得技能: 等级 (1-20) 极地装甲').length).toBeGreaterThan(0)
  fireEvent.change(select, { target: { value: '2' } })
  expect(screen.queryByText('Grants Skill: Level (1-20) Arctic Armour')).toBeNull()
  expect(screen.getByText('Grants Skill: Level (1-20) Herald of Ash')).toBeTruthy()
  expect(JSON.stringify(base)).toBe(before)
})

it('普通基底与无法解释的来源仍展示原文，不能伪造候选', () => {
  render(<BaseImplicitPreview base={{ ...base, implicit: '{variant:99}Unknown' }} />)
  expect(screen.getByText('{variant:99}Unknown')).toBeTruthy()
  expect(screen.queryByLabelText('查看候选技能')).toBeNull()
})
