import type { ModifierState } from '@poe2-tools/item-core'
import './modifier-states.css'

const LABELS: Record<ModifierState, string> = {
  crafted: '工艺',
  desecrated: '亵渎',
  fractured: '破裂',
}

export function ModStateBadges({ states }: { states: ModifierState[] | undefined }) {
  if (!states?.length) return null
  return (
    <ul className="craft-mod-states" aria-label="词缀来源">
      {states.map((state) => (
        <li className="craft-mod-state" key={state}>
          {LABELS[state]}
        </li>
      ))}
    </ul>
  )
}
