import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'

it('发布同步在关闭 gray 和移除合金表后清掉旧产物，主目录始终可用', () => {
  const root = mkdtempSync(join(tmpdir(), 'poe2-alloy-sync-'))
  try {
    const script = join(root, 'apps/build-l10n/scripts/sync-dict.mjs')
    mkdirSync(dirname(script), { recursive: true })
    copyFileSync(resolve('apps/build-l10n/scripts/sync-dict.mjs'), script)
    for (const locale of ['zh-CN', 'zh-TW']) {
      const dir = join(root, 'data/dict', locale)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'meta.json'), '{}')
    }
    const source = join(root, 'data/craft')
    const target = join(root, 'apps/build-l10n/public/craft-data')
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'catalog.json'), '{"primary":"unchanged"}')
    writeFileSync(join(source, 'NOTICE.md'), '来源通知')
    writeFileSync(join(source, 'alloys.json'), '{"gray":"optional"}')
    const run = (enabled: boolean) => {
      execFileSync(process.execPath, [script], {
        env: { ...process.env, DICT_ENABLE_POE2DB: enabled ? '1' : '0' },
      })
      expect(readFileSync(join(target, 'catalog.json'), 'utf8')).toBe('{"primary":"unchanged"}')
    }
    run(true)
    expect(existsSync(join(target, 'alloys.json'))).toBe(true)
    run(false)
    expect(existsSync(join(target, 'alloys.json'))).toBe(false)
    run(true)
    expect(existsSync(join(target, 'alloys.json'))).toBe(true)
    rmSync(join(source, 'alloys.json'))
    run(true)
    expect(existsSync(join(target, 'alloys.json'))).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
