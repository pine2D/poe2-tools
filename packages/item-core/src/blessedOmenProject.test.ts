import { expect, it } from 'vitest'
import { exportCraftItemText } from './craftItemText'
import {
  CRAFT_RULES_VERSION,
  type CraftProject,
  parseCraftProject,
  serializeCraftProject,
} from './craftProject'
import { evaluateCraftStrategy } from './craftStrategy'
import { catalog, state } from './partialTargetFixture'

it('v47祝福操作及指引保存恢复，旧版不得注入游标后操作或未命中规则', () => {
  const cat = catalog(undefined, { implicit: '(1-10)% rarity' })
  const initialState = { ...state('rare', ['p1']), implicitLines: ['2% rarity'] }
  const exported = exportCraftItemText(cat, initialState)
  if (!exported.ok) throw new Error(exported.error)
  initialState.sourceText = exported.value.text
  const project: CraftProject = {
    schemaVersion: 1,
    sourceCommit: cat._meta.sourceCommit,
    rulesVersion: CRAFT_RULES_VERSION,
    initialState,
    operations: [{ currency: 'divine', omen: 'blessed', modIds: [], implicitValues: [9] }],
    cursor: 0,
    strategy: {
      maxSteps: 10,
      rules: [
        {
          conditions: [{ kind: 'always' }],
          action: { kind: 'currency', currency: 'divine', omen: 'blessed' },
        },
      ],
    },
  }
  const strategy = project.strategy
  if (!strategy) throw new Error('缺少指引')
  for (const cursor of [0, 1]) {
    const r = parseCraftProject(serializeCraftProject({ ...project, cursor }), cat)
    if (!r.ok) throw new Error(r.error)
    expect(r.ok).toBe(true)
    expect(r.value.states[cursor]?.affixes).toEqual(project.initialState.affixes)
    const decision = evaluateCraftStrategy(
      cat,
      r.value.states[cursor] ?? project.initialState,
      strategy,
      cursor,
    )
    expect(decision).toMatchObject({
      ok: true,
      value: { kind: 'action', action: { kind: 'currency', currency: 'divine', omen: 'blessed' } },
    })
  }
  const old = { ...project, rulesVersion: 'basic-2026-09-12-v46' }
  expect(parseCraftProject(JSON.stringify(old), cat).ok).toBe(false)
  expect(parseCraftProject(JSON.stringify({ ...old, operations: [] }), cat).ok).toBe(false)
  const { strategy: _, ...noStrategy } = old
  expect(parseCraftProject(JSON.stringify(noStrategy), cat).ok).toBe(false)
  expect(parseCraftProject(JSON.stringify({ ...noStrategy, operations: [] }), cat).ok).toBe(true)
})
