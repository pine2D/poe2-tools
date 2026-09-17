import { expect, it } from 'vitest'
import { normalizeFlaskMods } from './craftFlasks'
import { parsePobModFile } from './restrictedLua'

const source = (keys = '"life_flask", "default"', values = '1, 0', extra = '') =>
  parsePobModFile(`return {
["sample"]={type="Prefix",affix="Sample",level=1,group="Sample","(1-10)% increased Amount Recovered",statOrder={1},weightKey={${keys}},weightVal={${values}},modTags={"flask"},tradeHashes={},${extra}}
}`)
it('独立药剂域保留原始顺序与default1，不把二元资格改成权重', () => {
  for (const input of [source(), source('"default"', '1')]) {
    const before = structuredClone(input)
    const result = normalizeFlaskMods(input)
    expect(result.modifiers).toHaveLength(1)
    expect(result.modifiers[0]).toMatchObject({ id: 'sample', flaskOnly: true })
    const fields = input.sample as {
      weightKey: Record<string, string>
      weightVal: Record<string, number>
    }
    expect(result.modifiers[0]?.eligibility).toEqual(
      Object.values(fields.weightKey).map((tag, index) => ({
        tag,
        value: Object.values(fields.weightVal)[index],
      })),
    )
    expect(result.excluded).toEqual([])
    expect(input).toEqual(before)
  }
})
it('全零禁用声明保留审计且不加入可生成池', () => {
  expect(normalizeFlaskMods(source('"default"', '0'))).toEqual({
    modifiers: [],
    excluded: [{ id: 'sample', reason: '固定药剂源全部资格为零，禁止生成' }],
  })
})
it('禁用条目也校验所有字段，拒绝不明规则、跨域与非二元资格', () => {
  for (const input of [
    source('"default"', '2'),
    source('"default"', '0', 'unknown=true,'),
    source('"ring", "default"', '1, 0'),
    source('"default", "life_flask"', '0, 1'),
    source('"life_flask", "default"', '1'),
    source('"default"', '1', 'nodeType=2,'),
  ])
    expect(() => normalizeFlaskMods(input)).toThrow()
})
