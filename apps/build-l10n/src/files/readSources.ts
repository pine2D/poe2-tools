import type { SourceFile } from '../translate/runTranslation'

let counter = 0
function nextId(): string {
  counter += 1
  return `source-${counter}`
}

export async function readFiles(files: readonly File[]): Promise<SourceFile[]> {
  const sources: SourceFile[] = []
  for (const file of files) sources.push({ id: nextId(), name: file.name, text: await file.text() })
  return sources
}

export function pastedSource(text: string, n: number): SourceFile {
  return { id: nextId(), name: `pasted-${n}.build`, text }
}
