/** 原站部分模板把转义换行直接输出为文本；仅在显示/搜索边界解释，不解码任意转义。 */
export function displayText(text: string): string {
  return text.replace(/\\r\\n|\\n/g, '\n')
}
