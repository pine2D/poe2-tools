// 单行拆分：编号行 "N. 正文"，或普通行。保留前导 / 尾随空白以便无损还原。

export interface LineParts {
  marker: string
  body: string
  trailing: string
}

export type ParsedLine = LineParts & { numbered: boolean }

// 编号行要求标号后至少一个空白，且正文非空
const NUMBERED = /^(\s*\d+\.\s+)(\S.*?)(\s*)$/
const PLAIN = /^(\s*)(.*?)(\s*)$/

export function parseLine(line: string): ParsedLine {
  const numbered = NUMBERED.exec(line)
  if (numbered !== null) {
    return {
      numbered: true,
      marker: numbered[1] ?? '',
      body: numbered[2] ?? '',
      trailing: numbered[3] ?? '',
    }
  }
  const plain = PLAIN.exec(line)
  // PLAIN 对任意不含换行的字符串都匹配；空串时三组均为空
  return {
    numbered: false,
    marker: plain?.[1] ?? '',
    body: plain?.[2] ?? '',
    trailing: plain?.[3] ?? '',
  }
}

export function formatLine(parts: LineParts): string {
  return `${parts.marker}${parts.body}${parts.trailing}`
}
