// spec §4.3 对比度门禁用到的组件色值唯一出处（spec §5.5、§5.7、§5.8）。
// tokens.test.ts 与 component-css.test.ts 共用；不导入任何本地模块。

export const NAMEPLATE_VARIANTS = {
  base: {
    p: ['#31291d', '#211b14', '#16120d'],
    edge: '#6e5634',
    name: '#efe6d2',
    name2: '#bcae95',
  },
  unique: {
    p: ['#4a2512', '#2c1609', '#1a0c04'],
    edge: '#af6025',
    name: '#f27b2e',
    name2: '#e7a070',
  },
  gem: {
    p: ['#261f17', '#1b1611', '#12100c'],
    edge: '#1ba29b',
    name: '#1ba29b',
    name2: '#8cc5c1',
  },
  collapsed: {
    p: ['#31291d', '#211b14', '#16120d'],
    edge: '#6e5634',
    name: '#efe6d2',
    name2: '#bcae95',
  },
} as const

export const TAB_COLORS = {
  idleStops: ['#15181c'],
  selectedStops: ['#5c3d16', '#3a2810'],
  selectedText: '#fff8e1',
} as const

export const FORGE_COLORS = {
  text: '#fff8e1',
  midStops: ['#0f304d', '#164a75'],
} as const
