// 行内 NamePair（辅助宝石、天赋，spec §6.4.2，B6）：中文在前、英文在后，基线对齐。
// 中文缺失时沿用改版前：辅助宝石在中文位置显示“未命中”，天赋只显示英文名。
import type { PreviewName } from '@poe2-tools/build-core'

export function NamePair({ name, kind }: { name: PreviewName; kind: 'gem' | 'passive' }) {
  const english = (
    <span className="namepair__en" lang="en">
      {name.en ?? name.id}
    </span>
  )
  if (kind === 'passive') {
    return (
      <span className="namepair">
        {name.text !== null && <span className="namepair__zh">{name.text}</span>}
        {english}
      </span>
    )
  }
  return (
    <span className="namepair">
      <span
        className={
          name.text === null
            ? 'namepair__zh namepair__zh--gem namepair__zh--miss'
            : 'namepair__zh namepair__zh--gem'
        }
      >
        {name.text ?? '未命中'}
      </span>
      {english}
    </span>
  )
}
