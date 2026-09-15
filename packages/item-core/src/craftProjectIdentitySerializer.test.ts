import { describe, expect, it, vi } from 'vitest'
import { CRAFT_RULES_VERSION } from './craftProject'
import { upgradeCraftProjectIdentity } from './craftProjectIdentity'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import { serializeIdentityCraftProject } from './craftProjectIdentitySerializer'
import { catalog as makeCatalog } from './partialTargetFixture'

const catalog = makeCatalog()
function project() {
  const result = upgradeCraftProjectIdentity(
    JSON.stringify({
      schemaVersion: 1,
      sourceCommit: catalog._meta.sourceCommit,
      rulesVersion: CRAFT_RULES_VERSION,
      initialState: {
        baseId: 'Focus',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
      },
      operations: [
        { currency: 'transmutation', modIds: ['p1'], rolls: [{ modId: 'p1', values: [5] }] },
        { currency: 'augmentation', modIds: ['s1'], rolls: [{ modId: 's1', values: [7] }] },
      ],
      cursor: 1,
      targetModIds: ['p1'],
      targetValues: [{ modId: 'p1', bounds: [{ index: 0, min: 5 }] }],
      pricing: { unit: 'divine', prices: {}, baseCost: 2 },
    }),
    catalog,
  )
  if (!result.ok) throw Error(result.error)
  return result.value
}
describe('实例项目保存先验证原始对象和全部历史', () => {
  it.each([
    ['object', 'method'],
    ['object', 'getter'],
    ['array', 'method'],
    ['array', 'getter'],
  ])('拒绝标准 %s 原型上的 toJSON %s，不执行继承转换', (kind, mode) => {
    const value = project().project
    const prototype = kind === 'object' ? Object.prototype : Array.prototype
    const previous = Object.getOwnPropertyDescriptor(prototype, 'toJSON')
    const convert = vi.fn(function (this: unknown) {
      return this
    })
    const getter = vi.fn(() => convert)
    let result: ReturnType<typeof serializeIdentityCraftProject> | undefined
    Object.defineProperty(
      prototype,
      'toJSON',
      mode === 'method'
        ? { configurable: true, value: convert }
        : { configurable: true, get: getter },
    )
    try {
      result = serializeIdentityCraftProject(value, catalog)
    } finally {
      if (previous) Object.defineProperty(prototype, 'toJSON', previous)
      else Reflect.deleteProperty(prototype, 'toJSON')
    }
    expect(result?.ok).toBe(false)
    expect(convert).not.toHaveBeenCalled()
    expect(getter).not.toHaveBeenCalled()
  })
  it('完整保存恢复保持游标、未来操作与配置，保存不改变输入', () => {
    const original = project()
    const before = structuredClone(original)
    const saved = serializeIdentityCraftProject(original.project, catalog)
    expect(saved.ok, saved.ok ? '' : saved.error).toBe(true)
    if (!saved.ok) return
    expect(parseIdentityCraftProject(saved.value, catalog)).toEqual({ ok: true, value: original })
    expect(original).toEqual(before)
  })
  it('原始对象显式 undefined 不能由 JSON 丢弃或转 null', () => {
    const variants = [
      Object.assign(project().project, { pricing: undefined }),
      Object.assign(project().project, { hidden: undefined }),
      (() => {
        const p = project().project
        const step = p.operations[1]
        if (!step) throw Error('缺少测试操作')
        Object.assign(step, { removeAffixId: undefined })
        return p
      })(),
      (() => {
        const p = project().project
        const step = p.operations[1]
        if (step && 'rolls' in step) Object.assign(step.rolls?.[0] ?? {}, { affixId: undefined })
        return p
      })(),
    ]
    for (const value of variants)
      expect(serializeIdentityCraftProject(value, catalog).ok).toBe(false)
  })
  it('错误实例与未来非法操作不能写成可恢复项目', () => {
    const value = project().project
    const step = value.operations[1]
    if (!step || !('rolls' in step) || !step.rolls?.[0]) throw Error('缺少测试掷值')
    step.rolls[0].affixId = 'a1'
    expect(serializeIdentityCraftProject(value, catalog).ok).toBe(false)
    expect(
      serializeIdentityCraftProject(project().project, {
        ...catalog,
        _meta: { ...catalog._meta, sourceCommit: 'b'.repeat(40) },
      }).ok,
    ).toBe(false)
  })
  it('拒绝非 JSON 数据，不能调用自定义 toJSON 或读取访问器', () => {
    const toJSON = vi.fn(() => project().project)
    class ConvertibleArray extends Array {
      toJSON() {
        return toJSON()
      }
    }
    const getter = vi.fn(() => undefined)
    const getterProject = project().project
    Object.defineProperty(getterProject, 'extra', { get: getter, enumerable: true })
    const hidden = project().project
    Object.defineProperty(hidden, 'extra', { value: undefined })
    const symbolic = project().project
    Object.assign(symbolic, { [Symbol('extra')]: true })
    const cyclic = Object.assign(project().project, { extra: {} })
    cyclic.extra = cyclic
    const variants = [
      Object.assign(project().project, { toJSON }),
      Object.assign(project().project, { extra: new Date(0) }),
      Object.assign(project().project, { extra: Number.NaN }),
      Object.assign(project().project, { extra: 1n }),
      Object.assign(project().project, { operations: new ConvertibleArray() }),
      getterProject,
      hidden,
      symbolic,
      cyclic,
    ]
    for (const value of variants)
      expect(serializeIdentityCraftProject(value, catalog).ok).toBe(false)
    expect(toJSON).not.toHaveBeenCalled()
    expect(getter).not.toHaveBeenCalled()
  })
})
