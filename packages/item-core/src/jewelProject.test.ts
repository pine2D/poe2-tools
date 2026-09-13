import { expect, it } from 'vitest'
import { exportCraftItemText } from './craftItemText'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { inspectItem } from './export'
import { JEWEL_SOURCE } from './jewels'
import { jewelFixture } from './jewelTestFixture'
import { parseItem } from './parse'
import { importCraftState } from './rehearsalImport'

function fixture() {
  const { catalog, state } = jewelFixture()
  const ids = ['prefix1', 'prefix2', 'suffix1', 'suffix2']
  const project: CraftProject = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    jewelSourceHash: JEWEL_SOURCE.sha256,
    initialState: { ...state, rarity: 'normal' },
    operations: [
      { currency: 'alchemy', modIds: ids, rolls: ids.map((modId) => ({ modId, values: [5] })) },
      { kind: 'fracture', modId: 'prefix1' },
    ],
    cursor: 0,
    targetModIds: ids,
  }
  return { catalog, project }
}
it('v32 珠宝全历史保留来源，实际文本可重新导入并保留破裂', () => {
  const { catalog, project } = fixture()
  for (let cursor = 0; cursor <= 2; cursor++) {
    const r = parseCraftProject(serializeCraftProject({ ...project, cursor }), catalog)
    if (!r.ok) throw Error(r.error)
    expect(r.value.project.rulesVersion).toBe('basic-2026-09-12-v40')
    expect(r.value.project.jewelSourceHash).toBe(JEWEL_SOURCE.sha256)
    const state = r.value.states[cursor]
    if (!state) throw Error('fixture')
    const text = exportCraftItemText(catalog, state)
    if (!text.ok) throw Error(text.error)
    const parsed = parseItem(text.value.text)
    if (!parsed.ok) throw Error(parsed.error)
    const dictionary = { items: { bases: { Sapphire: 'Sapphire' }, uniques: {} } }
    const restored = importCraftState(
      catalog,
      'Sapphire',
      parsed.item,
      inspectItem(parsed.item, dictionary),
    )
    expect(restored.ok && restored.value.affixes).toEqual(state.affixes)
  }
})
it('旧v2–31不开放珠宝起点，缺失或篡改指纹及未来非法容量均拒绝', () => {
  const { catalog, project } = fixture()
  for (let v = 2; v <= 31; v++)
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project,
          jewelSourceHash: undefined,
          rulesVersion: `basic-2026-09-12-v${v}`,
        }),
        catalog,
      ).ok,
    ).toBe(false)
  for (const jewelSourceHash of [undefined, 'a'.repeat(64)])
    expect(parseCraftProject(JSON.stringify({ ...project, jewelSourceHash }), catalog).ok).toBe(
      false,
    )
  expect(
    parseCraftProject(
      JSON.stringify({
        ...project,
        operations: [{ currency: 'alchemy', modIds: ['prefix1', 'prefix2', 'prefix3', 'suffix1'] }],
      }),
      catalog,
    ).ok,
  ).toBe(false)
})

it.each([
  [
    'Jewels',
    'Place into an allocated Jewel Socket on the Passive Skill Tree. Right click to remove from the Socket.',
  ],
  ['珠宝', '放置到一个天赋树的珠宝插槽中以产生效果。右键点击以移出插槽。'],
  ['珠寶', '放置到一個天賦樹的珠寶插槽中以產生效果。右鍵點擊以移出插槽。'],
])('保留 %s 珠宝使用说明，未知附加语义仍拒绝导入', (itemClass, usage) => {
  const { catalog, project } = fixture()
  const restored = parseCraftProject(serializeCraftProject(project), catalog)
  if (!restored.ok) throw Error(restored.error)
  const state = restored.value.states[1]
  if (!state) throw Error('缺少测试状态')
  const text = exportCraftItemText(catalog, state)
  if (!text.ok) throw Error(text.error)
  const source =
    text.value.text.replace('Item Class: Jewels', `Item Class: ${itemClass}`) +
    `\n--------\n${usage}`
  const parsed = parseItem(source)
  if (!parsed.ok) throw Error(parsed.error)
  expect(parsed.item.diagnostics).toEqual([])
  expect(
    parsed.item.blocks.some(
      (block) => block.kind === 'description' && block.lines.some((line) => line.raw === usage),
    ),
  ).toBe(true)
  const dictionary = { items: { bases: { Sapphire: 'Sapphire' }, uniques: {} } }
  expect(
    importCraftState(catalog, 'Sapphire', parsed.item, inspectItem(parsed.item, dictionary)).ok,
  ).toBe(true)
  const bad = parseItem(`${source}\n--------\n未知增效：20%`)
  if (!bad.ok) throw Error(bad.error)
  expect(
    importCraftState(catalog, 'Sapphire', bad.item, inspectItem(bad.item, dictionary)).ok,
  ).toBe(false)
})
