// 构筑空态（spec §6.4.1）：主区一扇 pt-frame--hero，标题栏“导入 .build”（<p>，让 hero 保持 h2，M0 B7）。
// 框内依次为 hero 标题、导语、拖放区（唯一的 pt-forge-btn）、示例行、中英示例、隐私说明与脚注。
// 脚注不写词典版本，版本只在词典状态条显示（B14）。
import { Icon } from '../../../shared/components/Icon'
import { PtDivider } from '../../../shared/components/PtDivider'
import { PtFrame } from '../../../shared/components/PtFrame'
import { PtPanel } from '../../../shared/components/PtPanel'
import { DropZone } from './DropZone'

export interface EmptyStateProps {
  onExample(): void
  onFiles(files: File[]): void
  onPaste(text: string): void
}

export function EmptyState({ onFiles, onPaste, onExample }: EmptyStateProps) {
  return (
    <PtFrame
      variant="hero"
      className="app__empty"
      aria-labelledby="empty-hero"
      titlebar={{
        title: (
          <>
            导入 <span className="pt-ext">.build</span>
          </>
        ),
        as: 'p',
      }}
    >
      <h2 className="pt-hero-title pt-hero-title--build" id="empty-hero">
        英文构筑，
        <br className="mobile-break" />
        <span className="pt-hero-title__gold">中文读懂。</span>
      </h2>
      <p className="app__empty-lede">
        导入攻略网站或作者提供的 .build 文件，按国服或台服术语翻译装备名与编号词缀，核对后直接下载。
      </p>
      <DropZone variant="hero" forge onFiles={onFiles} onPaste={onPaste} />
      <div className="app__example-action">
        <span>还没有文件？</span>
        <button className="pt-btn" type="button" onClick={onExample}>
          试用示例构筑
        </button>
        <span>自制演示文件，不是配装建议</span>
      </div>
      <PtPanel
        as="section"
        variant="inset"
        className="app__empty-example"
        aria-label="词缀翻译示例"
      >
        <div className="app__ex-line">
          <span className="app__ex-cap">英文词缀</span>
          <span className="app__ex-en" lang="en">
            <span className="pt-num">+175</span> to maximum Life
          </span>
        </div>
        <PtDivider className="app__ex-divider" />
        <div className="app__ex-line">
          <span className="app__ex-cap">中文预览</span>
          <span className="app__ex-zh">
            <span className="pt-num">+175</span> 生命上限
          </span>
        </div>
      </PtPanel>
      <p className="app__empty-trust">
        <Icon name="lock" size={14} />
        {/* 文字包成一个 flex 项；“任何”“服务器”不拆开（spec §6.7 R15） */}
        <span>
          文件只在你的浏览器里解析，不会上传到<span className="nw">任何服务器</span>
        </span>
      </p>
      <p className="app__empty-foot">
        <span>
          自由备注和未收录的内容保留原文，需要核对的地方会<span className="nw">单独标出</span>。
        </span>
        <span>
          下载后可放入游戏的 BuildPlanner 目录；目前还未在<span className="nw">游戏中</span>
          验证加载效果。
        </span>
      </p>
    </PtFrame>
  )
}
