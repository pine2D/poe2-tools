export function pageStatus(
  doc: Document,
  url: string,
): 'supported' | 'english-required' | 'unknown' | 'unsupported' {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'unsupported'
  }
  if (parsed.origin !== 'https://beta.craftofexile.com') return 'unsupported'
  const games = doc.querySelectorAll('#gameToggler a.selected')
  if (games.length !== 1) return 'unknown'
  if (!games[0]?.classList.contains('poe2')) return 'unsupported'
  const languages = doc.querySelectorAll('#languageToggler .list .active')
  if (languages.length !== 1) return 'unknown'
  const language = languages[0]?.getAttribute('key')
  if (!language) return 'unknown'
  return language === 'us' ? 'supported' : 'english-required'
}
export function supportsPage(doc: Document, url: string): boolean {
  return pageStatus(doc, url) === 'supported'
}
