export interface CraftTargetAssignmentCandidate {
  targetId: string
  affixIndexes: readonly number[]
}

export interface CraftTargetAssignment {
  matches: { targetId: string; affixIndex: number }[]
  unmatchedTargetIds: string[]
  requiredMatched: boolean
}

/**
 * 调用方保证目标 ID 唯一、实例索引合法，目标与实例均不超过六个。
 * 按输入目标与边的顺序增广；时间 O(T·E)，空间 O(T+A+E)。
 */
export function assignCraftTargets(
  candidates: readonly CraftTargetAssignmentCandidate[],
  requiredTargetId?: string,
): CraftTargetAssignment {
  const edges = candidates.map((candidate) => [...new Set(candidate.affixIndexes)])
  const owners = new Map<number, number>()
  const augment = (targetIndex: number, visited: Set<number>): boolean => {
    for (const affixIndex of edges[targetIndex] ?? []) {
      if (visited.has(affixIndex)) continue
      visited.add(affixIndex)
      const owner = owners.get(affixIndex)
      if (owner === undefined || augment(owner, visited)) {
        owners.set(affixIndex, targetIndex)
        return true
      }
    }
    return false
  }
  const requiredIndex = candidates.findIndex((candidate) => candidate.targetId === requiredTargetId)
  // 先保证必选；后续增广只会重新安置已有匹配，不会丢弃它。
  if (requiredIndex >= 0) augment(requiredIndex, new Set())
  for (let index = 0; index < candidates.length; index++) {
    if (index !== requiredIndex) augment(index, new Set())
  }
  const assigned = new Map(
    [...owners].map(([affixIndex, targetIndex]) => [targetIndex, affixIndex]),
  )
  const result: CraftTargetAssignment = {
    matches: [],
    unmatchedTargetIds: [],
    requiredMatched:
      requiredTargetId === undefined || (requiredIndex >= 0 && assigned.has(requiredIndex)),
  }
  for (const [index, candidate] of candidates.entries()) {
    const affixIndex = assigned.get(index)
    if (affixIndex === undefined) result.unmatchedTargetIds.push(candidate.targetId)
    else result.matches.push({ targetId: candidate.targetId, affixIndex })
  }
  return result
}
