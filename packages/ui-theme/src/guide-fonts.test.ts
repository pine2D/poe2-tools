import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sha256 } from '../scripts/compliance.mjs'

const root = 'packages/ui-theme/'
const read = (path: string) => readFileSync(root + path, 'utf8')
describe('侧栏与站点固定标签字体', () => {
  it('独立子集包含操作标签，预算内且哈希与文件一致，不混入其他入口', () => {
    const coverage = JSON.parse(read('fonts/coverage.json'))
    const shard = coverage.shards.find((s: { group: string }) => s.group === 'sc-guide')
    expect(shard, '离线生成侧栏固定标签子集').toBeDefined()
    if (!shard) return
    expect(shard.bytes).toBeLessThanOrEqual(98304)
    expect(sha256(readFileSync(`${root}fonts/${shard.file}`))).toBe(shard.sha256)
    for (const ch of '读取范围开始翻译保存服务并返回自动划词站点删除取消限额本机数据') {
      expect(shard.chars).toContain(ch)
    }
    expect(read('fonts/guide.css')).toContain(shard.file)
    expect(read('fonts/fonts.css')).not.toContain(shard.file)
    expect(read('fonts/popup.css')).not.toContain(shard.file)
    expect(existsSync(`${root}scripts/guide-text.txt`)).toBe(true)
  })
})
