export interface SelectionSite {
  origin: string
  path: string
}
export const SITES_KEY = 'selectionSites'
export const PRESET_SITES = [
  { name: 'Mobalytics', origin: 'https://mobalytics.gg', path: '/poe-2' },
  { name: 'Maxroll', origin: 'https://maxroll.gg', path: '/poe2' },
  { name: 'PoE Vault', origin: 'https://www.poe-vault.com', path: '/poe2' },
  { name: 'Domistae 升级攻略', origin: 'https://domistae.github.io', path: '/poe2-leveling' },
] as const

export function normalizeSite(value: string): SelectionSite | null {
  try {
    const u = new URL(value.trim())
    if (
      !['http:', 'https:'].includes(u.protocol) ||
      u.username ||
      u.password ||
      value.includes('*') ||
      u.hostname === 'craftofexile.com' ||
      u.hostname.endsWith('.craftofexile.com')
    )
      return null
    return { origin: u.origin, path: u.pathname.replace(/\/+$/, '') || '/' }
  } catch {
    return null
  }
}
export const siteKey = (site: SelectionSite) => site.origin + site.path
// Chrome host 授权忽略路径，界面需说明；业务匹配再限定目录。
export const sitePermission = (site: SelectionSite) =>
  `${new URL(site.origin).protocol}//${new URL(site.origin).hostname}/*`
export function siteMatches(site: SelectionSite, url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.origin === site.origin &&
      (site.path === '/' || u.pathname === site.path || u.pathname.startsWith(`${site.path}/`))
    )
  } catch {
    return false
  }
}
export function readSites(value: unknown): SelectionSite[] {
  if (!Array.isArray(value)) return []
  const result = new Map<string, SelectionSite>()
  for (const item of value) {
    if (
      !item ||
      typeof item.origin !== 'string' ||
      typeof item.path !== 'string' ||
      !item.path.startsWith('/')
    )
      continue
    const site = normalizeSite(item.origin + item.path)
    if (site && site.origin === item.origin) result.set(siteKey(site), site)
    if (result.size === 100) break
  }
  return [...result.values()]
}
