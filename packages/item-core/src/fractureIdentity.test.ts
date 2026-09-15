import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyFracture, isFractureCraftOperation, prepareFracture } from './fracture'

function identifiedState() {
  const state = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])
  return {
    ...state,
    nextAffixId: 12,
    affixes: state.affixes.map((affix, index) => ({
      ...affix,
      affixId: required(['a3', 'a7', 'a8', 'a11'][index]),
    })),
  }
}

it('破裂操作接受实例与类型选择器，拒绝显式空身份及额外字段', () => {
  expect(isFractureCraftOperation({ kind: 'fracture', modId: 'prefix2', affixId: 'a2' })).toBe(true)
  expect(isFractureCraftOperation({ kind: 'fracture', modId: 'prefix2' })).toBe(true)
  for (const extra of [
    { affixId: undefined },
    { affixId: '' },
    { affixId: 2 },
    { affixId: null },
    { affixId: 'a2', unknown: true },
  ]) {
    expect(isFractureCraftOperation({ kind: 'fracture', modId: 'prefix2', ...extra })).toBe(false)
  }
})

it('真实四词缀破裂按实例选择中间一条，保持身份游标、其他词缀和输入', () => {
  const catalog = boneCatalog()
  const state = identifiedState()
  const original = structuredClone(state)
  expect(prepareFracture(catalog, state)).toEqual({
    ok: true,
    value: { candidates: state.affixes, unresolvedModIds: [] },
  })
  const result = applyFracture(catalog, state, {
    kind: 'fracture',
    modId: 'prefix2',
    affixId: 'a7',
  })
  expect(result).toEqual({
    ok: true,
    value: {
      ...state,
      affixes: [
        state.affixes[0],
        { ...state.affixes[1], fractured: true },
        state.affixes[2],
        state.affixes[3],
      ],
    },
  })
  expect(state).toEqual(original)
  if (!result.ok) throw new Error(result.error)
  expect(required(result.value.affixes[1]).lines).not.toBe(required(state.affixes[1]).lines)
  expect(applyFracture(catalog, state, { kind: 'fracture', modId: 'prefix2' })).toEqual(result)
})

it('错实例、实例类型不一致和旧状态中的实例选择都拒绝且不回退', () => {
  const catalog = boneCatalog()
  const state = identifiedState()
  for (const selector of [
    { modId: 'prefix2', affixId: 'a99' },
    { modId: 'prefix2', affixId: 'a3' },
    { modId: 'missing', affixId: 'a7' },
  ]) {
    expect(applyFracture(catalog, state, { kind: 'fracture', ...selector }).ok).toBe(false)
  }
  const legacy = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])
  expect(
    applyFracture(catalog, legacy, {
      kind: 'fracture',
      modId: 'prefix2',
      affixId: 'a7',
    }).ok,
  ).toBe(false)
})

it('按选中实例检查未知数值和亵渎限制，不妨碍另一条已知词缀破裂', () => {
  const catalog = boneCatalog()
  const state = identifiedState()
  required(state.affixes[1]).lines = ['prefix2 (1-10)']
  required(state.affixes[3]).desecrated = true
  const original = structuredClone(state)
  expect(prepareFracture(catalog, state)).toEqual({
    ok: true,
    value: { candidates: state.affixes.slice(0, 3), unresolvedModIds: ['prefix2'] },
  })
  expect(
    applyFracture(catalog, state, { kind: 'fracture', modId: 'prefix2', affixId: 'a7' }),
  ).toMatchObject({ ok: false, error: expect.stringContaining('实际数值') })
  expect(
    applyFracture(catalog, state, { kind: 'fracture', modId: 'suffix2', affixId: 'a11' }).ok,
  ).toBe(false)
  const result = applyFracture(catalog, state, {
    kind: 'fracture',
    modId: 'suffix1',
    affixId: 'a8',
  })
  expect(result).toEqual({
    ok: true,
    value: {
      ...state,
      affixes: [
        state.affixes[0],
        state.affixes[1],
        { ...state.affixes[2], fractured: true },
        state.affixes[3],
      ],
    },
  })
  expect(state).toEqual(original)
})
