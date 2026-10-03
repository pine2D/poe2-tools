import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fsPathFromMetaUrl } from '../../shared/testing/fsPath'
import { EXAMPLE_SERIES } from './example'

const dictDir = `${resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../../data/dict/zh-CN')}/`
const read = (name: string) => readFileSync(`${dictDir}${name}`, 'utf8')

interface ExampleBuild {
  name: string
  link: string
  passives: string[]
  skills: { id: string; support_skills?: string[] }[]
  inventory_slots: { additional_text?: string; unique_name?: string }[]
}
const builds = EXAMPLE_SERIES.map((item) => JSON.parse(item.text) as ExampleBuild)
const tail = (id: string) => id.slice(id.lastIndexOf('/') + 1)

describe('EXAMPLE_SERIES', () => {
  it('三份文件同属一个构筑，名称按“阶段 - 构筑名”书写', () => {
    expect(EXAMPLE_SERIES.map((item) => item.name)).toEqual([
      'example-1.build',
      'example-2.build',
      'example-3.build',
    ])
    expect(new Set(builds.map((b) => b.link)).size).toBe(1)
    expect(builds.map((b) => b.name)).toEqual([
      '1–30 级 - 示例构筑（自造）',
      '31–60 级 - 示例构筑（自造）',
      '终局 - 示例构筑（自造）',
    ])
  })
  it('天赋点数逐阶段增加，保证排序与导入顺序无关', () => {
    const counts = builds.map((b) => b.passives.length)
    expect(counts).toEqual([...counts].sort((a, b) => a - b))
    expect(new Set(counts).size).toBe(3)
  })
  it('用到的基底、传奇、宝石与天赋都在正式 zh-CN 词典里（演示时不出现意外的待核对）', () => {
    const items = read('items.json')
    const gems = read('gems.json')
    const passives = read('passives.json')
    for (const build of builds) {
      for (const slot of build.inventory_slots) {
        const base = slot.additional_text?.split('\n')[0]
        if (base !== undefined) expect(items, base).toContain(`"${base}"`)
        if (slot.unique_name !== undefined)
          expect(items, slot.unique_name).toContain(`"${slot.unique_name}"`)
      }
      for (const skill of build.skills) {
        expect(gems, skill.id).toContain(`"${tail(skill.id)}"`)
        for (const support of skill.support_skills ?? [])
          expect(gems, support).toContain(`"${tail(support)}"`)
      }
      for (const id of build.passives) expect(passives, id).toContain(`"${id}"`)
    }
  })
})
