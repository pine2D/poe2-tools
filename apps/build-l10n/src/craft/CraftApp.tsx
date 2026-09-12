import {
  type CraftCatalog,
  createCatalogTranslator,
  createCoeUrl,
  createCraftItemDictionary,
  type ItemBlock,
  type ItemDictionary,
  type ItemDocument,
  type ItemInspection,
  type ItemLocale,
  inspectItem,
  type ModKind,
  parseItem,
} from '@poe2-tools/item-core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDictLoader, type FetchJson, type LoadedDict } from '../dict/loadDict'
import { useTheme } from '../theme/useTheme'
import { CatalogPanel } from './CatalogPanel'
import { ModStateBadges } from './ModStateBadges'
import { RuneSourcePanel, SkillSourcePanel } from './RuneSourcePanel'

export const PROJECT_KEY = 'poe2-tools.craft.project'
const PROJECT_VERSION = 1
const MAX_INPUT_LENGTH = 200_000
const MAX_COE_URL_LENGTH = 8_000

const SAMPLE = `物品类别: 法器
稀有度: 稀有
试作 星火
符文法器
--------
能量护盾: 80 (augmented)
--------
需求： 等级 45, 64 智慧
--------
物品等级: 46
--------
{ 前缀属性 "试验的" (等阶：6) — 能量护盾 }
+38(36-41) 能量护盾上限
{ 后缀属性 "试验之" (等阶：6) — 元素, 闪电, 抗性 }
闪电抗性 +17(16-20)%`

const RARITY = { normal: '普通', magic: '魔法', rare: '稀有', unique: '传奇' } as const
const GROUP_NAMES: Partial<Record<ModKind, string>> = {
  prefix: '前缀',
  suffix: '后缀',
  implicit: '基底属性',
  enchant: '附魔',
  unique: '传奇属性',
  unknown: '未知词缀',
}
const BLOCK_NAMES: Record<ItemBlock['kind'], string> = {
  properties: '物品属性',
  requirements: '需求',
  'item-level': '物品等级',
  sockets: '插槽',
  runes: '符文效果',
  skill: '技能',
  modifiers: '词缀原文',
  flags: '状态',
  note: '备注',
  description: '风味与描述',
  unknown: '未知内容',
}

type DictState =
  | { kind: 'loading'; locale: 'zh-CN' | 'zh-TW' }
  | { kind: 'ready'; locale: 'zh-CN' | 'zh-TW'; dict: LoadedDict }
  | { kind: 'error'; locale: 'zh-CN' | 'zh-TW'; error: string }

function dictionaryFor(dict: LoadedDict | null): ItemDictionary {
  if (dict === null) return {}
  const dictionary: ItemDictionary = {}
  if (dict.bundle.items !== undefined) dictionary.items = dict.bundle.items
  if (dict.bundle.stats !== undefined) dictionary.stats = dict.bundle.stats
  return dictionary
}

function dictLocale(locale: ItemLocale): 'zh-CN' | 'zh-TW' {
  return locale === 'zh-TW' ? 'zh-TW' : 'zh-CN'
}

function nameOf(item: ItemDocument): string {
  return item.nameLines.map((line) => line.raw).join(' · ') || '未命名装备'
}

function groupMods(inspection: ItemInspection) {
  const kinds: ModKind[] = ['prefix', 'suffix', 'implicit', 'enchant', 'unique', 'unknown']
  return kinds.flatMap((kind) => {
    const mods = inspection.mods.filter((entry) => entry.mod.kind === kind)
    return mods.length === 0 ? [] : [{ kind, mods }]
  })
}

function readProject(): { ok: true; rawText: string } | { ok: false; error: string } {
  try {
    const saved = localStorage.getItem(PROJECT_KEY)
    if (saved === null) return { ok: false, error: '本机没有已保存的项目' }
    const value: unknown = JSON.parse(saved)
    if (
      typeof value !== 'object' ||
      value === null ||
      (value as { version?: unknown }).version !== PROJECT_VERSION ||
      typeof (value as { rawText?: unknown }).rawText !== 'string'
    )
      return { ok: false, error: '本机项目版本不兼容或已损坏' }
    const rawText = (value as { rawText: string }).rawText
    if (rawText.length > MAX_INPUT_LENGTH) return { ok: false, error: '本机项目超过长度限制' }
    return { ok: true, rawText }
  } catch {
    return { ok: false, error: '本机项目已损坏或无法读取' }
  }
}

interface CraftAppProps {
  fetchImpl?: FetchJson
}

export function CraftApp({ fetchImpl }: CraftAppProps) {
  const { mode, setMode } = useTheme()
  const loader = useMemo(() => createDictLoader(import.meta.env.BASE_URL, fetchImpl), [fetchImpl])
  const [rawText, setRawText] = useState('')
  const [item, setItem] = useState<ItemDocument | null>(null)
  const [parsedText, setParsedText] = useState<string | null>(null)
  const [selections, setSelections] = useState<Record<number, string>>({})
  const [dictState, setDictState] = useState<DictState>({ kind: 'loading', locale: 'zh-CN' })
  const [message, setMessage] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalog, setCatalog] = useState<CraftCatalog | null>(null)
  const previewRef = useRef<HTMLTextAreaElement>(null)
  const requestRef = useRef(0)
  const mountedRef = useRef(true)

  const load = useCallback(
    async (locale: 'zh-CN' | 'zh-TW') => {
      const request = ++requestRef.current
      setDictState({ kind: 'loading', locale })
      const result = await loader(locale)
      if (!mountedRef.current || request !== requestRef.current) return
      setDictState(
        result.ok
          ? { kind: 'ready', locale, dict: result.dict }
          : { kind: 'error', locale, error: result.error },
      )
    },
    [loader],
  )

  useEffect(() => {
    mountedRef.current = true
    void load('zh-CN')
    return () => {
      mountedRef.current = false
      requestRef.current += 1
    }
  }, [load])

  const activeDict =
    dictState.kind === 'ready' && item !== null && dictState.locale === dictLocale(item.locale)
      ? dictState.dict
      : null
  const inspection = useMemo(() => {
    if (item === null) return null
    const dictionary = dictionaryFor(activeDict)
    return inspectItem(
      item,
      catalog ? createCraftItemDictionary(catalog, dictionary) : dictionary,
      selections,
    )
  }, [activeDict, item, selections, catalog])
  const dirty = item !== null && parsedText !== rawText
  const catalogTranslator = useMemo(
    () =>
      createCatalogTranslator(
        dictState.kind === 'ready' ? (dictState.dict.bundle.stats?.entries ?? []) : [],
      ),
    [dictState],
  )

  const parse = useCallback(
    (nextText = rawText, errorPrefix = '') => {
      const result = parseItem(nextText)
      if (!result.ok) {
        setRawText(nextText)
        setItem(null)
        setParsedText(null)
        setSelections({})
        setMessage(`${errorPrefix}${result.error}`)
        return false
      }
      setRawText(nextText)
      setItem(result.item)
      setParsedText(nextText)
      setSelections({})
      setMessage('装备解析完成')
      const locale = dictLocale(result.item.locale)
      if (dictState.locale !== locale) void load(locale)
      return true
    },
    [dictState.locale, load, rawText],
  )

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage(`${label}已复制`)
    } catch {
      previewRef.current?.focus()
      previewRef.current?.select()
      setMessage('复制失败，已选中文本，请手动复制')
    }
  }, [])

  const save = () => {
    try {
      localStorage.setItem(PROJECT_KEY, JSON.stringify({ version: PROJECT_VERSION, rawText }))
      setMessage('已保存到本机')
    } catch {
      setMessage('浏览器禁止本机存储，本次内容未保存')
    }
  }

  const restore = () => {
    const restored = readProject()
    if (!restored.ok) {
      setMessage(restored.error)
      return
    }
    if (parse(restored.rawText, '恢复的内容无法识别：')) setMessage('已恢复本机项目并重新解析')
  }

  const coeUrl =
    inspection?.bridgeText === null || inspection === null
      ? null
      : createCoeUrl(inspection.bridgeText)
  const usableCoeUrl = coeUrl !== null && coeUrl.length <= MAX_COE_URL_LENGTH ? coeUrl : null
  const bridgeReasons =
    inspection === null
      ? []
      : [
          ...inspection.bridgeReasons,
          ...(coeUrl !== null && usableCoeUrl === null
            ? ['装备文本生成的链接过长，请复制英文装备后手动导入。']
            : []),
        ]
  const hasUnresolved =
    inspection !== null &&
    (inspection.base.english === null ||
      inspection.mods.some((entry) =>
        entry.stats.some(({ resolution }) => resolution.english === null),
      ) ||
      inspection.skills.some(({ resolution }) => resolution.english === null))

  return (
    <div className="craft-app">
      <header className="craft-topbar">
        <a className="craft-brand" href="/">
          PoE2 Tools
        </a>
        <nav aria-label="工具导航">
          <a href="/">构筑汉化</a>
          <strong>装备工坊</strong>
        </nav>
        <label className="theme-control">
          主题
          <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
      </header>

      <main className="craft-shell">
        <section className="craft-intro">
          <div>
            <h1>装备导入与对照</h1>
            <p>解析高级装备文本，对照可确认的英文词条。所有内容只在浏览器本机处理。</p>
          </div>
          <div className="dict-state" role="status" aria-live="polite">
            {dictState.kind === 'loading' && '正在加载英文词典'}
            {dictState.kind === 'ready' && '英文词典就绪'}
            {dictState.kind === 'error' && (
              <>
                <span>英文词典加载失败</span>
                <button type="button" onClick={() => void load(dictState.locale)}>
                  重试英文词典
                </button>
              </>
            )}
          </div>
        </section>

        <details
          className="catalog-entry"
          onToggle={(event) => {
            if (event.currentTarget.open) setCatalogOpen(true)
          }}
        >
          <summary>搜索基底、词缀与通货演练</summary>
          {catalogOpen && (
            <CatalogPanel
              onCatalogReady={setCatalog}
              locale={dictState.locale}
              {...(dictState.kind === 'ready' ? { dictionary: dictState.dict.bundle } : {})}
              translations={
                dictState.kind === 'ready' ? (dictState.dict.bundle.items?.bases ?? {}) : {}
              }
              translateLine={catalogTranslator}
              {...(inspection?.base.english ? { initialBaseId: inspection.base.english } : {})}
              {...(item?.itemLevel ? { initialItemLevel: item.itemLevel } : {})}
              {...(!dirty && item && inspection?.base.english
                ? {
                    imported: {
                      baseId: inspection.base.english,
                      mods: inspection.mods,
                      runes: inspection.runes,
                      skills: inspection.skills,
                      item,
                      comparisonOnly: inspection.comparisonOnly,
                      implicitLines: [
                        ...inspection.mods
                          .filter(({ mod }) => mod.kind === 'implicit')
                          .flatMap(({ stats }) =>
                            stats.map(({ source, resolution }) => resolution.english ?? source.raw),
                          ),
                        ...inspection.skills.map(
                          ({ source, resolution }) => resolution.english ?? source.raw,
                        ),
                      ],
                    },
                  }
                : {})}
            />
          )}
        </details>

        <section className="craft-input-panel" aria-labelledby="input-title">
          <div className="section-title">
            <div>
              <h2 id="input-title">装备原文</h2>
              <p>
                在游戏内按 Ctrl+Alt+C 复制高级装备文本；普通 Ctrl+C 的信息不完整，只作为降级对照。
              </p>
            </div>
            <span>
              {rawText.length.toLocaleString()} / {MAX_INPUT_LENGTH.toLocaleString()}
            </span>
          </div>
          <textarea
            aria-label="粘贴装备文本"
            maxLength={MAX_INPUT_LENGTH}
            value={rawText}
            onChange={(event) => {
              setRawText(event.target.value)
              setMessage('')
            }}
            placeholder="粘贴装备的高级描述文本"
          />
          <div className="actions">
            <button className="primary" type="button" onClick={() => parse()}>
              解析装备
            </button>
            <button
              type="button"
              onClick={() => {
                setRawText(SAMPLE)
                setItem(null)
                setParsedText(null)
                setSelections({})
                setMessage('示例已载入，请解析装备')
              }}
            >
              载入示例
            </button>
            <button type="button" onClick={save}>
              保存到本机
            </button>
            <button type="button" onClick={restore}>
              恢复本机项目
            </button>
          </div>
          {dirty && <p className="gate gate-warn">输入已修改，请重新解析</p>}
          <p className="craft-message" role="status" aria-live="polite">
            {message}
          </p>
        </section>

        {item !== null && inspection !== null && (
          <div className="craft-results" aria-disabled={dirty || undefined}>
            <section className="item-card" aria-labelledby="item-title">
              <div className="item-heading">
                <div>
                  <p>
                    {item.itemClass} · {RARITY[item.rarity]}
                  </p>
                  <h2 id="item-title">{nameOf(item)}</h2>
                  {item.fractured && <span className="craft-fractured-item">破裂物品</span>}
                </div>
                {item.itemLevel !== null && (
                  <strong className="item-level-value">物品等级 {item.itemLevel}</strong>
                )}
              </div>
              {inspection.comparisonOnly && (
                <section className="gate gate-warn">
                  <strong>仅供对照</strong>
                  <p>{inspection.comparisonReason}</p>
                </section>
              )}

              <section className="base-resolution">
                <h3>基底英文</h3>
                {inspection.base.candidates.length > 1 ? (
                  <label>
                    基底英文候选
                    <select
                      aria-label="基底英文候选"
                      disabled={dirty}
                      value={selections[item.nameLines.at(-1)?.line ?? -1] ?? ''}
                      onChange={(event) => {
                        const line = item.nameLines.at(-1)?.line
                        if (line !== undefined)
                          setSelections((current) => ({ ...current, [line]: event.target.value }))
                      }}
                    >
                      <option value="">请选择</option>
                      {inspection.base.candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.english}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : inspection.base.english !== null ? (
                  <strong lang="en">{inspection.base.english}</strong>
                ) : (
                  <strong className="unresolved">未识别</strong>
                )}
              </section>

              <div className="mod-groups">
                {groupMods(inspection).map(({ kind, mods }) => (
                  <section className="mod-group" key={kind}>
                    <h3>
                      {GROUP_NAMES[kind]} · {mods.length} 组
                    </h3>
                    {mods.map((entry) => (
                      <div className="mod-card" key={entry.mod.header.line}>
                        <p className="mod-header">
                          {entry.mod.name ?? GROUP_NAMES[kind]}
                          {entry.mod.tier === null ? '' : ` · T${entry.mod.tier}`}
                        </p>
                        <ModStateBadges states={entry.mod.states} />
                        {entry.stats.map(({ source, resolution }) => (
                          <div className="stat-pair" key={source.line}>
                            <span lang={item.locale}>{source.raw}</span>
                            {resolution.candidates.length > 1 ? (
                              <label>
                                英文候选
                                <select
                                  disabled={dirty}
                                  value={selections[source.line] ?? ''}
                                  onChange={(event) =>
                                    setSelections((current) => ({
                                      ...current,
                                      [source.line]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">请选择</option>
                                  {resolution.candidates.map((candidate) => (
                                    <option key={candidate.id} value={candidate.id}>
                                      {candidate.english}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : resolution.english !== null ? (
                              <strong className="stat-english" lang="en">
                                {resolution.english}
                              </strong>
                            ) : (
                              <strong className="unresolved">未识别</strong>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </section>
                ))}
              </div>

              <div className="detail-grid">
                <RuneSourcePanel
                  runes={inspection.runes}
                  locale={item.locale}
                  selections={selections}
                  disabled={dirty}
                  onSelect={(line, candidate) =>
                    setSelections((current) => ({ ...current, [line]: candidate }))
                  }
                />
                <SkillSourcePanel
                  skills={inspection.skills}
                  locale={item.locale}
                  selections={selections}
                  disabled={dirty}
                  onSelect={(line, candidate) =>
                    setSelections((current) => ({ ...current, [line]: candidate }))
                  }
                />
                {item.blocks
                  .filter(
                    (block) => !['modifiers', 'item-level', 'runes', 'skill'].includes(block.kind),
                  )
                  .map((block) => (
                    <section key={`${block.kind}-${block.lines[0]?.line ?? 'empty'}`}>
                      <h3>{BLOCK_NAMES[block.kind]}</h3>
                      {block.lines.map((line) => (
                        <p key={line.line}>{line.raw}</p>
                      ))}
                    </section>
                  ))}
              </div>
              {item.diagnostics.length > 0 && (
                <section className="diagnostics">
                  <h3>解析诊断</h3>
                  <ul>
                    {item.diagnostics.map((diagnostic) => (
                      <li key={`${diagnostic.code}-${diagnostic.line}-${diagnostic.message}`}>
                        {diagnostic.line === null ? '' : `第 ${diagnostic.line} 行：`}
                        {diagnostic.message}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <details>
                <summary>查看所有原文</summary>
                <pre>{item.rawText}</pre>
              </details>
            </section>

            <aside className="export-panel" aria-labelledby="export-title">
              <h2 id="export-title">英文对照</h2>
              <p>仅转换词典中能够确认的名称和词条，未识别内容保留原文。</p>
              {inspection.bridgeText === null && (
                <p className="gate gate-warn">尚不能完整转接，原因见下方</p>
              )}
              {hasUnresolved && (
                <p className="unresolved-note">含未识别原文，英文对照仍保留原内容。</p>
              )}
              <textarea
                ref={previewRef}
                aria-label="英文对照文本"
                readOnly
                value={inspection.exportText}
              />
              <div className="actions export-actions">
                <button
                  type="button"
                  disabled={dirty}
                  onClick={() =>
                    void copyText(
                      inspection.exportText,
                      inspection.bridgeText === null ? '对照草稿' : '英文装备',
                    )
                  }
                >
                  {inspection.bridgeText === null ? '复制对照草稿' : '复制英文装备'}
                </button>
                {!dirty && usableCoeUrl !== null ? (
                  <a
                    className="button primary"
                    href={usableCoeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    在 CoE 打开
                  </a>
                ) : (
                  <button className="primary" type="button" disabled>
                    在 CoE 打开
                  </button>
                )}
              </div>
              <p className="privacy-note">点击外链会把装备文本带到 CoE；交易备注不会发送。</p>
              {bridgeReasons.length > 0 && (
                <ul className="bridge-reasons">
                  {bridgeReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
