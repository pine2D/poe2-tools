import type { RuneforgingCatalog } from '@poe2-tools/item-core'
import { sha256 } from './util/json'

// 已逐行对照公开 HTML 的关系快照。修改数据时须重新审核，不能仅更新计数放行。
const REVIEWED_HASH = 'fcb85da99d3d4a8fb7e805840bfe67acb5ac63acbdc459671f50fa403416da6a'

/** 在结构解析后执行；固定语义内容，防止费用或同类基底错配绕过计数检查。 */
export function checkRuneforgingSnapshot(table: RuneforgingCatalog): void {
  const content = [
    table._meta.sourceCommit,
    [...table._meta.baseSources]
      .sort((a, b) => a.path.localeCompare(b.path, 'en'))
      .map((source) => [source.path, source.url, source.sha256]),
    table._meta.recipeSource.url,
    table._meta.recipeSource.sha256,
    table._meta.sourceRowCount,
    [...table.recipes]
      .sort((a, b) => a.sourceRow - b.sourceRow)
      .map((recipe) => [
        recipe.sourceRow,
        recipe.fromBaseId,
        recipe.toBaseId,
        recipe.verisium,
        recipe.implicit,
      ]),
    [...table.unresolved]
      .sort((a, b) => a.sourceRow - b.sourceRow)
      .map((entry) => [entry.sourceRow, entry.reason]),
  ]
  if (sha256(JSON.stringify(content)) !== REVIEWED_HASH)
    throw new Error('锻造配方内容与已审核快照不符，须逐行重新核对来源。')
}
