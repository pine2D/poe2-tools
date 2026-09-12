import { describe, expect, test } from 'vitest'
import { parseItem } from './parse.js'

describe('parseItem', () => {
  test.each([
    ['物品类别: 胸甲', '火焰抗性 +20% (rune)'],
    ['物品種類: 胸甲', '+20% 火焰抗性 (rune)'],
    ['Item Class: Body Armours', '+20% to Fire Resistance (rune)'],
  ])('独立符文行 %s 保留为无头区块，不计普通词缀', (label, effect) => {
    const parsed = parseItem(
      `${label}\nRarity: Normal\nTest Armour\n--------\n${effect}\n--------\nItem Level: 12`,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.item.mods).toEqual([])
    expect(parsed.item.diagnostics).toEqual([])
    expect(parsed.item.blocks[0]).toEqual({ kind: 'runes', lines: [{ raw: effect, line: 5 }] })
  })

  test('符文标记不吞未知内容、不改变词缀或描述上下文', () => {
    const parsed = parseItem(
      'Item Class: Helmets\nRarity: Magic\nTest Helmet\n--------\nRequires: Level 12, 20 Str\n--------\nItem Level: 12\n--------\n+10% to Fire Resistance (rune)\nUnmodelled effect\n--------\n{ Suffix Modifier "Test" (Tier: 1) }\n+10% to Cold Resistance (rune)\n--------\nDescription: note\n+10% to Lightning Resistance (rune)',
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.item.blocks.filter((b) => b.kind === 'runes')).toHaveLength(1)
    expect(parsed.item.diagnostics.map((d) => d.message)).toEqual(['无法分类的原文已保留'])
    expect(parsed.item.mods[0]?.stats[0]?.raw).toBe('+10% to Cold Resistance (rune)')
    expect(parsed.item.blocks.at(-1)?.kind).toBe('description')
    expect(parsed.item.blocks[0]?.kind).toBe('requirements')
  })
  test.each(['Armour', '护甲', '護甲', 'Evasion Rating', '闪避值', '閃避值'])(
    '独立防具面板行 %s 不误作未知词缀且原值保留',
    (label) => {
      const rawText = `Item Class: Helmets\nRarity: Normal\nTest Helmet\n--------\n${label}: 37 (augmented)\n--------\nItem Level: 12`
      const parsed = parseItem(rawText)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      expect(parsed.item.diagnostics).toEqual([])
      expect(parsed.item.mods).toEqual([])
      expect(parsed.item.blocks[0]).toMatchObject({
        kind: 'properties',
        lines: [{ raw: `${label}: 37 (augmented)`, line: 5 }],
      })
    },
  )
  test('拒绝非装备输入和超长输入', () => {
    expect(parseItem('这不是装备')).toEqual({ ok: false, error: '无法识别装备文本' })
    expect(parseItem('x'.repeat(200_001))).toEqual({
      ok: false,
      error: '装备文本超过 200000 字符限制',
    })
  })

  test.each([
    [
      'zh-CN',
      '物品类别: 长杖\n稀有度: 稀有\n星火之柱\n粗制长杖\n--------\n属性:\n护甲: 30\n--------\n物品等级: 81',
    ],
    [
      'zh-TW',
      '物品種類: 長杖\n稀有度: 稀有\n星火之柱\n粗製長杖\n--------\n屬性:\n護甲: 30\n--------\n物品等級: 81',
    ],
    [
      'en',
      'Item Class: Quarterstaves\nRarity: Rare\nStorm Pillar\nCoarse Quarterstaff\n--------\nProperties:\nArmour: 30\n--------\nItem Level: 81',
    ],
  ] as const)('识别 %s 标题并保留原文和一基行号', (locale, rawText) => {
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item).toMatchObject({
      schemaVersion: 1,
      rawText,
      locale,
      rarity: 'rare',
      itemLevel: 81,
    })
    expect(result.item.nameLines).toEqual([
      { raw: rawText.split('\n')[2], line: 3 },
      { raw: rawText.split('\n')[3], line: 4 },
    ])
    expect(result.item.blocks.some((block) => block.kind === 'properties')).toBe(true)
  })

  test('物品等级缺失时保持 null 并给出诊断', () => {
    const result = parseItem('物品类别: 护符\n稀有度: 魔法\n沉静护符\n翡翠护符')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.itemLevel).toBeNull()
    expect(result.item.diagnostics).toContainEqual({
      code: 'missing-item-level',
      message: '未找到物品等级',
      line: null,
    })
  })

  test('同一属性头下多行属性构成一个词缀并保留实际值和倒序范围', () => {
    const rawText = [
      '物品类别: 长杖',
      '稀有度: 稀有',
      '星火之柱',
      '粗制长杖',
      '--------',
      '物品等级: 82',
      '--------',
      '{ 后缀词缀 “炽烈” (阶级: 2) — 火焰, 元素 }',
      '火焰抗性提高 15(10-20)%',
      '攻击速度提高 22(23-21)%（不可缩放）',
      '--------',
      '{ 基底词缀 — 攻击 }',
      '攻击附加 +1 点闪电伤害',
      '--------',
      '{ 腐化强化词缀 }',
      '+300 最大生命',
      '--------',
      '{ 传奇词缀 “余烬” }',
      '击中时点燃',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.mods).toHaveLength(4)
    expect(result.item.mods[0]).toMatchObject({
      kind: 'suffix',
      name: '炽烈',
      tier: 2,
      tags: ['火焰', '元素'],
    })
    expect(result.item.mods[0]?.stats).toEqual([
      {
        raw: '火焰抗性提高 15(10-20)%',
        line: 9,
        text: '火焰抗性提高 15%',
        rolls: [{ value: 15, range: [10, 20] }],
        unscalable: false,
      },
      {
        raw: '攻击速度提高 22(23-21)%（不可缩放）',
        line: 10,
        text: '攻击速度提高 22%',
        rolls: [{ value: 22, range: [23, 21] }],
        unscalable: true,
      },
    ])
    expect(result.item.mods.map((mod) => mod.kind)).toEqual([
      'suffix',
      'implicit',
      'enchant',
      'unique',
    ])
    expect(result.item.mods[1]?.stats[0]?.rolls).toEqual([{ value: 1, range: null }])
    expect(result.item.mods[2]?.stats[0]?.rolls).toEqual([{ value: 300, range: null }])
  })

  test('保留已知区块修饰文本、移动旗标并诊断未知结构', () => {
    const rawText = [
      'Item Class: Charms',
      'Rarity: Normal',
      'Synthetic Charm',
      '--------',
      'Properties:',
      'Charm Slots: 1 (augmented)',
      '--------',
      'Requirements:',
      'Level: 12 (unmet)',
      '--------',
      'Sockets: S S',
      'Grants Skill: Ember Guard',
      '--------',
      'Item Level: 10',
      'Item Level: 11',
      '--------',
      '{ Mystery Header }',
      'Metadata: preserved',
      'unknown semantic line',
      '--------',
      '{ Prefix Modifier "Empty" (Tier: 3) }',
      '--------',
      'Note: ~price 1 synthetic',
      'Corrupted',
      'Mirrored',
      'Unidentified',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item).toMatchObject({
      itemLevel: 10,
      corrupted: true,
      mirrored: true,
      unidentified: true,
    })
    expect(result.item.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'properties',
          lines: expect.arrayContaining([{ raw: 'Charm Slots: 1 (augmented)', line: 6 }]),
        }),
        expect.objectContaining({
          kind: 'requirements',
          lines: expect.arrayContaining([{ raw: 'Level: 12 (unmet)', line: 9 }]),
        }),
        expect.objectContaining({ kind: 'sockets', lines: [{ raw: 'Sockets: S S', line: 11 }] }),
        expect.objectContaining({
          kind: 'skill',
          lines: [{ raw: 'Grants Skill: Ember Guard', line: 12 }],
        }),
        expect.objectContaining({
          kind: 'note',
          lines: [{ raw: 'Note: ~price 1 synthetic', line: 23 }],
        }),
      ]),
    )
    expect(result.item.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'duplicate-item-level',
        'unknown-mod-header',
        'empty-mod-group',
        'unknown-line',
      ]),
    )
  })

  test('不完整数值范围原文保留并给出诊断', () => {
    const rawText = [
      '物品类别: 戒指',
      '稀有度: 魔法',
      '合成戒指',
      '--------',
      '物品等级: 20',
      '--------',
      '{ 前缀词缀 “坚固” (阶级: 1) }',
      '+15(10- 最大能量护盾',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.mods[0]?.stats[0]).toMatchObject({
      raw: '+15(10- 最大能量护盾',
      text: '+15(10- 最大能量护盾',
    })
    expect(result.item.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'incomplete-roll-range', line: 8 }),
    )
  })

  test('识别国服高级描述中的属性头、全角字段和数值不可估量尾注', () => {
    const rawText = [
      '物品类别: 权杖',
      '稀有度: 传奇',
      '合成之歌',
      '试制权杖',
      '--------',
      '护盾: 70 (augmented)',
      '--------',
      '需求： 等级 30 (unmet), 50 智慧',
      '--------',
      '插槽: S S',
      '--------',
      '物品等级: 60',
      '--------',
      '{ 腐化强化 — 元素, 闪电 }',
      '感电几率提高 18(15-20)%',
      '--------',
      '{ 基底属性 }',
      '+250 结界上限',
      '--------',
      '获得技能: 等级 10 合成守卫',
      '--------',
      '{ 传奇属性 }',
      '只能镶嵌试制符文 — 数值不可估量',
      '--------',
      '被腐化',
      '--------',
      '备注: ~b/o 10 synthetic',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.mods.map((mod) => mod.kind)).toEqual(['enchant', 'implicit', 'unique'])
    expect(result.item.mods[2]?.stats[0]).toMatchObject({
      text: '只能镶嵌试制符文',
      unscalable: true,
    })
    expect(result.item.corrupted).toBe(true)
    expect(result.item.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'properties',
          lines: [{ raw: '护盾: 70 (augmented)', line: 6 }],
        }),
        expect.objectContaining({
          kind: 'requirements',
          lines: [{ raw: '需求： 等级 30 (unmet), 50 智慧', line: 8 }],
        }),
        expect.objectContaining({ kind: 'sockets', lines: [{ raw: '插槽: S S', line: 10 }] }),
        expect.objectContaining({
          kind: 'skill',
          lines: [{ raw: '获得技能: 等级 10 合成守卫', line: 20 }],
        }),
        expect.objectContaining({
          kind: 'note',
          lines: [{ raw: '备注: ~b/o 10 synthetic', line: 27 }],
        }),
      ]),
    )
  })

  test('按出现顺序保留同一属性中的范围数值和普通数值', () => {
    const rawText = [
      'Item Class: Rings',
      'Rarity: Rare',
      'Synthetic Band',
      'Iron Ring',
      '--------',
      'Item Level: 70',
      '--------',
      '{ Prefix Modifier "Synthetic" (Tier: 1) }',
      'Adds 5(3-7) to 12 Fire Damage',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.mods[0]?.stats[0]?.rolls).toEqual([
      { value: 5, range: [3, 7] },
      { value: 12, range: null },
    ])
  })

  test('旗标中断空词缀组时给出诊断', () => {
    const rawText = [
      'Item Class: Rings',
      'Rarity: Rare',
      'Synthetic Band',
      'Iron Ring',
      '--------',
      'Item Level: 70',
      '--------',
      '{ Prefix Modifier "Synthetic" (Tier: 1) }',
      'Corrupted',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.diagnostics).toContainEqual({
      code: 'empty-mod-group',
      message: '词缀属性头下没有属性行',
      line: 8,
    })
  })

  test('识别首个分隔符之前的旗标且不将其当作名称', () => {
    const rawText = [
      'Item Class: Rings',
      'Rarity: Rare',
      'Synthetic Band',
      'Iron Ring',
      'Corrupted',
      '--------',
      'Item Level: 70',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.corrupted).toBe(true)
    expect(result.item.nameLines.map((line) => line.raw)).toEqual(['Synthetic Band', 'Iron Ring'])
    expect(result.item.blocks).toContainEqual({
      kind: 'flags',
      lines: [{ raw: 'Corrupted', line: 5 }],
    })
  })

  test('保留身份标题之前的未知语义行并给出诊断', () => {
    const rawText = [
      'Future semantic field: active',
      'Item Class: Rings',
      'Rarity: Rare',
      'Synthetic Band',
      'Iron Ring',
      '--------',
      'Item Level: 70',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.blocks).toContainEqual({
      kind: 'unknown',
      lines: [{ raw: 'Future semantic field: active', line: 1 }],
    })
    expect(result.item.diagnostics).toContainEqual({
      code: 'unknown-line',
      message: '无法分类的原文已保留',
      line: 1,
    })
  })

  test('将无 augmented 的能量护盾和精魂识别为物品属性', () => {
    const rawText = [
      '物品类别: 权杖',
      '稀有度: 稀有',
      '合成权杖',
      '试制基底',
      '--------',
      '能量护盾: 77',
      '精魂: 120',
      '--------',
      '物品等级: 55',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.blocks).toContainEqual({
      kind: 'properties',
      lines: [
        { raw: '能量护盾: 77', line: 6 },
        { raw: '精魂: 120', line: 7 },
      ],
    })
    expect(result.item.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'unknown-line', line: 6 }),
    )
  })

  test('精确识别咒符属性且不通吃未知 augmented 行', () => {
    const rawText = [
      '物品类别: 咒符',
      '稀有度: 魔法',
      '晴朗的试制咒符',
      '--------',
      '持续 4 秒',
      '每次使用会从 45 充能次数中消耗 17 (augmented) 次',
      '目前有 29 充能次数',
      '免疫冰冻',
      '未来字段: 9 (augmented)',
      '--------',
      '物品等级: 42',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.blocks).toContainEqual({
      kind: 'properties',
      lines: [
        { raw: '持续 4 秒', line: 5 },
        { raw: '每次使用会从 45 充能次数中消耗 17 (augmented) 次', line: 6 },
        { raw: '目前有 29 充能次数', line: 7 },
        { raw: '免疫冰冻', line: 8 },
      ],
    })
    expect(result.item.blocks).toContainEqual({
      kind: 'unknown',
      lines: [{ raw: '未来字段: 9 (augmented)', line: 9 }],
    })
  })

  test('将品质 augmented 行精确识别为物品属性', () => {
    const rawText = [
      '物品类别: 法杖',
      '稀有度: 传奇',
      '合成呼唤',
      '试制法杖',
      '--------',
      '品质: +20% (augmented)',
      '--------',
      '物品等级: 86',
    ].join('\n')
    const result = parseItem(rawText)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.item.blocks).toContainEqual({
      kind: 'properties',
      lines: [{ raw: '品质: +20% (augmented)', line: 6 }],
    })
    expect(result.item.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'unknown-line', line: 6 }),
    )
  })
})
