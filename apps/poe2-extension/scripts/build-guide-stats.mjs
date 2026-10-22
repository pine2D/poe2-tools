import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { statTerm, validateStatSource } from './stat-source.mjs'

const RULE_VERSION = 'guide-stats-v1'
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

export async function buildGuideStats(root, output) {
  const source = 'data/l10n/stats/zh-CN.json'
  const bytes = await readFile(path.join(root, source))
  const data = JSON.parse(bytes.toString())
  const decisions = JSON.parse(
    await readFile(path.join(root, 'data/l10n/stat-decisions.json'), 'utf8'),
  )
  validateStatSource(data, decisions.entries['zh-CN'], 'zh-CN')
  if (data._meta.tier !== 'primary') throw new Error('攻略词缀来源必须是已登记 primary 原始投影')
  const terms = data.entries.map((stat) =>
    statTerm(stat, source, data._meta.gameVersion, { displayChoice: false }),
  )
  const sources = [
    {
      path: source,
      sha256: sha(bytes),
      tier: data._meta.tier,
      source: data._meta.source,
      version: data._meta.gameVersion,
      snapshots: data._meta.sources,
    },
  ]
  // 裁决元数据保留在来源文件摘要中；本投影不采用 CoE preferred，身份只依赖实际条目与语言快照。
  const hash = sha(
    JSON.stringify({ ruleVersion: RULE_VERSION, terms, snapshots: data._meta.sources }),
  ).slice(0, 16)
  const result = {
    schemaVersion: 1,
    locale: 'zh-CN',
    purpose: 'guide-stat',
    ruleVersion: RULE_VERSION,
    hash,
    terms,
    sources,
  }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(result)}\n`)
  return result
}
