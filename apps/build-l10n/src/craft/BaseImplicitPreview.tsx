import { type CatalogBase, readBaseSkillVariants } from '@poe2-tools/item-core'
import { useId, useState } from 'react'

export function BaseImplicitPreview({
  base,
  translateLine,
}: {
  base: CatalogBase
  translateLine?: ((line: string) => string | null) | undefined
}) {
  const id = useId()
  const [selected, setSelected] = useState('')
  const choices = readBaseSkillVariants(base)
  const skill = choices?.variants.find((entry) => String(entry.index) === selected)
  if (!base.implicit) return null
  const lines = choices?.commonLines ?? base.implicit.split('\n')
  return (
    <section className="catalog-facts">
      <h4>固有属性</h4>
      {lines.map((line) => {
        const translated = translateLine?.(line)
        return translated ? (
          <span className="catalog-implicit-translation" key={line}>
            {translated}
          </span>
        ) : null
      })}
      {lines.length > 0 && <code className="catalog-implicit-source">{lines.join('\n')}</code>}
      {choices && (
        <>
          <p>该基底只授予其中一项技能，共有 {choices.variants.length} 项候选。</p>
          <label htmlFor={id}>查看候选技能</label>
          <select id={id} value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">选择一项查看</option>
            {choices.variants.map((entry) => (
              <option key={entry.index} value={entry.index}>
                {translateLine?.(entry.line) ?? entry.name}
              </option>
            ))}
          </select>
          {skill && (
            <div aria-live="polite">
              {translateLine?.(skill.line) ? <span>{translateLine(skill.line)}</span> : null}
              <code>{skill.line}</code>
            </div>
          )}
          <small>此处仅查看技能候选，不改变导入装备或制作起点。特殊制作规则仍待核对。</small>
          <details>
            <summary>查看完整来源原文</summary>
            <code className="catalog-implicit-source">{base.implicit}</code>
          </details>
        </>
      )}
    </section>
  )
}
