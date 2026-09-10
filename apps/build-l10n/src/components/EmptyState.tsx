import { DropZone } from './DropZone'

export interface EmptyStateProps {
  /** 词典就绪时给出「zh-CN 0.5（联盟名）」，未就绪给 null */
  dictVersion: string | null
  onFiles(files: File[]): void
  onPaste(text: string): void
}

// 三步用罗马数字而不是 1/2/3：Cinzel 是纯大写石刻体，数字与字母难分，
// I/II/III 恰好是纯字母，既落在 Cinzel 的安全区里，又是这套视觉语言的母题。
const STEPS: readonly { key: string; title: string; text: string }[] = [
  { key: 'I', title: '导出', text: '在游戏的 Build Planner 里导出 .build 文件' },
  { key: 'II', title: '核对', text: '拖进来看逐行中英对照与覆盖率' },
  { key: 'III', title: '放回', text: '下载中文 .build，回 Build Planner 目录同名替换' },
]

export function EmptyState({ dictVersion, onFiles, onPaste }: EmptyStateProps) {
  return (
    <div className="empty">
      <span className="eyebrow empty__eyebrow">Build Planner Localization</span>
      {/* 空态最大的一块必须是产品名（mockup State B 的 .hero 就是产品名，40px 金渐变裁切）。
          顶栏字标是压缩过的「PoE2 构筑汉化」，这里写全称，两处不重复也不打架。 */}
      <h2 className="empty__hero">流放之路 2 构筑汉化</h2>
      <span className="empty__rule" />
      <p className="empty__lede">
        把英文攻略里的构筑备注翻成中文：基底名、传奇名与编号词缀行按国服或台服术语替换，
        未命中的行保留英文并标出来。下载回来的文件可以直接放进 Build Planner 目录。
      </p>
      <ol className="steps">
        {STEPS.map((step) => (
          <li key={step.key} className="steps__item">
            <span className="steps__key" aria-hidden="true">
              {step.key}
            </span>
            <span className="steps__text">
              <b className="steps__title">{step.title}</b>
              {step.text}
            </span>
          </li>
        ))}
      </ol>
      <DropZone variant="hero" onFiles={onFiles} onPaste={onPaste} />
      <p className="empty__foot">
        {dictVersion !== null && (
          <>
            <span>词典 {dictVersion}</span>
            <span className="empty__sep" />
          </>
        )}
        <span>简体（国服）与繁体（台服）两套术语，各自独立</span>
        <span className="empty__sep" />
        <span>未命中的行保留英文原文，不做猜测替换</span>
      </p>
    </div>
  )
}
