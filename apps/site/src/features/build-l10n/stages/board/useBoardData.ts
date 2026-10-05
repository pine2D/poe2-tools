// 阶段看板的派生数据：行模型、各阶段字段索引与待核对项
import { useMemo } from 'react'
import type { FieldWithRows } from '../../preview/fields'
import { collectMisses, type MissEntry } from '../../preview/locate'
import {
  type GearRow,
  gearRows,
  missPrefixes,
  type SkillRow,
  type Stage,
  skillRows,
} from '../stages'

export interface BoardData {
  gear: GearRow[]
  skills: SkillRow[]
  fieldMaps: Map<string, Map<string, FieldWithRows>>
  misses: Map<string, MissEntry[]>
  prefixes: Map<string, Set<string>>
  totalMisses: number
}

export function useBoardData(
  stages: readonly Stage[],
  fieldsById: ReadonlyMap<string, readonly FieldWithRows[]>,
): BoardData {
  const gear = useMemo(() => gearRows(stages), [stages])
  const skills = useMemo(() => skillRows(stages), [stages])
  const fieldMaps = useMemo(
    () =>
      new Map(
        stages.map(({ file }) => [
          file.id,
          new Map((fieldsById.get(file.id) ?? []).map((item) => [item.entry.path, item])),
        ]),
      ),
    [stages, fieldsById],
  )
  const misses = useMemo(
    () =>
      new Map(
        stages.map(({ file }) => [
          file.id,
          collectMisses(fieldsById.get(file.id) ?? [], file.preview),
        ]),
      ),
    [stages, fieldsById],
  )
  const prefixes = useMemo(
    () => new Map([...misses].map(([id, list]) => [id, missPrefixes(list)])),
    [misses],
  )
  const totalMisses = [...misses.values()].reduce((sum, list) => sum + list.length, 0)
  return { gear, skills, fieldMaps, misses, prefixes, totalMisses }
}
