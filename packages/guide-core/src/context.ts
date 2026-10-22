import type { GuideBlock } from './types'

export const CONTEXT_VERSION = 'guide-context-v1'
export interface BlockContext {
  text: string
  fingerprint: string
}

// 先对用户已选范围构造，再查缓存和拆批；只引用原文，不引用旧译文。
export async function buildContexts(
  blocks: readonly GuideBlock[],
): Promise<Map<string, BlockContext>> {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  return new Map(
    await Promise.all(
      blocks.map(async (b) => {
        const eligible = blocks.filter(
          (x) =>
            !x.truncated &&
            x.kind !== 'verbatim' &&
            (x.stageId === b.stageId || (b.stageId !== undefined && x.stageId === undefined)),
        )
        const at = eligible.findIndex((x) => x.id === b.id)
        const selected: {
          id: string
          kind: string
          relation: string
          text: string
          excerpt: boolean
        }[] = []
        const add = (x: GuideBlock | undefined, relation: string) => {
          if (
            !x ||
            x.id === b.id ||
            !eligible.includes(x) ||
            selected.some((s) => s.id === x.id) ||
            selected.length >= 4
          )
            return
          const item = {
            id: x.id,
            kind: x.kind,
            relation,
            text: x.text.slice(0, 160),
            excerpt: x.text.length > 160,
          }
          if (JSON.stringify([...selected, item]).length <= 1400) selected.push(item)
        }
        if (b.context?.tableId) {
          for (const x of eligible) {
            if (x.context?.tableId !== b.context.tableId) continue
            if (x.context.header && x.context.column === b.context.column) add(x, 'column-header')
            else if (x.context.rowId === b.context.rowId) add(x, 'same-row')
          }
        }
        if (b.context?.headingIds)
          for (const id of b.context.headingIds) add(byId.get(id), 'heading')
        else
          add(
            eligible
              .slice(0, Math.max(0, at))
              .reverse()
              .find((x) => x.kind === 'heading'),
            'heading',
          )
        const sameSection = (x: GuideBlock | undefined) =>
          x &&
          x.kind !== 'heading' &&
          JSON.stringify(x.context?.headingIds ?? []) ===
            JSON.stringify(b.context?.headingIds ?? [])
        if (at >= 0) {
          if (sameSection(eligible[at - 1]))
            add(
              eligible[at - 1],
              b.context?.listId && eligible[at - 1]?.context?.listId === b.context.listId
                ? 'previous-list-item'
                : 'previous',
            )
          if (sameSection(eligible[at + 1]))
            add(
              eligible[at + 1],
              b.context?.listId && eligible[at + 1]?.context?.listId === b.context.listId
                ? 'next-list-item'
                : 'next',
            )
        }
        const text = JSON.stringify(selected)
        const digest = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify([CONTEXT_VERSION, text])),
        )
        const fingerprint = [...new Uint8Array(digest)]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('')
        return [b.id, { text, fingerprint }] as const
      }),
    ),
  )
}
