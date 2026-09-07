// 命令入口：tsx src/cli.ts build|check [选项]
import { parseArgs } from 'node:util'
import type { Locale } from '@poe2-tools/build-core'
import { runBuild } from './build'
import { runCheck } from './check'
import { CACHE_DIR, DICT_DIR, FIXTURE_DIRS, LOCALES, OVERRIDES_DIR, poe2dbEnabled } from './config'

const USAGE = [
  '用法：',
  '  dict-builder build [--offline] [--locales zh-CN,zh-TW] [--allow-regression] [--no-poe2db]',
  '  dict-builder check [--locales zh-CN,zh-TW]',
  '环境变量：DICT_ENABLE_POE2DB=0 关闭 poe2db 灰区源',
].join('\n')

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

function parseLocales(value: string): Locale[] {
  const locales: Locale[] = []
  for (const item of value.split(',')) {
    const trimmed = item.trim()
    if (trimmed === '') continue
    if (!isLocale(trimmed)) throw new Error(`不支持的 locale：${trimmed}`)
    locales.push(trimmed)
  }
  return locales
}

function parseCommandLine(argv: readonly string[]): {
  command: string | undefined
  locales: Locale[]
  offline: boolean
  allowRegression: boolean
  noPoe2db: boolean
} {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      offline: { type: 'boolean', default: false },
      locales: { type: 'string', default: LOCALES.join(',') },
      'allow-regression': { type: 'boolean', default: false },
      'no-poe2db': { type: 'boolean', default: false },
    },
  })
  return {
    command: positionals[0],
    locales: parseLocales(values.locales ?? LOCALES.join(',')),
    offline: values.offline ?? false,
    allowRegression: values['allow-regression'] ?? false,
    noPoe2db: values['no-poe2db'] ?? false,
  }
}

async function main(argv: readonly string[]): Promise<number> {
  // 参数错误（未知选项、非法 locale）是用法错误：退出码 2
  let parsed: ReturnType<typeof parseCommandLine>
  try {
    parsed = parseCommandLine(argv)
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`)
    return 2
  }
  const { command, locales } = parsed
  const log = (message: string): void => {
    console.log(message)
  }
  if (command === 'build') {
    const now = new Date().toISOString()
    const result = await runBuild({
      locales,
      offline: parsed.offline,
      allowRegression: parsed.allowRegression,
      poe2db: poe2dbEnabled() && !parsed.noPoe2db,
      today: now.slice(0, 10),
      now,
      cacheDir: CACHE_DIR,
      dictDir: DICT_DIR,
      overridesDir: OVERRIDES_DIR,
      fixtureDirs: FIXTURE_DIRS,
      log,
    })
    return result.ok ? 0 : 1
  }
  if (command === 'check') {
    const result = await runCheck({ locales, dictDir: DICT_DIR, fixtureDirs: FIXTURE_DIRS, log })
    return result.ok ? 0 : 1
  }
  console.error(USAGE)
  return 2
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  },
)
