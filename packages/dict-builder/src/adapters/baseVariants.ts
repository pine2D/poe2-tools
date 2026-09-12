import { createHash } from 'node:crypto'
import type { CatalogBase } from '@poe2-tools/item-core'
import { normalizeBase } from './craftCatalog'
import type { LuaTable } from './restrictedLua'

export interface BaseDeclaration {
  name: string
  value: LuaTable
  sourcePath: string
  index: number
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => compare(a, b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error('基底变体包含不可序列化字段')
  return encoded
}

export function normalizeBaseDeclarations(entries: BaseDeclaration[]): CatalogBase[] {
  const groups = new Map<string, BaseDeclaration[]>()
  for (const entry of entries) {
    const group = groups.get(entry.name) ?? []
    group.push(entry)
    groups.set(entry.name, group)
  }

  const bases = new Map<string, CatalogBase>()
  const identities = new Map<string, string>()
  for (const declarations of groups.values()) {
    for (const declaration of declarations) {
      const base = normalizeBase(declaration.name, declaration.value)
      const content = canonicalJson(
        Object.fromEntries(
          Object.entries(base).filter(([key]) => key !== 'id' && key !== 'hidden'),
        ),
      )
      if (declarations.length > 1) {
        base.id = `pob2:base:v1:${createHash('sha256').update(content).digest('hex')}`
      }
      const previous = identities.get(base.id)
      if (previous !== undefined && previous !== content) {
        throw new Error(`基底变体 ID 碰撞：${base.id}`)
      }
      identities.set(base.id, content)

      if (declarations.length === 1) {
        bases.set(base.id, base)
        continue
      }

      const variant = bases.get(base.id) ?? base
      variant.variant ??= { visibility: 'visible', declarations: [] }
      variant.variant.declarations.push({
        sourcePath: declaration.sourcePath,
        index: declaration.index,
        hidden: base.hidden,
      })
      bases.set(base.id, variant)
    }
  }

  for (const base of bases.values()) {
    if (!base.variant) continue
    const declarations = base.variant.declarations
    declarations.sort((a, b) => compare(a.sourcePath, b.sourcePath) || a.index - b.index)
    const hiddenCount = declarations.filter((declaration) => declaration.hidden).length
    base.hidden = hiddenCount === declarations.length
    base.variant.visibility = base.hidden ? 'hidden' : hiddenCount === 0 ? 'visible' : 'mixed'
  }
  return [...bases.values()].sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id))
}
