// 文件输入（spec §6.4.1、§6.4.2）：rail 是侧栏常驻的紧凑态（pt-droprail，可见部分只有按钮与“或粘贴内容”）；
// hero 是主区的大号拖放区（pt-dropzone）。“选择 .build 文件”始终是 <label for="file-input">，
// 真正获得焦点的是视觉隐藏的 #file-input，焦点环由 ui-theme 画在这个 label 上。
import { type ChangeEvent, type DragEvent, useState } from 'react'
import { Icon } from '../../../shared/components/Icon'
import { PtForgeButton } from '../../../shared/components/PtForgeButton'

export interface DropZoneProps {
  /** rail = 侧栏常驻的紧凑态；hero = 主区的大号引导态 */
  variant?: 'rail' | 'hero'
  /**
   * 只对 hero：true 时“选择 .build 文件”是本路由唯一的 pt-forge-btn（构筑空态），信任说明移到 EmptyState 脚注；
   * false 时是默认 pt-btn，信任说明留在拖放区内（词典失败且没有文件，spec §6.4.1）
   */
  forge?: boolean
  onFiles(files: File[]): void
  onPaste(text: string): void
}

export function DropZone({ variant = 'rail', forge = false, onFiles, onPaste }: DropZoneProps) {
  const [draft, setDraft] = useState('')
  const [over, setOver] = useState(false)

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files
    if (list !== null && list.length > 0) onFiles([...list])
    event.target.value = ''
  }
  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setOver(false)
    if (event.dataTransfer.files.length > 0) onFiles([...event.dataTransfer.files])
  }
  const submitPaste = () => {
    const text = draft.trim()
    if (text === '') return
    onPaste(text)
    setDraft('')
  }
  const hero = variant === 'hero'
  const dragProps = {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      setOver(true)
    },
    onDragLeave: () => setOver(false),
    onDrop: drop,
  }
  const chooser =
    hero && forge ? (
      <PtForgeButton as="label" htmlFor="file-input">
        <span>
          选择 <span className="pt-ext">.build</span> 文件
        </span>
      </PtForgeButton>
    ) : (
      <label
        className={hero ? 'pt-btn' : 'pt-btn pt-btn--quiet pt-btn--block'}
        htmlFor="file-input"
      >
        选择 .build 文件
      </label>
    )
  const input = (
    <input
      id="file-input"
      type="file"
      multiple
      accept=".build,application/json"
      onChange={pick}
      className="visually-hidden"
    />
  )
  // 粘贴入口收进折叠：拖拽与“选择文件”才是主路径。原生 <details>，键盘与展开状态由浏览器给
  const paste = (
    <details className="app__paste">
      <summary className="pt-textbtn">
        或粘贴内容
        <Icon name="chevron-down" size={18} />
      </summary>
      <div className="app__paste-body">
        <textarea
          className="pt-textarea"
          aria-label="粘贴 .build 内容"
          rows={hero ? 3 : 4}
          placeholder="把 .build 文件内容粘贴到这里"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          className="pt-btn pt-btn--quiet"
          onClick={submitPaste}
          disabled={draft.trim() === ''}
        >
          添加粘贴内容
        </button>
      </div>
    </details>
  )
  if (!hero) {
    return (
      <section
        className={over ? 'pt-droprail app__rail app__rail--over' : 'pt-droprail app__rail'}
        aria-label="文件输入"
        {...dragProps}
      >
        {chooser}
        {input}
        {paste}
      </section>
    )
  }
  return (
    <section
      className={over ? 'pt-dropzone pt-dropzone--over app__drop' : 'pt-dropzone app__drop'}
      aria-label="文件输入"
      {...dragProps}
    >
      <div className="app__drop-head">
        {/* 拖拽悬停时图标从“箭头朝上”换成“箭头朝下入托盘”：非颜色的状态冗余 */}
        <Icon name={over ? 'drop' : 'upload'} size={40} className="app__drop-icon" />
        <p className="app__drop-title">{over ? '松手即可导入' : '把 .build 文件拖到这里'}</p>
      </div>
      <div className="app__drop-body">
        {chooser}
        {input}
        <p className="app__drop-hint">支持一次拖入多个文件 · 也可以粘贴文件内容</p>
        {paste}
        {!forge && (
          <p className="app__drop-trust">
            <Icon name="lock" size={13} />
            {/* 文字包成一个 flex 项；“任何”“服务器”不拆开（spec §6.7 R15） */}
            <span>
              文件只在你的浏览器里解析，不会上传到<span className="nw">任何服务器</span>
            </span>
          </p>
        )}
      </div>
    </section>
  )
}
