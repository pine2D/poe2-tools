import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseBuildFile } from './parse'
import { serializeBuildFile } from './serialize'

const fixturesDir = fileURLToPath(new URL('../../../../data/fixtures/', import.meta.url))

function readFixture(relative: string): string {
  return readFileSync(`${fixturesDir}${relative}`, 'utf8')
}

// 无损：解析 → 序列化 → 再解析，键、顺序、值与原文逐一相同
function expectLossless(text: string): void {
  const parsed = parseBuildFile(text)
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return
  const again = JSON.parse(serializeBuildFile(parsed.build)) as unknown
  expect(JSON.stringify(again)).toBe(JSON.stringify(JSON.parse(text)))
}

describe('parseBuildFile', () => {
  it('解析合成样本并保留未知字段', () => {
    const parsed = parseBuildFile(readFixture('synthetic/rich.build'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.build.name).toBe('Synthetic Rich - 0.5.5')
    const ring = parsed.build.inventory_slots?.[3]
    expect(ring?.extra_field).toEqual({ keep: true })
  })

  it('拒绝非 JSON', () => {
    const parsed = parseBuildFile('{not json')
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toContain('JSON')
  })

  it('拒绝非对象根', () => {
    expect(parseBuildFile('[]').ok).toBe(false)
    expect(parseBuildFile('null').ok).toBe(false)
    expect(parseBuildFile('"x"').ok).toBe(false)
  })

  it('name 缺失时仍然宽松接受', () => {
    expect(parseBuildFile('{"passives":[]}').ok).toBe(true)
  })
})

describe('往返无损', () => {
  it('合成样本', () => {
    expectLossless(readFixture('synthetic/minimal.build'))
    expectLossless(readFixture('synthetic/rich.build'))
  })

  const localDir = `${fixturesDir}local/`
  const localFiles = existsSync(localDir)
    ? readdirSync(localDir).filter((f) => f.endsWith('.build'))
    : []
  if (localFiles.length === 0) {
    console.info(
      `跳过本地真实样本往返测试：${localDir} 为空或不存在（该目录不入库，见 data/fixtures/README.md）`,
    )
  }

  it.skipIf(localFiles.length === 0)('本地真实样本（缺失时跳过）', () => {
    for (const file of localFiles) {
      expectLossless(readFileSync(`${localDir}${file}`, 'utf8'))
    }
  })
})
