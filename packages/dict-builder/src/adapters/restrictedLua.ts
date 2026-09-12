export type LuaValue = string | number | boolean | null | LuaTable

export interface LuaTable {
  [key: string]: LuaValue
}

export interface LuaBaseEntry {
  name: string
  value: LuaTable
}

type TokenKind = 'identifier' | 'number' | 'string' | 'symbol' | 'eof'

interface Token {
  kind: TokenKind
  value: string
  position: number
}

const MAX_DEPTH = 100
const NUMBER_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

class Lexer {
  private position = 0
  private readonly source: string

  constructor(source: string) {
    this.source = source
  }

  next(): Token {
    this.skipTrivia()
    const position = this.position
    const char = this.source[this.position]
    if (char === undefined) return { kind: 'eof', value: '', position }

    if ('{}[]=,;()'.includes(char)) {
      this.position += 1
      return { kind: 'symbol', value: char, position }
    }
    if (char === '"' || char === "'") return this.readString(char)
    if (/[A-Za-z_]/.test(char)) return this.readIdentifier()
    if (char === '-' || /[0-9.]/.test(char)) return this.readNumber()
    throw this.error(`不支持的字符 ${JSON.stringify(char)}`, position)
  }

  private skipTrivia(): void {
    while (this.position < this.source.length) {
      if (/\s/.test(this.source[this.position] ?? '')) {
        this.position += 1
        continue
      }
      if (this.source.startsWith('--[[', this.position)) {
        const end = this.source.indexOf(']]', this.position + 4)
        if (end < 0) throw this.error('块注释未结束', this.position)
        this.position = end + 2
        continue
      }
      if (this.source.startsWith('--', this.position)) {
        const end = this.source.indexOf('\n', this.position + 2)
        this.position = end < 0 ? this.source.length : end + 1
        continue
      }
      break
    }
  }

  private readIdentifier(): Token {
    const position = this.position
    this.position += 1
    while (/[A-Za-z0-9_]/.test(this.source[this.position] ?? '')) this.position += 1
    return { kind: 'identifier', value: this.source.slice(position, this.position), position }
  }

  private readNumber(): Token {
    const position = this.position
    const rest = this.source.slice(position)
    const match = rest.match(/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/)
    if (!match) throw this.error('数字格式不合法', position)
    this.position += match[0].length
    return { kind: 'number', value: match[0], position }
  }

  private readString(quote: string): Token {
    const position = this.position
    this.position += 1
    let value = ''
    while (this.position < this.source.length) {
      const char = this.source[this.position++]
      if (char === quote) return { kind: 'string', value, position }
      if (char !== '\\') {
        if (char === '\n' || char === '\r') throw this.error('字符串不能包含未转义换行', position)
        value += char
        continue
      }

      const escaped = this.source[this.position++]
      if (escaped === undefined) break
      const simple: Record<string, string> = {
        a: '\x07',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        v: '\v',
        '\\': '\\',
        '"': '"',
        "'": "'",
      }
      if (Object.hasOwn(simple, escaped)) {
        value += simple[escaped]
        continue
      }
      if (escaped === '\n') {
        value += '\n'
        continue
      }
      if (escaped === '\r') {
        if (this.source[this.position] === '\n') this.position += 1
        value += '\n'
        continue
      }
      if (escaped === 'x') {
        const hex = this.source.slice(this.position, this.position + 2)
        if (!/^[0-9A-Fa-f]{2}$/.test(hex)) throw this.error('十六进制转义不合法', position)
        const code = Number.parseInt(hex, 16)
        if (code > 127) throw this.error('十六进制转义只允许 ASCII 字节', position)
        value += String.fromCharCode(code)
        this.position += 2
        continue
      }
      if (/[0-9]/.test(escaped)) {
        const following = this.source.slice(this.position).match(/^\d{0,2}/)?.[0] ?? ''
        const decimal = escaped + following
        const code = Number.parseInt(decimal, 10)
        if (code > 127) throw this.error('十进制转义只允许 ASCII 字节', position)
        value += String.fromCharCode(code)
        this.position += following.length
        continue
      }
      if (escaped === 'z') {
        while (/\s/.test(this.source[this.position] ?? '')) this.position += 1
        continue
      }
      throw this.error(`不支持的转义 \\${escaped}`, position)
    }
    throw this.error('字符串未结束', position)
  }

  private error(message: string, position: number): Error {
    return new Error(`Lua 解析失败（位置 ${position}）：${message}`)
  }
}

class Parser {
  private token: Token
  private readonly lexer: Lexer

  constructor(lexer: Lexer) {
    this.lexer = lexer
    this.token = lexer.next()
  }

  parseModFile(): LuaTable {
    this.expectIdentifier('return')
    const table = this.parseTable(1)
    this.expectEof()
    return table
  }

  parseBaseEntries(): LuaBaseEntry[] {
    this.expectIdentifier('return')
    this.expectIdentifier('function')
    this.expectSymbol('(')
    this.expectIdentifier('itemBases')
    this.expectSymbol(')')

    const result: LuaBaseEntry[] = []
    while (!this.isIdentifier('end')) {
      this.expectIdentifier('itemBases')
      this.expectSymbol('[')
      const name = this.take('string').value
      this.expectSymbol(']')
      this.expectSymbol('=')
      const value = this.parseTable(1)
      result.push({ name, value })
      if (this.isSymbol(';')) this.advance()
    }
    this.expectIdentifier('end')
    this.expectEof()
    return result
  }

  private parseValue(depth: number): LuaValue {
    if (this.token.kind === 'string') return this.take('string').value
    if (this.token.kind === 'number') {
      const token = this.take('number')
      const value = Number(token.value)
      if (!Number.isFinite(value)) throw this.error('数字超出有效范围', token)
      return value
    }
    if (this.isSymbol('{')) return this.parseTable(depth)
    if (this.token.kind === 'identifier') {
      const token = this.take('identifier')
      if (token.value === 'true') return true
      if (token.value === 'false') return false
      if (token.value === 'nil') return null
      throw this.error(`不允许标识符值 ${token.value}`, token)
    }
    throw this.error('此处需要字面量值', this.token)
  }

  private parseTable(depth: number): LuaTable {
    if (depth > MAX_DEPTH) throw this.error(`表嵌套深度超过 ${MAX_DEPTH}`, this.token)
    this.expectSymbol('{')
    const result = newTable()
    let implicitIndex = 1

    while (!this.isSymbol('}')) {
      let key: string
      let value: LuaValue
      if (this.isSymbol('[')) {
        this.advance()
        const keyToken = this.token
        if (keyToken.kind !== 'string' && keyToken.kind !== 'number') {
          throw this.error('显式键只能是字符串或数字', keyToken)
        }
        this.advance()
        if (keyToken.kind === 'number') {
          const numericKey = Number(keyToken.value)
          if (!Number.isFinite(numericKey)) throw this.error('数字键超出有效范围', keyToken)
          key = String(numericKey)
        } else {
          if (NUMBER_PATTERN.test(keyToken.value)) {
            throw this.error('字符串键不能使用数字形式', keyToken)
          }
          key = keyToken.value
        }
        this.expectSymbol(']')
        this.expectSymbol('=')
        value = this.parseValue(depth + 1)
      } else if (this.token.kind === 'identifier') {
        const identifier = this.take('identifier')
        if (this.isSymbol('=')) {
          key = identifier.value
          this.advance()
          value = this.parseValue(depth + 1)
        } else {
          key = String(implicitIndex++)
          if (identifier.value === 'true') value = true
          else if (identifier.value === 'false') value = false
          else if (identifier.value === 'nil') value = null
          else throw this.error(`不允许标识符值 ${identifier.value}`, identifier)
        }
      } else {
        key = String(implicitIndex++)
        value = this.parseValue(depth + 1)
      }
      addField(result, key, value, this.token.position)

      if (this.isSymbol(',') || this.isSymbol(';')) this.advance()
      else if (!this.isSymbol('}')) throw this.error('表字段之间缺少逗号或分号', this.token)
    }
    this.expectSymbol('}')
    return result
  }

  private take(kind: TokenKind): Token {
    if (this.token.kind !== kind) throw this.error(`需要 ${kind}`, this.token)
    const token = this.token
    this.advance()
    return token
  }

  private expectIdentifier(value: string): void {
    if (!this.isIdentifier(value)) throw this.error(`需要关键字 ${value}`, this.token)
    this.advance()
  }

  private expectSymbol(value: string): void {
    if (!this.isSymbol(value)) throw this.error(`需要符号 ${value}`, this.token)
    this.advance()
  }

  private expectEof(): void {
    if (this.token.kind !== 'eof') throw this.error('包装后存在尾随代码', this.token)
  }

  private isIdentifier(value: string): boolean {
    return this.token.kind === 'identifier' && this.token.value === value
  }

  private isSymbol(value: string): boolean {
    return this.token.kind === 'symbol' && this.token.value === value
  }

  private advance(): void {
    this.token = this.lexer.next()
  }

  private error(message: string, token: Token): Error {
    return new Error(`Lua 解析失败（位置 ${token.position}）：${message}`)
  }
}

function newTable(): LuaTable {
  return Object.create(null) as LuaTable
}

function addField(target: LuaTable, key: string, value: LuaValue, position: number): void {
  if (Object.hasOwn(target, key)) {
    throw new Error(`Lua 解析失败（位置 ${position}）：重复键 ${JSON.stringify(key)}`)
  }
  target[key] = value
}

export function parsePobModFile(source: string): LuaTable {
  return new Parser(new Lexer(source)).parseModFile()
}

export function parsePobBaseFile(source: string): Record<string, LuaTable> {
  const result = newTable() as Record<string, LuaTable>
  for (const { name, value } of parsePobBaseEntries(source)) {
    addField(result, name, value, 0)
  }
  return result
}

export function parsePobBaseEntries(source: string): LuaBaseEntry[] {
  return new Parser(new Lexer(source)).parseBaseEntries()
}
