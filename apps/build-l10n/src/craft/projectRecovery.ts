import { MAX_CRAFT_PROJECT_BYTES } from '@poe2-tools/item-core'

export const RECOVERY_KEY = 'poe2-tools:craft-recovery:v1'
export interface RecoveryRecord {
  version: 1
  savedAt: string
  text: string
}

export function readRecovery(raw: string | null): RecoveryRecord | null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const entry = value as Record<string, unknown>
    if (
      entry.version !== 1 ||
      typeof entry.savedAt !== 'string' ||
      !Number.isFinite(Date.parse(entry.savedAt)) ||
      typeof entry.text !== 'string' ||
      new Blob([entry.text]).size > MAX_CRAFT_PROJECT_BYTES
    )
      return null
    return { version: 1, savedAt: entry.savedAt, text: entry.text }
  } catch {
    return null
  }
}

/** 锁内比较旧记录，防止其他页面或迟到任务覆盖新进度。 */
export async function writeRecovery(
  expected: string | null,
  text: string,
  isCurrent: () => boolean,
): Promise<string | null> {
  if (new Blob([text]).size > MAX_CRAFT_PROJECT_BYTES) throw new Error('演练项目超过 2 MB 限制。')
  if (!navigator.locks?.request)
    throw new Error('浏览器不支持自动恢复所需的存储锁，请手动保存或导出项目。')
  return navigator.locks.request(RECOVERY_KEY, () => {
    if (!isCurrent()) return null
    if (localStorage.getItem(RECOVERY_KEY) !== expected)
      throw new Error('其他页面已更新恢复记录，自动保存已暂停，请先核对。')
    if (readRecovery(expected)?.text === text) return expected
    const raw = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), text })
    localStorage.setItem(RECOVERY_KEY, raw)
    return raw
  })
}

/** 严格恢复可能重排对象字段；只忽略键顺序，完整保留数组、类型及值。 */
export function sameRecoveryProject(left: string, right: string): boolean {
  if (left === right) return true
  const canonical = (text: string) =>
    JSON.stringify(JSON.parse(text), (_key, value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('非有限数值')
      return value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
        : value
    })
  try {
    return canonical(left) === canonical(right)
  } catch {
    return false
  }
}
