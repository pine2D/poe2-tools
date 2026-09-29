// 母题「符文菱结」的空 span（spec §4.5）：图形全部画在 ui-theme 的 .pt-motif 伪元素上，读屏不读
import type { ReactElement } from 'react'

export type MotifSymbol = 'logo' | 'knot' | 'clasp' | 'gem'

export interface MotifProps {
  symbol: MotifSymbol
  className?: string
}

/** 以空格拼接类名，跳过空值 */
export function cx(...names: readonly (string | false | null | undefined)[]): string {
  return names.filter((name) => typeof name === 'string' && name !== '').join(' ')
}

export function Motif({ symbol, className }: MotifProps): ReactElement {
  return <span className={cx('pt-motif', `pt-motif--${symbol}`, className)} aria-hidden="true" />
}
