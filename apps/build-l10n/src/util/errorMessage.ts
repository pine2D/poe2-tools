// 把 unknown 异常统一成可显示的消息
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
