import { DropZone } from './DropZone'

export interface EmptyStateProps {
  dictVersion: string | null
  onFiles(files: File[]): void
  onPaste(text: string): void
}

export function EmptyState({ dictVersion, onFiles, onPaste }: EmptyStateProps) {
  return (
    <div className="empty">
      <p className="empty__eyebrow">PoE2 Build Planner · 构筑备注汉化</p>
      <h2 className="empty__hero">英文构筑，中文读懂。</h2>
      <p className="empty__lede">
        导入攻略网站或作者提供的 .build 文件，按国服或台服术语翻译装备名与编号词缀，核对后直接下载。
      </p>
      <DropZone variant="hero" onFiles={onFiles} onPaste={onPaste} />
      <section className="empty__example" aria-label="词缀翻译示例">
        <span lang="en">+175 to maximum Life</span>
        <span aria-hidden="true">→</span>
        <span>最大生命 +175</span>
      </section>
      <p className="empty__foot">
        <span>自由备注与未收录内容保留原文；待核对项会单独标出。</span>
        <span>下载后放入游戏的 BuildPlanner 目录，即可在构筑规划器中查看。</span>
        {dictVersion !== null && <span>词典 {dictVersion}</span>}
      </p>
    </div>
  )
}
