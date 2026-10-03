// 内联 SVG 图标集：零请求、零依赖。几何按 Lucide 规格（24 viewBox、stroke 1.75、圆头圆角），
// 全部用 <path> 表达（圆和矩形也转成 path），渲染逻辑因此只有一个分支。
// 颜色一律 currentColor，由使用处的 color 决定；尺寸由 size 决定，不写死。

// 零引用纪律（第一期 M-5）：这 14 个名字全部有调用方，多一个都不留（页头 logo 改用 Motif 后删去 brand；
// arrow-down 一直没有调用方，M3 删去；二期扩展介绍页去掉说明行后删去 info；search 由首页对照带与扩展介绍页“确认生效”的搜索框示意使用；arrow-right 是首页两个入口按钮的去向箭头，external 是扩展介绍页“打开 CoE Beta”的外链箭头，二期验收时替换原先的 Unicode 字形）。Icon.test.tsx 只按 <Icon name> 里的字面量核对，
// 所以调用一律写成 <Icon name="…"> 或 name={…} 里的字符串字面量，不经变量转手。
export type IconName =
  | 'upload'
  | 'drop'
  | 'download'
  | 'close'
  | 'check'
  | 'warning'
  | 'refresh'
  | 'locate'
  | 'lock'
  | 'chevron-down'
  | 'filter'
  | 'search'
  | 'arrow-right'
  | 'external'

const PATHS: Record<IconName, readonly string[]> = {
  // 上传：箭头朝上进托盘（拖放区静止态）
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
  // 松手：箭头朝下进托盘（拖放区 drag-over 态，图标切换 = 非颜色冗余反馈）
  drop: ['M12 3v10', 'm8 9 4 4 4-4', 'M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'],
  download: ['M12 3v12', 'm7 11 5 5 5-5', 'M4 20h16'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  check: ['M20 6 9 17l-5-5'],
  warning: ['M12 4 2.5 20h19z', 'M12 10v4', 'M12 17h.01'],
  refresh: ['M20 12a8 8 0 1 1-2.3-5.6', 'M20 4v4h-4'],
  // 定位：向右的角标，跟在「定位」文字后面
  locate: ['m9 6 6 6-6 6'],
  lock: [
    'M6 10h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z',
    'M8 10V7a4 4 0 0 1 8 0v3',
  ],
  // 折叠指示：拖放区「或粘贴内容 ⌄」与 中小屏侧栏抽屉共用，展开时由 CSS 旋转 180°
  'chevron-down': ['m6 9 6 6 6-6'],
  // 漏斗简化成三条递减的横线：24px 下画真漏斗会糊成一团
  filter: ['M3 6h18', 'M7 12h10', 'M10 18h4'],
  // 放大镜：圆用 path 画（M19 11 起笔的两段半圆弧），柄朝右下
  search: ['M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0', 'm21 21-4.3-4.3'],
  // 去向：横杆加右开口的箭头（首页入口按钮）
  'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
  // 外链：朝右上的箭头（与样稿里的“↗”同形，链接会离开本站）
  external: ['M7 17 17 7', 'M8 7h9v9'],
}

export const ICON_NAMES: readonly IconName[] = Object.keys(PATHS) as IconName[]

export interface IconProps {
  name: IconName
  /** 边长 px，默认 16 */
  size?: number
  /** 追加到 `icon` 之后的类名 */
  className?: string
  /** 给了就是 role="img" + aria-label；不给就是 aria-hidden 的纯装饰 */
  title?: string
}

export function Icon({ name, size = 16, className, title }: IconProps) {
  return (
    <svg
      className={className === undefined ? 'icon' : `icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title === undefined ? undefined : 'img'}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
