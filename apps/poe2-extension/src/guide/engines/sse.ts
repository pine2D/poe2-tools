// 解析 text/event-stream：按空行分事件，只取 data: 行。
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const flush = (event: string) => {
    for (const line of event.split('\n')) if (line.startsWith('data:')) onData(line.slice(5).trim())
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
    for (let at = buffer.indexOf('\n\n'); at >= 0; at = buffer.indexOf('\n\n')) {
      flush(buffer.slice(0, at))
      buffer = buffer.slice(at + 2)
    }
  }
  if (buffer.trim()) flush(buffer)
}
