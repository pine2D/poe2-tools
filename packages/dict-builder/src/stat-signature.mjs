import { createHash } from 'node:crypto'

// 构建期共用签名：绑定来源身份、原始两侧文字和数值重排；不能只依赖英文归一键。
export function statSignature(entry) {
  return createHash('sha256')
    .update(JSON.stringify([entry.id, entry.en, entry.text, entry.order ?? null]))
    .digest('hex')
}
