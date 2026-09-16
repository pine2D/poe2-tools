import {
  type CraftCatalog,
  parseRuneforgingCatalog,
  type RuneforgingCatalog,
} from '@poe2-tools/item-core'
import { useCallback, useEffect, useState } from 'react'

/** 同源关系表按需读取；主目录更换时隐藏旧表并忽略迟到响应。 */
export function useRuneforgingCatalog(
  catalog: CraftCatalog | undefined,
  fetchImpl: typeof fetch,
  enabled: boolean,
) {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{
    catalog: CraftCatalog
    table?: RuneforgingCatalog
    error?: string
  } | null>(null)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 是显式重试触发器。
  useEffect(() => {
    if (!catalog || !enabled) return
    const controller = new AbortController()
    let active = true
    setLoaded(null)
    void fetchImpl(`${import.meta.env.BASE_URL}craft-data/runeforging.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) {
          if (active)
            setLoaded({ catalog, error: '当前站点未提供锻造关系表，可继续使用其他制作功能。' })
          return
        }
        if (!response.ok) throw Error(`HTTP ${response.status}`)
        const table = parseRuneforgingCatalog(await response.json(), catalog)
        if (active) setLoaded({ catalog, table })
      })
      .catch(() => {
        if (active && !controller.signal.aborted)
          setLoaded({
            catalog,
            error: '锻造目录加载失败或属性快照不匹配，可重试；其他制作功能不受影响。',
          })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [catalog, fetchImpl, enabled, attempt])
  const current = loaded?.catalog === catalog ? loaded : null
  return {
    table: current?.table,
    error: current?.error,
    loading: !!catalog && enabled && !current,
    retry,
  }
}
