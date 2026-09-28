import type { DictBundle } from '@poe2-tools/build-core'
import type { FetchJson } from '../dict/loadDict'

// 测试用：把一个 DictBundle 当成 /dict/<locale>/<table>.json 静态目录来响应；meta 另给
export function fakeDictFetch(
  bundle: DictBundle,
  options: { omit?: readonly string[]; meta?: unknown } = {},
): FetchJson {
  const meta = options.meta ?? { gameVersion: '0.0.0', leagueName: '测试联盟' }
  const tables = bundle as unknown as Record<string, unknown>
  return async (url) => {
    const name = (url.split('/').at(-1) ?? '').replace(/\.json$/, '')
    const body = name === 'meta' ? meta : tables[name]
    if (body === undefined || (options.omit ?? []).includes(name))
      return { ok: false, status: 404, json: async () => null }
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) as unknown }
  }
}
