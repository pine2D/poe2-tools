import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { miniBundle, miniIndex } from '../../../../packages/build-core/src/testing/miniDict'
import type { LoadedDict } from '../dict/loadDict'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { translateSource } from '../translate/runTranslation'
import { buildFieldRows, listFields } from './fields'
import { collectMisses, domIdFor, jumpTo, rowDomId } from './locate'

const fixtures = `${resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/fixtures/synthetic')}/`
const dict: LoadedDict = {
  locale: 'zh-CN',
  bundle: miniBundle,
  index: miniIndex,
  info: { gameVersion: '0.0.0', leagueName: null },
  missing: [],
}
const result = translateSource(
  { id: 'f1', name: 'rich.build', text: readFileSync(`${fixtures}rich.build`, 'utf8') },
  dict,
  { bilingual: false, annotateUniques: true },
)
if (!result.ok) throw new Error(result.error)
const file = result.file

describe('listFields', () => {
  it('按显示顺序枚举全部可翻译字段，并给出人话定位', () => {
    const paths = listFields(file).map((entry) => entry.path)
    expect(paths[0]).toBe('description')
    expect(paths).toContain('inventory_slots[0].additional_text')
    expect(paths).toContain('skills[0].support_skills[1].additional_text')
    expect(paths).toContain('passives[1].additional_text')
    const labels = new Map(listFields(file).map((entry) => [entry.path, entry.label]))
    expect(labels.get('description')).toBe('构筑说明')
    expect(labels.get('inventory_slots[0].additional_text')).toBe('主手')
    expect(labels.get('inventory_slots[3].additional_text')).toBe('戒指 2')
    expect(labels.get('skills[0].additional_text')).toBe('烈焰冲击')
    expect(labels.get('skills[0].support_skills[1].additional_text')).toBe(
      '烈焰冲击 · Metadata/Items/Gems/SupportGemSearingFlameTwo',
    )
  })

  it('传奇槽位即使原本没有备注也在列，并带上译名', () => {
    const belt = listFields(file).find(
      (entry) => entry.path === 'inventory_slots[1].additional_text',
    )
    expect(belt?.label).toBe('腰带')
    expect(belt?.original).toBeNull()
    expect(belt?.uniqueText).toBe('稳步印记')
  })
})

describe('domId', () => {
  it('路径转成合法且唯一的 id', () => {
    expect(domIdFor('inventory_slots[3].additional_text')).toBe(
      'line-inventory-slots-3-additional-text',
    )
    expect(rowDomId('inventory_slots[3].additional_text', 3)).toBe(
      'line-inventory-slots-3-additional-text-3',
    )
    expect(domIdFor('description')).toBe('line-description')
  })
})

describe('collectMisses', () => {
  it('名称未收录进入待核对，自由备注不算问题，词缀统计不变', () => {
    const result = translateSource(
      {
        id: 'names',
        name: 'names.build',
        text: JSON.stringify({
          name: 'Names',
          description: 'A free note',
          inventory_slots: [
            {
              inventory_id: 'Weapon1',
              additional_text: 'Unknown Staff\n1. 149% increased Spell Damage',
            },
            { inventory_id: 'Belt1', unique_name: 'Unknown Unique' },
          ],
        }),
      },
      dict,
      { bilingual: false, annotateUniques: true },
    )
    if (!result.ok) throw new Error(result.error)
    const issues = collectMisses(buildFieldRows(result.file, false), result.file.preview)
    expect(issues.map((issue) => issue.kind)).toEqual(['base', 'unique'])
    expect(issues.every((issue) => issue.section === 'gear')).toBe(true)
    expect(result.file.report.modCandidates).toBe(1)
  })

  it('把未命中行汇成人话清单：定位 + 第几行 + 原文', () => {
    const misses = collectMisses(buildFieldRows(file, false))
    expect(misses).toHaveLength(1)
    expect(misses[0]?.where).toBe('戒指 2 · 第 3 行')
    expect(misses[0]?.text).toBe('3% increased Attack Speed per 25 Dexterity')
    expect(misses[0]?.domId).toBe('line-inventory-slots-3-additional-text-3')
  })
})

describe('jumpTo', () => {
  it('滚动到目标行并把焦点移过去；找不到就安静地什么都不做', () => {
    const node = document.createElement('div')
    node.id = 'line-x-1'
    node.tabIndex = -1
    const scroll = vi.fn()
    Object.assign(node, { scrollIntoView: scroll })
    document.body.append(node)
    jumpTo('line-x-1')
    expect(scroll).toHaveBeenCalledWith({ block: 'center' })
    expect(document.activeElement).toBe(node)
    expect(() => jumpTo('line-does-not-exist')).not.toThrow()
    node.remove()
  })
})
