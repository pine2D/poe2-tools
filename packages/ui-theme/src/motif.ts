// 母题「符文菱结」几何唯一源（spec §4.5）：自绘路径，四块平涂刻面，不用渐变。
// 只用可擦除语法，不导入任何模块：Node 直接加载，apps/site 经 exports 引用。

/** 平涂刻面：[填充色, SVG path d] */
export type Facet = readonly [fill: string, d: string]
export type MotifSymbolName = 'corner' | 'knot' | 'logo' | 'gem' | 'knot-full'

/** 核心底层：外菱 #120a04（半对角线 12.4）+ 四块斜面菱环刻面 + 内暗菱 #140b04（半对角线 6.6），不含宝石（mockup :554-559） */
export const CORE_FACETS: readonly Facet[] = [
  ['#120a04', 'M0-12.4 12.4 0 0 12.4-12.4 0Z'],
  ['#f3d8a2', 'M-11 0 0-11V-6.6L-6.6 0Z'],
  ['#c89a5c', 'M0-11 11 0H6.6L0-6.6Z'],
  ['#5e3c1b', 'M11 0 0 11V6.6L6.6 0Z'],
  ['#94673a', 'M0 11-11 0H-6.6L0 6.6Z'],
  ['#140b04', 'M0-6.6 6.6 0 0 6.6-6.6 0Z'],
]

/** 宝石菱形半对角线（viewBox 单位） */
export const GEM_HALF_DIAGONAL = 4.9
/** 宝石菱形轮廓（遮罩用） */
export const GEM_DIAMOND_PATH = 'M0-4.9 4.9 0 0 4.9-4.9 0Z'
/** 宝石四刻面路径，依次左上、右上、右下、左下（对应 --gem-1..4，mockup :560-563） */
export const GEM_FACET_PATHS = [
  'M0-4.9-4.9 0H0Z',
  'M0-4.9 4.9 0H0Z',
  'M4.9 0 0 4.9V0Z',
  'M-4.9 0 0 4.9V0Z',
] as const
/** 站点琥珀四刻面色，依次 --gem-1..4 */
export const SITE_AMBER = ['#fff0c8', '#e3a24a', '#7a3d0c', '#b36a22'] as const

/** 扩展青四刻面色，依次 --gem-1..4；与 tokens.css 的 .pt-attr-ext 一致（motif.test.ts 断言） */
export const EXT_CYAN = ['#c9f5f0', '#2fbdb3', '#0b4a46', '#1a8780'] as const

/** 宝石四刻面：GEM_FACET_PATHS 依次配上 colors 的前四个颜色 */
export function gemFacets(colors: readonly string[]): Facet[] {
  return GEM_FACET_PATHS.map((d, i): Facet => [colors[i] ?? '#000', d])
}

/** 臂：s 单段收尖（分隔线、名称牌扣），xs 短收尖（logo），m 叶瓣 + 收尖（角饰）（mockup :566-583） */
export const ARMS: {
  readonly s: readonly Facet[]
  readonly xs: readonly Facet[]
  readonly m: readonly Facet[]
} = {
  s: [
    ['#120a04', 'M9.5-2.6 31.6 0 9.5 2.6Z'],
    ['#e6c083', 'M10.5-1.7 30 0H10.5Z'],
    ['#7a5530', 'M10.5 1.7 30 0H10.5Z'],
  ],
  xs: [
    ['#120a04', 'M9.5-2.8 23.6 0 9.5 2.8Z'],
    ['#e6c083', 'M10.5-1.9 22.2 0H10.5Z'],
    ['#7a5530', 'M10.5 1.9 22.2 0H10.5Z'],
  ],
  m: [
    ['#120a04', 'M9.4 0Q15.8-6.6 22.4 0 15.8 6.6 9.4 0Z'],
    ['#120a04', 'M21-2.3 34.6 0 21 2.3Z'],
    ['#ecca90', 'M10.8 0Q15.8-5 21 0Z'],
    ['#7f582e', 'M10.8 0Q15.8 5 21 0Z'],
    ['#dcb477', 'M22-1.35 33.2 0H22Z'],
    ['#6c4a27', 'M22 1.35 33.2 0H22Z'],
  ],
}

/** 全形臂在 m 之上追加的刻痕与铆钉（mockup :585-590） */
export const ARM_L_EXTRA: {
  readonly notch: string
  readonly rivet: {
    readonly cx: number
    readonly cy: number
    readonly outerR: number
    readonly innerR: number
  }
  readonly rivetStops: readonly (readonly [offset: number, color: string])[]
} = {
  notch: 'M15.8-2.4V2.4',
  rivet: { cx: 22, cy: 0, outerR: 2.1, innerR: 1.4 },
  rivetStops: [
    [0, '#fff2cc'],
    [0.45, '#c8955a'],
    [1, '#3f2710'],
  ],
}

export interface MotifSymbol {
  /** viewBox 字符串 */
  readonly viewBox: string
  /** 使用哪组臂；'l' 为 m + ARM_L_EXTRA；null 为只有核心 */
  readonly arms: 's' | 'xs' | 'm' | 'l' | null
  /** pair：右臂 + scale(-1 1) 镜像；corner：右臂 + rotate(90) scale(1 -1)；core：无臂 */
  readonly layout: 'pair' | 'corner' | 'core'
  /** 宝石中心在渲染盒内的相对坐标（0–1），用于 --pt-motif-<符号>-gem-x/-y */
  readonly gemCenter: readonly [x: number, y: number]
}

// 宝石中心固定在原点：相对坐标 = -minX / width、-minY / height
function symbol(
  viewBox: string,
  arms: MotifSymbol['arms'],
  layout: MotifSymbol['layout'],
): MotifSymbol {
  const [minX = 0, minY = 0, width = 1, height = 1] = viewBox.split(' ').map(Number)
  return { viewBox, arms, layout, gemCenter: [-minX / width, -minY / height] }
}

export const SYMBOLS: Readonly<Record<MotifSymbolName, MotifSymbol>> = {
  corner: symbol('-12.5 -12.5 47.5 47.5', 'm', 'corner'),
  knot: symbol('-32 -12.5 64 25', 's', 'pair'),
  logo: symbol('-24 -12.5 48 25', 'xs', 'pair'),
  gem: symbol('-12.5 -12.5 25 25', null, 'core'),
  'knot-full': symbol('-35.5 -12.5 71 25', 'l', 'pair'),
}

/** favicon：#100e0c 圆角 4 的底方块，上叠 logo 符号（臂尖超出部分被 viewBox 裁掉） */
export const FAVICON = { viewBox: '-16 -16 32 32', background: '#100e0c', radius: 4 } as const
