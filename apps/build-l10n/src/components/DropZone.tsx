import { type ChangeEvent, type DragEvent, useState } from 'react'
import { Icon } from './Icon'

export interface DropZoneProps {
  /** rail = 侧栏常驻的紧凑态；hero = 空态主区的大号引导态 */
  variant?: 'rail' | 'hero'
  onFiles(files: File[]): void
  onPaste(text: string): void
}

export function DropZone({ variant = 'rail', onFiles, onPaste }: DropZoneProps) {
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

  return (
    <section
      className={[
        'dropzone',
        variant === 'hero' ? 'dropzone--hero' : '',
        over ? 'dropzone--over' : '',
      ]
        .filter((name) => name !== '')
        .join(' ')}
      aria-label="文件输入"
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      {/* 拖拽悬停时图标从「箭头朝上」换成「箭头朝下入托盘」：非颜色的状态冗余 */}
      <Icon
        name={over ? 'drop' : 'upload'}
        size={variant === 'hero' ? 40 : 26}
        className="dropzone__icon"
      />
      <p className="dropzone__title">{over ? '松手即可导入' : '把 .build 文件拖到这里'}</p>
      <label className="button" htmlFor="file-input">
        选择 .build 文件
      </label>
      <input
        id="file-input"
        type="file"
        multiple
        accept=".build,application/json"
        onChange={pick}
        className="visually-hidden"
      />
      <p className="dropzone__hint">支持一次拖入多个文件 · 也可以把文件内容粘贴到下面</p>
      <textarea
        aria-label="粘贴 .build 内容"
        rows={variant === 'hero' ? 3 : 4}
        placeholder="或把 .build 文件内容粘贴到这里"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="button" onClick={submitPaste} disabled={draft.trim() === ''}>
        添加粘贴内容
      </button>
      <p className="dropzone__trust">
        <Icon name="lock" size={13} />
        文件只在你的浏览器里解析，不会上传到任何服务器
      </p>
    </section>
  )
}
