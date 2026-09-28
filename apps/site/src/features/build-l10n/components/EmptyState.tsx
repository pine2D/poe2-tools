import { DropZone } from './DropZone'

export interface EmptyStateProps {
  dictVersion: string | null
  onExample(): void
  onFiles(files: File[]): void
  onPaste(text: string): void
}

export function EmptyState({ dictVersion, onFiles, onPaste, onExample }: EmptyStateProps) {
  return (
    <div className="empty">
      <h2 className="empty__hero">英文构筑，中文读懂。</h2>
      <p className="empty__lede">
        导入攻略网站或作者提供的 .build 文件，按国服或台服术语翻译装备名与编号词缀，核对后直接下载。
      </p>
      <DropZone variant="hero" onFiles={onFiles} onPaste={onPaste} />
      <div className="example-action">
        <span>还没有文件？</span>
        <button className="button" type="button" onClick={onExample}>
          试用示例构筑
        </button>
        <span>自制演示文件，不是配装建议</span>
      </div>
      <section className="empty__example" aria-label="词缀翻译示例">
        <div>
          <span className="empty__caption">英文词缀</span>
          <span lang="en">+175 to maximum Life</span>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <span className="empty__caption">中文预览</span>
          <span>+175 生命上限</span>
        </div>
      </section>
      <p className="empty__foot">
        <span>自由备注和未收录的内容保留原文，需要核对的地方会单独标出。</span>
        <span>下载后可放入游戏的 BuildPlanner 目录；目前还未在游戏中验证加载效果。</span>
        {dictVersion !== null && <span>词典 {dictVersion}</span>}
      </p>
    </div>
  )
}
