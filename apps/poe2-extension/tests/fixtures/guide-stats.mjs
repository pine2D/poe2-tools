import { createHash } from 'node:crypto'
// 最小自造的合法攻略词缀包；包测试会分别篡改字段验证真实校验器。
export function guideStatsFixture() {
  const terms = [
    {
      id: 'stat:req',
      sourceId: 'req',
      en: '#% increased Attribute Requirements',
      zh: '属性需求提高 #%',
      domain: 'stat',
      source: 'data/l10n/stats/zh-CN.json',
      version: 'unknown',
    },
  ]
  const snapshots = ['en', 'zh-CN'].map((locale) => ({ locale, sha256: 'a'.repeat(64) }))
  const ruleVersion = 'guide-stats-v1'
  const hash = createHash('sha256')
    .update(JSON.stringify({ ruleVersion, terms, snapshots }))
    .digest('hex')
    .slice(0, 16)
  return {
    schemaVersion: 1,
    locale: 'zh-CN',
    purpose: 'guide-stat',
    ruleVersion,
    hash,
    terms,
    sources: [
      {
        path: 'data/l10n/stats/zh-CN.json',
        sha256: 'a'.repeat(64),
        tier: 'primary',
        source: 'synthetic',
        version: 'unknown',
        snapshots,
      },
    ],
  }
}
