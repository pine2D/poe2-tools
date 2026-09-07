// 占位：Task 7 实现完整的 runCheck
import type { Locale } from '@poe2-tools/build-core'
import type { FixtureSet } from './coverage'

export interface CheckOptions {
  locales: readonly Locale[]
  dictDir: string
  fixtureDirs: Record<FixtureSet, string>
  log(message: string): void
}

export async function runCheck(options: CheckOptions): Promise<{ ok: boolean }> {
  options.log('check 尚未实现')
  return { ok: false }
}
