const ID_KEYS = new Set(['modId', 'removeModId', 'targetModId', 'targetFracturedModId'])
const IDS_KEYS = new Set(['modIds', 'targetModIds', 'referencedTargetIds'])

/** 检查完整项目的结构身份，包括未来历史、替代目标、未触发指引与报价键。 */
export function alloyProjectUsage(value: unknown): { used: boolean; resistanceEffect: boolean } {
  let used = false
  let resistanceEffect = false
  const readId = (id: unknown) => {
    if (typeof id !== 'string') return
    if (/^Alloy[A-Za-z0-9]+$/.test(id)) used = true
    if (id === 'AlloyEffectOfResistanceMods1') resistanceEffect = true
  }
  const pending: unknown[] = [value]
  const seen = new Set<object>()
  while (pending.length) {
    const entry = pending.pop()
    if (!entry || typeof entry !== 'object' || seen.has(entry)) continue
    seen.add(entry)
    if (Array.isArray(entry)) for (const child of entry) pending.push(child)
    else
      for (const [key, child] of Object.entries(entry)) {
        if (key === 'kind' && child === 'alloy') used = true
        if (ID_KEYS.has(key)) readId(child)
        if (IDS_KEYS.has(key) && Array.isArray(child)) child.forEach(readId)
        if (
          key === 'prices' &&
          child &&
          typeof child === 'object' &&
          Object.keys(child).some((id) => id.startsWith('alloy:'))
        )
          used = true
        // 名称与原文不是属性身份；不扫描签名内部数据。
        if (key !== 'sourceText' && key !== 'alloyCatalogSignature') pending.push(child)
      }
  }
  return { used, resistanceEffect }
}
