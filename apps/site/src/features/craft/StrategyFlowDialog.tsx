import { useEffect, useId, useRef, useState } from 'react'
import { StrategyFlowCanvas, type StrategyFlowCanvasProps } from './StrategyFlowCanvas'
import { StrategyStageList } from './StrategyStageList'
import './flow-dialog.css'

export function StrategyFlowDialog({
  onAddStage,
  ...props
}: StrategyFlowCanvasProps & {
  onAddStage: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const connectionControl = useRef<{ cancelConnection: () => boolean }>(null)
  const titleId = useId()
  const [isOpen, setIsOpen] = useState(false)
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])
  const close = (returnFocus = true) => {
    dialog.current?.close()
    setIsOpen(false)
    if (returnFocus) opener.current?.focus({ preventScroll: true })
  }
  return (
    <>
      <button
        type="button"
        ref={opener}
        onClick={() => {
          if (!dialog.current || dialog.current.open) return
          dialog.current.showModal()
          setIsOpen(true)
          closeButton.current?.focus({ preventScroll: true })
        }}
      >
        打开流程画布
      </button>
      <dialog
        ref={dialog}
        className="flow-dialog"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault()
          if (!connectionControl.current?.cancelConnection()) close()
        }}
        onClose={() => {
          if (!dialog.current?.open) setIsOpen(false)
        }}
      >
        <header className="flow-dialog-header">
          <h3 id={titleId}>编辑阶段流程</h3>
          <button type="button" ref={closeButton} onClick={() => close()}>
            返回制作演练
          </button>
        </header>
        <div className="flow-dialog-body">
          <div className="strategy-toolbar">
            <button
              type="button"
              aria-label="添加画布阶段"
              disabled={(props.strategy.flow?.stages.length ?? 0) >= 12}
              onClick={onAddStage}
            >
              添加阶段
            </button>
          </div>
          <details>
            <summary>管理画布阶段</summary>
            <StrategyStageList
              strategy={props.strategy}
              onChange={props.onChange}
              labelPrefix="画布"
            />
          </details>
          <StrategyFlowCanvas
            {...props}
            active={isOpen}
            connectionControl={connectionControl}
            onEditRule={(index) => {
              close(false)
              props.onEditRule(index)
            }}
          />
        </div>
      </dialog>
    </>
  )
}
