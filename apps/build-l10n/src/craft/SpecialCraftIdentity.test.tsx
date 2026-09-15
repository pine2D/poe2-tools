import { readFileSync } from 'node:fs'
import {
  applyCraftStep,
  type CraftCatalog,
  type CraftResult,
  type CraftState,
  type CraftStep,
  createCraftState,
  enableCraftAffixIdentity,
  LIQUID_EMOTION_SOURCE,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { alloyTestFixture } from '../../../../packages/item-core/src/alloyTestFixture'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { jewelFixture } from '../../../../packages/item-core/src/jewelTestFixture'
import { AlloyCraftPanel } from './AlloyCraftPanel'
import { EssenceResultDetails } from './EssenceAdvicePanel'
import { EssenceCraftPanel } from './EssenceCraftPanel'
import { FracturePanel } from './FracturePanel'
import { LiquidEmotionCraftPanel } from './LiquidEmotionCraftPanel'

afterEach(cleanup)
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog = { ...primary, alloys: alloyTestFixture() }
const essenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceMana'
const alloyId = 'Metadata/Items/Currency/CurrencyVerisiumAlloy1'
const emotionId = 'Metadata/Items/Currency/EndgameDistilledEmotion3'
function ring(identified: boolean): CraftState {
  const state = must(
    createCraftState(catalog, {
      baseId: 'Gold Ring',
      itemLevel: 86,
      rarity: 'rare',
      sourceText: null,
      affixes: [
        { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
        { modId: 'FireResist1', lines: ['+10% to Fire Resistance'] },
      ],
    }),
  )
  return identified ? must(enableCraftAffixIdentity(catalog, state)) : state
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const select = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

function jewel(identified: boolean) {
  const { catalog, state } = jewelFixture()
  catalog._meta.sources.push(LIQUID_EMOTION_SOURCE)
  const template = catalog.modifiers[0]
  if (!template) throw new Error('缺少珠宝属性夹具')
  catalog.modifiers.push(
    {
      ...template,
      id: 'CraftedJewelAdditionalSuffixAllowed',
      group: 'PrefixSuffixAllowed',
      kind: 'prefix',
      craftedOnly: true,
      lines: ['+1 Suffix Modifier allowed'],
      eligibility: [{ tag: 'jewel', value: 0 }],
    },
    {
      ...template,
      id: 'CraftedJewelAdditionalPrefixAllowed',
      group: 'PrefixSuffixAllowed',
      kind: 'suffix',
      craftedOnly: true,
      lines: ['+1 Prefix Modifier allowed'],
      eligibility: [{ tag: 'jewel', value: 0 }],
    },
  )
  catalog.liquidEmotions = [
    {
      id: emotionId,
      name: 'Synthetic Emotion',
      tierLevel: 77,
      radiusJewel: false,
      mods: {
        Ruby: {},
        Sapphire: {
          prefix: 'CraftedJewelAdditionalSuffixAllowed',
          suffix: 'CraftedJewelAdditionalPrefixAllowed',
        },
        Emerald: {},
        Diamond: {},
      },
    },
  ]
  const current = must(
    createCraftState(catalog, {
      ...state,
      affixes: [
        { modId: 'prefix1', lines: ['prefix1 5'] },
        { modId: 'suffix1', lines: ['suffix1 8'] },
      ],
    }),
  )
  return { catalog, state: identified ? must(enableCraftAffixIdentity(catalog, current)) : current }
}

describe('特殊制作的实例选择与草稿', () => {
  it('固定精华的左旋配置切换为右旋时，移除池、禁用控件和实际操作一同切换', () => {
    const state = ring(true)
    const previews: CraftStep[] = []
    const props = {
      catalog,
      state,
      translations: {},
      disabled: false,
      onPreview: (operation: CraftStep) => previews.push(operation),
    }
    const view = render(
      <EssenceCraftPanel
        {...props}
        configuration={{ essenceId, omen: 'sinistral_crystallisation' }}
      />,
    )
    click(/^选择精华 /)
    fireEvent.click(screen.getByRole('radio', { name: /IncreasedLife1/ }))
    select('Perfect Essence of the Mind · 数值 1', '6')
    view.rerender(
      <EssenceCraftPanel
        {...props}
        configuration={{ essenceId, omen: 'dextral_crystallisation' }}
      />,
    )
    expect(screen.queryByRole('region', { name: '精华保证结果' })).toBeNull()
    const omen = screen.getByLabelText('精华预兆') as HTMLSelectElement
    expect(omen.disabled).toBe(true)
    expect(omen.value).toBe('dextral_crystallisation')
    click(/^选择精华 /)
    expect(screen.queryByRole('radio', { name: /IncreasedLife1/ })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /FireResist1/ }))
    click('预览精华结果')
    expect(previews).toEqual([
      {
        kind: 'essence',
        essenceId,
        omen: 'dextral_crystallisation',
        removeModId: 'FireResist1',
        removeAffixId: 'a2',
        values: [4],
      },
    ])
    const operation = previews[0]
    if (!operation) throw new Error('缺少精华结果')
    expect(applyCraftStep(catalog, state, operation).ok).toBe(true)
  })

  it('固定精华从有预兆切换为缺省时不继承旧预兆，重新显示完整移除池', () => {
    const previews: CraftStep[] = []
    const props = {
      catalog,
      state: ring(true),
      translations: {},
      disabled: false,
      onPreview: (operation: CraftStep) => previews.push(operation),
    }
    const view = render(
      <EssenceCraftPanel
        {...props}
        configuration={{ essenceId, omen: 'sinistral_crystallisation' }}
      />,
    )
    click(/^选择精华 /)
    fireEvent.click(screen.getByRole('radio', { name: /IncreasedLife1/ }))
    view.rerender(<EssenceCraftPanel {...props} configuration={{ essenceId }} />)
    expect(screen.queryByRole('region', { name: '精华保证结果' })).toBeNull()
    const omen = screen.getByLabelText('精华预兆') as HTMLSelectElement
    expect(omen.disabled).toBe(true)
    expect(omen.value).toBe('')
    click(/^选择精华 /)
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    fireEvent.click(screen.getByRole('radio', { name: /FireResist1/ }))
    click('预览精华结果')
    expect(previews).toEqual([
      { kind: 'essence', essenceId, removeModId: 'FireResist1', removeAffixId: 'a2', values: [4] },
    ])
  })

  it('自由与固定配置切换清草稿，固定缺省不采用自由预兆，返回自由模式保留其选择', () => {
    const props = {
      catalog,
      state: ring(true),
      translations: {},
      disabled: false,
      onPreview: () => {},
    }
    const view = render(<EssenceCraftPanel {...props} />)
    select('精华预兆', 'sinistral_crystallisation')
    click('选择精华 Perfect Essence of the Mind')
    fireEvent.click(screen.getByRole('radio', { name: /IncreasedLife1/ }))
    view.rerender(<EssenceCraftPanel {...props} configuration={{ essenceId }} />)
    expect(screen.queryByRole('region', { name: '精华保证结果' })).toBeNull()
    expect((screen.getByLabelText('精华预兆') as HTMLSelectElement).value).toBe('')
    click(/^选择精华 /)
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    view.rerender(<EssenceCraftPanel {...props} />)
    expect(screen.queryByRole('region', { name: '精华保证结果' })).toBeNull()
    const omen = screen.getByLabelText('精华预兆') as HTMLSelectElement
    expect(omen.disabled).toBe(false)
    expect(omen.value).toBe('sinistral_crystallisation')
    click('选择精华 Perfect Essence of the Mind')
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(
      (screen.getByRole('radio', { name: /IncreasedLife1/ }) as HTMLInputElement).checked,
    ).toBe(false)
  })

  it.each([false, true])('精华完整输出类型和所选实例，identified=%s', (identified) => {
    const state = ring(identified)
    const before = structuredClone(state)
    const previews: CraftStep[] = []
    render(
      <EssenceCraftPanel
        catalog={catalog}
        state={state}
        configuration={{ essenceId }}
        translations={{}}
        disabled={false}
        onPreview={(operation) => previews.push(operation)}
      />,
    )
    click(/^选择精华 /)
    const radio = screen.getByRole('radio', { name: /FireResist1/ }) as HTMLInputElement
    fireEvent.click(radio)
    expect(radio.value).toBe(identified ? 'a2' : 'FireResist1')
    click('预览精华结果')
    expect(previews).toHaveLength(1)
    expect(previews[0]).toMatchObject({ kind: 'essence', essenceId, removeModId: 'FireResist1' })
    if (identified) expect(previews[0]).toHaveProperty('removeAffixId', 'a2')
    else expect(previews[0]).not.toHaveProperty('removeAffixId')
    const operation = previews[0]
    if (!operation) throw new Error('缺少精华结果')
    const after = must(applyCraftStep(catalog, state, operation))
    expect(after.affixes.some((affix) => affix.modId === 'FireResist1')).toBe(false)
    expect(state).toEqual(before)
  })

  it.each([false, true])('合金下拉按实例定位且输出可真实应用，identified=%s', (identified) => {
    const state = ring(identified)
    const previews: CraftStep[] = []
    render(
      <AlloyCraftPanel
        catalog={catalog}
        state={state}
        configuration={{ alloyId }}
        translations={{}}
        disabled={false}
        onPreview={(operation) => previews.push(operation)}
      />,
    )
    click(/^选择合金 /)
    select('合金移除结果', identified ? 'a2' : 'FireResist1')
    expect(button('预览合金结果').disabled).toBe(false)
    click('预览合金结果')
    const operation = previews[0]
    if (!operation) throw new Error('缺少合金结果')
    expect(operation).toMatchObject({ kind: 'alloy', alloyId, removeModId: 'FireResist1' })
    if (identified) expect(operation).toHaveProperty('removeAffixId', 'a2')
    else expect(operation).not.toHaveProperty('removeAffixId')
    const after = must(applyCraftStep(catalog, state, operation))
    expect(after.affixes.some((affix) => affix.modId === 'FireResist1')).toBe(false)
  })

  it.each([false, true])('液态按实例选择，切侧清除旧移除身份，identified=%s', (identified) => {
    const { catalog, state } = jewel(identified)
    const previews: CraftStep[] = []
    render(
      <LiquidEmotionCraftPanel
        catalog={catalog}
        state={state}
        configuration={{ emotionId }}
        translations={{}}
        disabled={false}
        onPreview={(operation) => previews.push(operation)}
      />,
    )
    click('选择液态情感 Synthetic Emotion')
    select('液态情感保证结果', 'prefix')
    select('液态情感移除结果', identified ? 'a1' : 'prefix1')
    click('预览液态情感结果')
    expect(previews[0]).toEqual({
      kind: 'liquid-emotion',
      emotionId,
      resultKind: 'prefix',
      removeModId: 'prefix1',
      values: [],
      ...(identified ? { removeAffixId: 'a1' } : {}),
    })
    select('液态情感保证结果', 'suffix')
    expect((screen.getByLabelText('液态情感移除结果') as HTMLSelectElement).value).toBe('')
    expect(button('预览液态情感结果').disabled).toBe(true)
    select('液态情感移除结果', identified ? 'a2' : 'suffix1')
    click('预览液态情感结果')
    const operation = previews[1]
    if (!operation) throw new Error('缺少液态结果')
    expect(operation).toEqual({
      kind: 'liquid-emotion',
      emotionId,
      resultKind: 'suffix',
      removeModId: 'suffix1',
      values: [],
      ...(identified ? { removeAffixId: 'a2' } : {}),
    })
    expect(
      must(applyCraftStep(catalog, state, operation)).affixes.some(
        (affix) => affix.modId === 'suffix1',
      ),
    ).toBe(false)
  })

  it('精华同类型换实例快照立即清除旧结果和数值草稿', () => {
    const state = ring(true)
    const configuration = { essenceId }
    const props = { catalog, configuration, translations: {}, disabled: false, onPreview: () => {} }
    const view = render(<EssenceCraftPanel {...props} state={state} />)
    click(/^选择精华 /)
    fireEvent.click(screen.getByRole('radio', { name: /FireResist1/ }))
    const next = must(
      createCraftState(catalog, {
        ...state,
        nextAffixId: 4,
        affixes: state.affixes.map((affix) =>
          affix.affixId === 'a2' ? { ...affix, affixId: 'a3' } : affix,
        ),
      }),
    )
    view.rerender(<EssenceCraftPanel {...props} state={next} />)
    expect(screen.queryByRole('region', { name: '精华保证结果' })).toBeNull()
    click(/^选择精华 /)
    expect((screen.getByRole('radio', { name: /FireResist1/ }) as HTMLInputElement).checked).toBe(
      false,
    )
    expect(button('预览精华结果').disabled).toBe(true)
  })

  it('合金和液态更换同类型实例快照都清除旧草稿', () => {
    const state = ring(true)
    const props = {
      catalog,
      configuration: { alloyId },
      translations: {},
      disabled: false,
      onPreview: () => {},
    }
    const view = render(<AlloyCraftPanel {...props} state={state} />)
    click(/^选择合金 /)
    select('合金移除结果', 'a2')
    const next = must(
      createCraftState(catalog, {
        ...state,
        nextAffixId: 4,
        affixes: state.affixes.map((affix) =>
          affix.affixId === 'a2' ? { ...affix, affixId: 'a3' } : affix,
        ),
      }),
    )
    view.rerender(<AlloyCraftPanel {...props} state={next} />)
    expect(screen.queryByLabelText('合金移除结果')).toBeNull()
    view.unmount()
    const liquid = jewel(true)
    const liquidProps = {
      catalog: liquid.catalog,
      configuration: { emotionId },
      translations: {},
      disabled: false,
      onPreview: () => {},
    }
    const other = render(<LiquidEmotionCraftPanel {...liquidProps} state={liquid.state} />)
    click('选择液态情感 Synthetic Emotion')
    select('液态情感保证结果', 'prefix')
    select('液态情感移除结果', 'a1')
    const nextJewel = must(
      createCraftState(liquid.catalog, {
        ...liquid.state,
        nextAffixId: 4,
        affixes: liquid.state.affixes.map((affix) =>
          affix.affixId === 'a1' ? { ...affix, affixId: 'a3' } : affix,
        ),
      }),
    )
    other.rerender(<LiquidEmotionCraftPanel {...liquidProps} state={nextJewel} />)
    expect(screen.queryByLabelText('液态情感保证结果')).toBeNull()
  })

  it('破裂传具体实例，未知实际值只禁用对应候选', () => {
    const catalog = boneCatalog()
    const input = boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])
    input.affixes[1] = { modId: 'prefix2', lines: ['prefix2 (1-10)'] }
    const state = must(enableCraftAffixIdentity(catalog, input))
    const previews: CraftStep[] = []
    render(
      <FracturePanel
        catalog={catalog}
        state={state}
        label="破裂"
        disabled={false}
        targetModIds={[]}
        targetValues={[]}
        targetAlternatives={[]}
        onPreview={(operation) => previews.push(operation)}
      />,
    )
    expect(button('预览破裂 prefix2').disabled).toBe(true)
    expect(button('预览破裂 suffix1').disabled).toBe(false)
    click('预览破裂 suffix1')
    expect(previews).toEqual([{ kind: 'fracture', modId: 'suffix1', affixId: 'a3' }])
  })

  it('共用移除详情拒绝过期或类型不匹配的 ID，不回退展示同类型词缀', () => {
    const state = ring(true)
    const operation = {
      kind: 'alloy' as const,
      alloyId,
      removeModId: 'FireResist1',
      removeAffixId: 'a1',
      values: [37],
    }
    const view = render(
      <EssenceResultDetails catalog={catalog} state={state} operation={operation} />,
    )
    expect(screen.getByRole('alert').textContent).toContain('类型')
    expect(screen.queryByText(/指定移除整组/)).toBeNull()
    view.rerender(
      <EssenceResultDetails
        catalog={catalog}
        state={state}
        operation={{ ...operation, removeAffixId: 'a9' }}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('不存在')
    view.rerender(
      <EssenceResultDetails
        catalog={catalog}
        state={state}
        operation={{ ...operation, removeAffixId: 'a2' }}
      />,
    )
    expect(screen.getByText('指定移除整组：FireResist1 · +10% to Fire Resistance')).toBeDefined()
  })
})
