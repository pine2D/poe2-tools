import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { countPlaceholders, readJson, sha256, stableJson, writeJson } from './json'

const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('json 工具', () => {
  it('sha256 固定', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('stableJson 两空格缩进且末尾换行', () => {
    expect(stableJson({ a: [1, 2] })).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}\n')
  })
  it('writeJson 自动建目录，readJson 读回', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'poe2-json-'))
    dirs.push(dir)
    const path = join(dir, 'nested', 'x.json')
    await writeJson(path, { ok: true })
    expect(await readFile(path, 'utf8')).toBe('{\n  "ok": true\n}\n')
    expect(await readJson(path)).toEqual({ ok: true })
  })
  it('countPlaceholders', () => {
    expect(countPlaceholders('Adds # to # Damage')).toBe(2)
    expect(countPlaceholders('无')).toBe(0)
  })
})
