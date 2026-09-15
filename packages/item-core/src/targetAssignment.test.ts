import { describe, expect, it } from 'vitest'
import { assignCraftTargets } from './targetAssignment'

describe('目标与词缀实例一对一分配', () => {
  it('宽目标 A/B 让出 A 给窄目标，避免顺序贪心漏掉完整匹配', () => {
    expect(
      assignCraftTargets([
        { targetId: 'wide', affixIndexes: [0, 1] },
        { targetId: 'narrow', affixIndexes: [0] },
      ]),
    ).toEqual({
      matches: [
        { targetId: 'wide', affixIndex: 1 },
        { targetId: 'narrow', affixIndex: 0 },
      ],
      unmatchedTargetIds: [],
      requiredMatched: true,
    })
  })

  it('一个实例不能同时计入两个目标，必选目标可优先获得部分匹配', () => {
    const candidates = [
      { targetId: 'ordinary', affixIndexes: [0] },
      { targetId: 'required', affixIndexes: [0] },
    ]
    expect(assignCraftTargets(candidates)).toEqual({
      matches: [{ targetId: 'ordinary', affixIndex: 0 }],
      unmatchedTargetIds: ['required'],
      requiredMatched: true,
    })
    expect(assignCraftTargets(candidates, 'required')).toEqual({
      matches: [{ targetId: 'required', affixIndex: 0 }],
      unmatchedTargetIds: ['ordinary'],
      requiredMatched: true,
    })
  })

  it('必选目标可以在增广时换用另一实例，并在保留必选的前提下达到最大数量', () => {
    expect(
      assignCraftTargets(
        [
          { targetId: 'first', affixIndexes: [0] },
          { targetId: 'second', affixIndexes: [1, 2] },
          { targetId: 'required', affixIndexes: [0, 1] },
        ],
        'required',
      ),
    ).toEqual({
      matches: [
        { targetId: 'first', affixIndex: 0 },
        { targetId: 'second', affixIndex: 2 },
        { targetId: 'required', affixIndex: 1 },
      ],
      unmatchedTargetIds: [],
      requiredMatched: true,
    })
  })

  it('无边或不存在的必选返回 false，仍为其余目标求最大匹配', () => {
    const candidates = [
      { targetId: 'unavailable', affixIndexes: [] },
      { targetId: 'available', affixIndexes: [4] },
    ]
    for (const required of ['unavailable', 'missing']) {
      expect(assignCraftTargets(candidates, required)).toEqual({
        matches: [{ targetId: 'available', affixIndex: 4 }],
        unmatchedTargetIds: ['unavailable'],
        requiredMatched: false,
      })
    }
    expect(assignCraftTargets([])).toEqual({
      matches: [],
      unmatchedTargetIds: [],
      requiredMatched: true,
    })
    expect(assignCraftTargets([], 'missing')).toEqual({
      matches: [],
      unmatchedTargetIds: [],
      requiredMatched: false,
    })
    expect(assignCraftTargets([{ targetId: 'empty', affixIndexes: [] }])).toEqual({
      matches: [],
      unmatchedTargetIds: ['empty'],
      requiredMatched: true,
    })
  })

  it('重复边只算一次，多种最大解按输入顺序确定，结果不引用或修改输入', () => {
    const candidates = Object.freeze([
      Object.freeze({ targetId: 'first', affixIndexes: Object.freeze([2, 1, 2, 1]) }),
      Object.freeze({ targetId: 'unavailable', affixIndexes: Object.freeze([]) }),
      Object.freeze({ targetId: 'second', affixIndexes: Object.freeze([2, 1, 2]) }),
    ])
    const snapshot = structuredClone(candidates)
    const expected = {
      matches: [
        { targetId: 'first', affixIndex: 1 },
        { targetId: 'second', affixIndex: 2 },
      ],
      unmatchedTargetIds: ['unavailable'],
      requiredMatched: true,
    }
    const result = assignCraftTargets(candidates)
    expect(result).toEqual(expected)
    expect(assignCraftTargets(candidates)).toEqual(expected)
    const match = result.matches[0]
    if (!match) throw new Error('缺少分配结果')
    match.targetId = 'changed'
    result.unmatchedTargetIds.push('changed')
    expect(candidates).toEqual(snapshot)
    expect(assignCraftTargets(candidates)).toEqual(expected)
    expect(assignCraftTargets([...candidates].reverse())).toEqual({
      matches: [
        { targetId: 'second', affixIndex: 1 },
        { targetId: 'first', affixIndex: 2 },
      ],
      unmatchedTargetIds: ['unavailable'],
      requiredMatched: true,
    })
  })

  it('六目标的整条增广链可重新安置所有已匹配目标', () => {
    const candidates = [0, 1, 2, 3, 4].map((index) => ({
      targetId: `t${index}`,
      affixIndexes: [index, index + 1],
    }))
    candidates.push({ targetId: 't5', affixIndexes: [0] })
    expect(assignCraftTargets(candidates)).toEqual({
      matches: [
        { targetId: 't0', affixIndex: 1 },
        { targetId: 't1', affixIndex: 2 },
        { targetId: 't2', affixIndex: 3 },
        { targetId: 't3', affixIndex: 4 },
        { targetId: 't4', affixIndex: 5 },
        { targetId: 't5', affixIndex: 0 },
      ],
      unmatchedTargetIds: [],
      requiredMatched: true,
    })
  })

  it('全部三目标三实例图与穷举最优解一致，必选条件不减少可达最大数量', () => {
    for (let mask = 0; mask < 512; mask++) {
      const candidates = [0, 1, 2].map((targetIndex) => ({
        targetId: `t${targetIndex}`,
        affixIndexes: [0, 1, 2].filter((index) => (mask & (1 << (targetIndex * 3 + index))) !== 0),
      }))
      for (const required of [undefined, 't2']) {
        let maximum = 0
        const requiredPossible = required === undefined || (mask & 0b111000000) !== 0
        for (const a of [-1, 0, 1, 2]) {
          for (const b of [-1, 0, 1, 2]) {
            for (const c of [-1, 0, 1, 2]) {
              const assignment = [a, b, c]
              const used = assignment.filter((index) => index >= 0)
              if (new Set(used).size !== used.length) continue
              if (
                assignment.some(
                  (index, target) => index >= 0 && (mask & (1 << (target * 3 + index))) === 0,
                )
              )
                continue
              if (required !== undefined && requiredPossible && c < 0) continue
              maximum = Math.max(maximum, used.length)
            }
          }
        }
        const result = assignCraftTargets(candidates, required)
        expect(result.matches).toHaveLength(maximum)
        expect(result.requiredMatched).toBe(requiredPossible)
        expect(new Set(result.matches.map((match) => match.affixIndex)).size).toBe(maximum)
        expect(new Set(result.matches.map((match) => match.targetId)).size).toBe(maximum)
        if (required !== undefined)
          expect(result.matches.some((match) => match.targetId === required)).toBe(requiredPossible)
        expect(result.unmatchedTargetIds).toEqual(
          candidates
            .filter(
              (candidate) => !result.matches.some((match) => match.targetId === candidate.targetId),
            )
            .map((candidate) => candidate.targetId),
        )
        for (const match of result.matches) {
          expect(
            candidates.find((candidate) => candidate.targetId === match.targetId)?.affixIndexes,
          ).toContain(match.affixIndex)
        }
      }
    }
  })
})
