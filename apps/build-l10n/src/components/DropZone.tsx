import { type ChangeEvent, type DragEvent, useState } from 'react'

export interface DropZoneProps {
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
      <p>拖入 .build 文件，或</p>
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
      <textarea
        aria-label="粘贴 .build 内容"
        rows={4}
        placeholder="或把 .build 文件内容粘贴到这里"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="button" onClick={submitPaste} disabled={draft.trim() === ''}>
        添加粘贴内容
      </button>
    </section>
  )
}
