import { type AlloyCatalog, type CraftCatalog, parseAlloyCatalog } from '@poe2-tools/item-core'
import { useCallback, useEffect, useState } from 'react'

export interface AlloyCatalogResource {
  table?: AlloyCatalog
  error?: string
  loading: boolean
  retry: () => void
}

/** 同源可选表；主快照更换后立即隐藏旧结果，迟到响应不能覆盖新目录。 */
export function useAlloyCatalog(
  catalog: CraftCatalog | undefined,
  fetchImpl: typeof fetch,
  enabled: boolean,
): AlloyCatalogResource {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{
    catalog: CraftCatalog
    table?: AlloyCatalog
    error?: string
  } | null>(null)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 是显式重试触发器。
  useEffect(() => {
    if (!catalog || !enabled) return
    const controller = new AbortController()
    let active = true
    setLoaded(null)
    void fetchImpl(`${import.meta.env.BASE_URL}craft-data/alloys.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) {
          if (active)
            setLoaded({ catalog, error: '当前站点未提供合金关系表，可继续使用其他制作功能。' })
          return
        }
        if (!response.ok) throw Error(`HTTP ${response.status}`)
        const table = parseAlloyCatalog(await response.json(), catalog)
        if (active) setLoaded({ catalog, table })
      })
      .catch(() => {
        if (active && !controller.signal.aborted)
          setLoaded({
            catalog,
            error: '合金目录加载失败或属性快照不匹配，可重试；其他制作功能不受影响。',
          })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [catalog, fetchImpl, enabled, attempt])
  const current = loaded?.catalog === catalog ? loaded : null
  return {
    ...(current?.table ? { table: current.table } : {}),
    ...(current?.error ? { error: current.error } : {}),
    loading: !!catalog && enabled && !current,
    retry,
  }
}
