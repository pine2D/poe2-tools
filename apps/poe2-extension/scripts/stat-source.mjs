import { createHash } from 'node:crypto'
import { statSignature } from '../../../packages/dict-builder/src/stat-signature.mjs'

// 两种投影共用来源和裁决校验，攻略只改变用途，不另维护词缀来源。
export function validateStatSource(data, decisions, locale) {
  const meta = data._meta
  if (
    meta?.projection !== 'source-placeholders' ||
    meta.sources?.length !== 2 ||
    !['en', locale].every((l) =>
      meta.sources.some((s) => s.locale === l && /^[a-f0-9]{64}$/.test(s.sha256)),
    ) ||
    !Array.isArray(meta.decisions) ||
    JSON.stringify(meta.decisions) !== JSON.stringify(decisions)
  )
    throw new Error('词缀投影或来源裁决失效，请重新生成')
  for (const decision of meta.decisions) {
    const selected = data.entries.filter((e) => e.id === decision.sourceId && e.en === decision.en)
    if (selected.length !== 1 || statSignature(selected[0]) !== decision.signature)
      throw new Error(`词缀来源裁决签名失效：${decision.sourceId}`)
  }
}

export function statTerm(stat, source, version, { inputOnly = false, displayChoice = true } = {}) {
  const suffix = createHash('sha256')
    .update(JSON.stringify([stat.en, stat.text, stat.order ?? null]))
    .digest('hex')
    .slice(0, 16)
  return {
    id: `${inputOnly ? 'input:zh-TW:' : ''}stat:${stat.id}:${suffix}`,
    en: stat.en,
    zh: stat.text,
    domain: 'stat',
    source,
    version,
    sourceId: stat.id,
    ...(stat.order ? { order: stat.order } : {}),
    ...(displayChoice && stat.preferred ? { preferred: true } : {}),
    ...(inputOnly ? { inputOnly: true } : {}),
  }
}
