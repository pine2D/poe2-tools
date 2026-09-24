export function supportsPage(doc: Document, url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return (
    parsed.origin === 'https://beta.craftofexile.com' &&
    doc.querySelectorAll('#gameToggler a.selected').length === 1 &&
    doc.querySelector('#gameToggler a.poe2.selected') !== null &&
    doc.querySelectorAll('#languageToggler .list .active').length === 1 &&
    doc.querySelector('#languageToggler .list [key="us"].active') !== null
  )
}
