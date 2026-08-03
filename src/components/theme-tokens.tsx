import type { ReactNode } from "react";

export type ThemeTokens = {
  main: string;                          // 主体（背景/字体），如 style-6 含 paper-lines font-kai
  decorations?: ReactNode;               // 主题装饰 JSX（绝对定位，无交互）
  header: { eyebrow: ReactNode; eyebrowClass: string; title: ReactNode; titleClass: string; tagline?: ReactNode };
  sectionTitle: string;                  // 月历/周视图标题 h2
  weekdayHeader: string;                 // 周一~周日表头
  navButton: string;                     // 上月/今天/下月 等导航按钮
  card: string;                          // 当日日程白卡片
  button: { primary: string };           // "＋ 添加日程"（使用处拼 w-full）
  cell: { base: string; hover: string; num: string; plain: string; outside: string; today: string; selected: string;
          indicatorCap?: number;          // 事件指示器上限（默认 3）
          indicatorPills?: boolean;       // true = 用时间药丸而非空圆点
          indicatorArea?: string;         // 事件指示区容器类（默认 "mt-1.5 flex h-4 items-center justify-center gap-1"）
          selectedOnCell?: boolean;       // true = selected 高亮作用于整个格子按钮而非数字圈
          todayWins?: boolean };          // true = 今天样式优先于选中样式
  dot: string;                           // 事件数量圆点
  dotMore: string;                       // "+N" 文字
  todayMark: string;                     // 周视图列头"今"标记色
  dayList: { dateLabel: string; itemRow: string; checkbox: string; editButton: string;
             time: string; title: string; doneTitle: string; desc: string; delete: string; empty: string };
  dialog: { overlay: string; panel: string; title: string; inputLabel: string; input: string; cancel: string; save: string;
            decor?: ReactNode;           // 弹窗顶部装饰 JSX
            bodyClass?: string };        // 弹窗内容内边距
  viewTab: { active: string; inactive: string };
  weekView: { column: string; columnHighlight: string; columnHeader: string; addDay: string; eventRow: string };
  yearView: { monthCard: string; monthTitle: string; miniCell: string; miniDot: string };
  viewPanel?: string;      // 月历/周视图/年视图 section 的面板容器类（style-1 无 → 不填）
  contentClass?: string;   // 内容容器额外类（style-5 的 lg:pl-16）
  cellGridGap?: string;    // 月历网格间距类（默认 "gap-1.5"）
  dayListSpacing?: string; // 当日日程 ul 间距类（默认 "mt-4 space-y-3"）
  sidebar?: ReactNode;     // 固定定位的侧栏 JSX（style-5 的左侧品牌导航）
  dotColors?: string[];    // 月历事件数量点颜色轮换（style-6/7 有）
  itemColors?: string[];   // 当日日程条目左边框颜色轮换（style-6/7 有）
  itemDecor?: ReactNode;   // 日程条目内装饰 JSX（style-6 的纸胶带 span）
};

export const THEME_TOKENS: Record<number, ThemeTokens> = {
  // 主题 1：极简留白
  1: {
    main: "min-h-screen bg-[#fafafa]",
    header: {
      eyebrow: "MINIMAL SCHEDULE",
      eyebrowClass: "text-xs tracking-widest text-neutral-400",
      title: "极简日程",
      titleClass: "mt-2 text-2xl font-light tracking-wide text-neutral-900",
    },
    sectionTitle: "text-base text-neutral-900",
    weekdayHeader: "py-1 text-center text-xs text-neutral-400",
    navButton: "rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-neutral-400",
    card: "rounded-lg border border-neutral-200 bg-white p-5",
    button: { primary: "rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700" },
    cell: {
      base: "flex h-24 flex-col items-center rounded-lg pt-2 transition",
      hover: "hover:bg-neutral-100",
      num: "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm",
      plain: "text-neutral-900",
      outside: "text-neutral-300",
      today: "border-2 border-blue-600 text-neutral-900",
      selected: "bg-blue-600 text-white",
    },
    dot: "h-1.5 w-1.5 rounded-full bg-blue-600",
    dotMore: "text-[10px] text-blue-600",
    todayMark: "text-blue-600",
    dayList: {
      dateLabel: "text-sm text-neutral-500",
      itemRow: "group flex items-center gap-3 border-b border-neutral-100 pb-3 last:border-b-0 last:pb-0",
      checkbox: "accent-blue-600",
      editButton: "min-w-0 flex-1 text-left",
      time: "text-xs text-neutral-400 tabular-nums",
      title: "truncate text-sm text-neutral-900",
      doneTitle: "truncate text-sm text-neutral-400 line-through",
      desc: "truncate text-xs text-neutral-400",
      delete: "shrink-0 text-neutral-300 transition hover:text-red-500",
      empty: "mt-6 text-sm text-neutral-400",
    },
    dialog: {
      overlay: "fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm",
      panel: "w-full max-w-sm rounded-lg border border-neutral-200 bg-white shadow-sm",
      bodyClass: "p-6",
      title: "text-lg font-light text-neutral-900",
      inputLabel: "text-sm text-neutral-600",
      input: "mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none",
      cancel: "text-sm text-neutral-500 transition hover:text-neutral-900",
      save: "rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700",
    },
    viewTab: {
      active: "rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white",
      inactive: "rounded-full px-4 py-1.5 text-sm text-neutral-500 transition hover:bg-neutral-100",
    },
    weekView: {
      column: "flex min-h-44 flex-col rounded-lg border border-neutral-100 p-2",
      columnHighlight: "border-blue-200 bg-blue-50",
      columnHeader: "text-xs font-medium text-neutral-700 transition hover:text-blue-600",
      addDay: "text-xs text-neutral-400 transition hover:text-blue-600",
      eventRow: "flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-neutral-100",
    },
    yearView: {
      monthCard: "rounded-lg border border-neutral-100 p-3",
      monthTitle: "mb-1.5 text-sm font-medium text-neutral-700 transition hover:text-blue-600",
      miniCell: "relative flex aspect-square items-center justify-center rounded text-[10px] text-neutral-500 transition hover:bg-neutral-100",
      miniDot: "absolute bottom-0.5 h-1 w-1 rounded-full bg-blue-600",
    },
  },

  // 主题 2：玻璃拟态
  2: {
    main: "animate-gradient-move relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500",
    viewPanel: "rounded-2xl border border-white/30 bg-white/15 p-5 shadow-lg shadow-purple-900/10 backdrop-blur-xl",
    decorations: (
      <>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="animate-float-slow absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/20 blur-3xl" />
          <div className="animate-float-slow absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-white/20 blur-3xl [animation-delay:-3s]" />
          <div className="animate-float-slow absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-white/15 blur-3xl [animation-delay:-5s]" />
        </div>
      </>
    ),
    header: {
      eyebrow: "GLASS SCHEDULE",
      eyebrowClass: "text-xs tracking-widest text-white/60",
      title: "玻璃日程",
      titleClass: "mt-2 text-3xl font-semibold tracking-wide text-white drop-shadow-lg",
    },
    sectionTitle: "text-base text-white",
    weekdayHeader: "py-1 text-center text-xs text-white/70",
    navButton: "rounded-lg border border-white/40 px-3 py-1.5 text-sm text-white transition hover:bg-white/10",
    card: "rounded-2xl border border-white/30 bg-white/15 p-5 shadow-lg shadow-purple-900/10 backdrop-blur-xl",
    button: { primary: "rounded-lg bg-white px-4 py-2 text-sm font-semibold text-purple-700 transition hover:bg-white/90" },
    cell: {
      base: "flex h-24 flex-col items-center rounded-xl pt-2 transition",
      hover: "hover:bg-white/10",
      num: "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm",
      plain: "text-white",
      outside: "text-white/30",
      today: "ring-2 ring-white/90",
      selected: "bg-white/30 hover:bg-white/40",
      indicatorPills: true,
      indicatorCap: 2,
      indicatorArea: "mt-1.5 flex h-4 max-w-full items-center justify-center gap-1 overflow-hidden px-1",
      selectedOnCell: true,
    },
    dot: "truncate rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] text-purple-900",
    dotMore: "shrink-0 text-[10px] text-white",
    todayMark: "text-white",
    dayList: {
      dateLabel: "text-sm text-white/70",
      itemRow: "group flex items-center gap-3 border-b border-white/15 pb-3 last:border-b-0 last:pb-0",
      checkbox: "accent-purple-200",
      editButton: "min-w-0 flex-1 text-left",
      time: "rounded-full bg-white/60 px-2 py-0.5 text-purple-900",
      title: "truncate text-sm text-white",
      doneTitle: "truncate text-sm text-white/70 line-through",
      desc: "truncate text-xs text-white/70",
      delete: "shrink-0 text-white/60 transition hover:text-white",
      empty: "mt-6 text-sm text-white/60",
    },
    dialog: {
      overlay: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm",
      panel: "w-full max-w-sm rounded-2xl border border-white/30 bg-white/20 shadow-lg shadow-purple-900/20 backdrop-blur-xl",
      bodyClass: "p-6",
      title: "text-lg font-semibold text-white",
      inputLabel: "text-sm text-white/70",
      input: "mt-1 w-full rounded-lg border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 focus:ring-2 focus:ring-white/60 focus:outline-none",
      cancel: "text-sm text-white/70 transition hover:text-white",
      save: "rounded-lg bg-white px-4 py-2 text-sm font-semibold text-purple-700 transition hover:bg-white/90",
    },
    viewTab: {
      active: "rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-purple-700",
      inactive: "rounded-full px-4 py-1.5 text-sm text-white/70 transition hover:bg-white/10",
    },
    weekView: {
      column: "flex min-h-44 flex-col rounded-2xl border border-white/30 p-2",
      columnHighlight: "border-white/60 bg-white/30",
      columnHeader: "text-xs font-medium text-white/80 transition hover:text-white",
      addDay: "text-xs text-white/60 transition hover:text-white",
      eventRow: "flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-white/10",
    },
    yearView: {
      monthCard: "rounded-2xl border border-white/30 bg-white/15 p-3 shadow-lg shadow-purple-900/10 backdrop-blur-xl",
      monthTitle: "mb-1.5 text-sm font-medium text-white/80 transition hover:text-white",
      miniCell: "relative flex aspect-square items-center justify-center rounded text-[10px] text-white/60 transition hover:bg-white/10",
      miniDot: "absolute bottom-0.5 h-1 w-1 rounded-full bg-white/80",
    },
  },

  // 主题 5：商务专业
  5: {
    main: "min-h-screen bg-[#f5f7fa]",
    viewPanel: "rounded-md border border-neutral-200 bg-white p-5 shadow-sm",
    contentClass: "lg:pl-16",
    cellGridGap: "",
    dayListSpacing: "mt-5 space-y-4",
    sidebar: (
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-16 flex-col items-center bg-[#1e3a5f] py-6 lg:flex">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-[#c9a961] font-serif text-lg font-bold text-white">
          S
        </div>
        <div className="mt-8 flex flex-col items-center gap-8">
          <span className="text-[10px] tracking-widest text-[#c9a961]">日历</span>
          <span className="text-[10px] tracking-widest text-[#8fa3bd]">设置</span>
          <span className="text-[10px] tracking-widest text-[#8fa3bd]">报表</span>
        </div>
      </aside>
    ),
    header: {
      eyebrow: <>SCHEDULE · {new Date().getFullYear()}</>,
      eyebrowClass: "text-[10px] font-semibold uppercase tracking-widest text-[#c9a961]",
      title: "商务日程",
      titleClass: "mt-2 font-serif text-2xl font-semibold tracking-wide text-[#1e3a5f]",
    },
    sectionTitle: "text-base text-neutral-800",
    weekdayHeader: "border-b border-neutral-100 py-1.5 text-center text-xs font-semibold text-neutral-500",
    navButton: "rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-[#1e3a5f] hover:text-[#1e3a5f]",
    card: "rounded-md border border-neutral-200 bg-white p-5 shadow-sm",
    button: { primary: "rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16304f]" },
    cell: {
      base: "flex h-24 flex-col items-center rounded border-b border-neutral-100 pt-2 transition",
      hover: "hover:bg-[#f5f7fa]",
      num: "inline-block rounded-sm px-1.5 text-xs font-medium",
      plain: "text-neutral-800",
      outside: "text-neutral-300",
      today: "bg-[#c9a961] text-[#1e3a5f]",
      selected: "bg-[#1e3a5f] text-white",
    },
    dot: "h-1 w-4 rounded-full bg-[#1e3a5f]",
    dotMore: "text-[10px] text-[#1e3a5f]",
    todayMark: "text-[#c9a961]",
    dayList: {
      dateLabel: "text-sm text-neutral-500",
      itemRow: "flex items-start gap-3 border-l-2 border-[#c9a961] pl-3",
      checkbox: "mt-0.5 accent-[#1e3a5f]",
      editButton: "min-w-0 flex-1 text-left",
      time: "text-xs font-semibold text-[#1e3a5f] tabular-nums",
      title: "truncate text-sm font-medium text-neutral-800",
      doneTitle: "truncate text-sm font-medium text-neutral-400 line-through",
      desc: "mt-0.5 truncate text-xs text-neutral-400",
      delete: "shrink-0 text-neutral-400 transition hover:text-red-500",
      empty: "mt-6 text-sm text-neutral-500",
    },
    dialog: {
      overlay: "fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40",
      panel: "w-full max-w-sm rounded-md border-t-2 border-[#c9a961] bg-white shadow-lg",
      bodyClass: "p-6",
      title: "text-lg font-semibold text-[#1e3a5f]",
      inputLabel: "text-sm font-medium text-neutral-600",
      input: "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-300 focus:border-[#1e3a5f] focus:outline-none",
      cancel: "text-sm text-neutral-500 transition hover:text-neutral-700",
      save: "rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16304f]",
    },
    viewTab: {
      active: "rounded-full bg-[#1e3a5f] px-4 py-1.5 text-sm font-semibold text-white",
      inactive: "rounded-full px-4 py-1.5 text-sm text-neutral-500 transition hover:bg-[#f5f7fa] hover:text-[#1e3a5f]",
    },
    weekView: {
      column: "flex min-h-44 flex-col rounded-md border border-neutral-200 p-2",
      columnHighlight: "border-[#c9a961] bg-[#f5f7fa]",
      columnHeader: "text-xs font-medium text-neutral-600 transition hover:text-[#1e3a5f]",
      addDay: "text-xs text-neutral-400 transition hover:text-[#1e3a5f]",
      eventRow: "flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-[#f5f7fa]",
    },
    yearView: {
      monthCard: "rounded-md border border-neutral-200 bg-white p-3 shadow-sm",
      monthTitle: "mb-1.5 text-sm font-medium text-[#1e3a5f] transition hover:text-[#16304f]",
      miniCell: "relative flex aspect-square items-center justify-center rounded text-[10px] text-neutral-500 transition hover:bg-[#f5f7fa]",
      miniDot: "absolute bottom-0.5 h-1 w-1 rounded-full bg-[#1e3a5f]",
    },
  },

  // 主题 6：手账笔记本
  6: {
    main: "paper-lines font-kai relative min-h-screen overflow-hidden bg-[#fbf6e9] text-[#4a3f35]",
    viewPanel: "-rotate-[0.5deg] rounded-lg border border-[#e5dcc8] bg-[#fffdf5] p-5 shadow-sm transition",
    dayListSpacing: "mt-5 space-y-4",
    dotColors: ["#e05a5a", "#4a7bb5", "#e8c96a"],
    itemColors: ["#e05a5a", "#4a7bb5", "#e8c96a"],
    itemDecor: (
      <span aria-hidden className="absolute -top-1.5 left-2 h-3 w-10 rotate-2 rounded-sm bg-[#e8c96a]/70" />
    ),
    decorations: (
      <>
        <div
          aria-hidden
          className="pointer-events-none absolute left-8 top-6 h-8 w-40 -rotate-3 rounded-sm bg-[#e8c96a]/70 shadow-sm"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-10 top-10 h-8 w-32 rotate-3 rounded-sm bg-[#ffb3b3]/60 shadow-sm"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-14 h-8 w-28 -rotate-2 rounded-sm bg-[#a8d8ea]/60 shadow-sm"
        />
      </>
    ),
    header: {
      eyebrow: "My Daily Journal",
      eyebrowClass: "font-hand text-sm text-[#b3947c]",
      title: "手账日程",
      titleClass: "font-hand -rotate-2 text-4xl text-[#4a3f35]",
      tagline: <span className="font-hand rotate-3 text-lg text-[#e05a5a]">今天也要加油呀 ✎</span>,
    },
    sectionTitle: "font-hand text-lg text-[#4a3f35]",
    weekdayHeader: "font-kai py-1 text-center text-xs text-neutral-500",
    navButton: "rounded-lg border border-[#d8cba8] px-3 py-1.5 font-kai text-[#4a3f35] transition hover:bg-[#f5edda]",
    card: "rotate-[0.5deg] rounded-lg border border-[#e5dcc8] bg-[#fffdf5] p-5 shadow-sm transition",
    button: { primary: "font-hand -rotate-1 rounded-lg bg-[#e05a5a] px-5 py-2 text-white shadow-md transition hover:rotate-0" },
    cell: {
      base: "flex h-24 flex-col items-center rounded-md border border-dashed border-[#dfd3b8] pt-2 transition",
      hover: "hover:bg-[#f5edda]",
      num: "font-kai inline-flex h-7 w-7 items-center justify-center rounded-full",
      plain: "text-[#4a3f35]",
      outside: "text-neutral-500",
      today: "ring-2 ring-[#e05a5a] text-[#4a3f35]",
      selected: "bg-[#dbe9f5] text-[#4a3f35]",
    },
    dot: "h-1.5 w-1.5 rounded-full bg-[#e05a5a]",
    dotMore: "text-[10px] text-[#4a7bb5]",
    todayMark: "text-[#e05a5a]",
    dayList: {
      dateLabel: "font-kai text-sm text-[#4a3f35]",
      itemRow: "flex items-center gap-3 relative rounded-lg border-l-4 bg-[#fffdf5] p-3 shadow-sm",
      checkbox: "accent-[#e05a5a]",
      editButton: "min-w-0 flex-1 text-left",
      time: "font-kai text-xs text-[#4a7bb5] tabular-nums",
      title: "font-kai truncate text-sm text-[#4a3f35]",
      doneTitle: "font-kai line-through decoration-[#e05a5a] decoration-2 truncate text-sm text-[#4a3f35]",
      desc: "font-kai truncate text-xs text-neutral-500",
      delete: "shrink-0 text-neutral-500 transition hover:text-red-500",
      empty: "font-kai mt-6 text-sm text-neutral-500",
    },
    dialog: {
      overlay: "fixed inset-0 z-50 flex items-center justify-center bg-[#4a3f35]/30",
      panel: "relative -rotate-[0.5deg] w-full max-w-sm rounded-lg border border-[#e5dcc8] bg-[#fffdf5] shadow-xl",
      bodyClass: "p-6",
      decor: (
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 h-4 w-24 -translate-x-1/2 rotate-1 rounded-sm bg-[#e8c96a]/70"
        />
      ),
      title: "font-hand text-lg text-[#4a3f35]",
      inputLabel: "font-kai text-sm text-[#8a7a66]",
      input: "font-kai mt-1 w-full rounded-lg border-2 border-dashed border-[#d8cba8] bg-white/60 px-3 py-2 text-[#4a3f35] focus:border-[#4a7bb5] focus:outline-none",
      cancel: "font-kai text-sm text-[#8a7a66] transition hover:text-[#4a3f35]",
      save: "font-hand rounded-lg bg-[#4a7bb5] px-4 py-2 text-white",
    },
    viewTab: {
      active: "rounded-full bg-[#4a3f35] px-4 py-1.5 font-kai text-sm text-white",
      inactive: "rounded-full px-4 py-1.5 font-kai text-sm text-[#8a7a66] transition hover:bg-[#f5edda]",
    },
    weekView: {
      column: "flex min-h-44 flex-col rounded-lg border border-dashed border-[#d8cba8] p-2",
      columnHighlight: "border-[#4a7bb5] bg-[#dbe9f5]",
      columnHeader: "font-kai text-xs font-medium text-[#4a3f35] transition hover:text-[#4a7bb5]",
      addDay: "text-xs text-neutral-500 transition hover:text-[#4a7bb5]",
      eventRow: "flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-[#f5edda]",
    },
    yearView: {
      monthCard: "rounded-lg border border-[#e5dcc8] bg-[#fffdf5] p-3 shadow-sm",
      monthTitle: "mb-1.5 font-hand text-sm text-[#4a3f35] transition hover:text-[#4a7bb5]",
      miniCell: "relative flex aspect-square items-center justify-center rounded font-kai text-[10px] text-neutral-500 transition hover:bg-[#f5edda]",
      miniDot: "absolute bottom-0.5 h-1 w-1 rounded-full bg-[#e05a5a]",
    },
  },

  // 主题 7：现代渐变
  7: {
    main: "relative min-h-screen overflow-hidden bg-white",
    viewPanel: "rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-xl shadow-neutral-200/50 backdrop-blur",
    dotColors: ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9"],
    itemColors: ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981"],
    decorations: (
      <>
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 opacity-30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-gradient-to-br from-amber-300 to-orange-400 opacity-30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-gradient-to-br from-teal-300 to-emerald-400 opacity-25 blur-3xl"
        />
      </>
    ),
    header: {
      eyebrow: "Modern Daily Planner",
      eyebrowClass: "text-xs font-bold uppercase tracking-[0.3em] text-neutral-400",
      title: "渐变日程",
      titleClass: "animate-gradient-move mt-3 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-5xl font-black tracking-tight text-transparent",
    },
    sectionTitle: "text-base font-bold text-neutral-900",
    weekdayHeader: "py-1 text-center text-xs font-bold text-neutral-400",
    navButton: "rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium transition hover:border-violet-300 hover:text-violet-600",
    card: "rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-xl shadow-neutral-200/50 backdrop-blur",
    button: { primary: "rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2.5 font-bold text-white shadow-lg shadow-fuchsia-200 transition hover:opacity-90" },
    cell: {
      base: "flex h-24 flex-col items-center rounded-2xl pt-2 transition",
      hover: "hover:scale-[1.02] hover:bg-white",
      num: "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
      plain: "text-neutral-900",
      outside: "text-neutral-300",
      today: "animate-gradient-move bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-200",
      selected: "bg-violet-50 text-neutral-900 ring-2 ring-violet-400",
      todayWins: true,
    },
    dot: "h-2 w-2 rounded-full bg-[#8b5cf6]",
    dotMore: "text-[10px] font-bold text-violet-500",
    todayMark: "text-violet-500",
    dayList: {
      dateLabel: "text-sm font-semibold text-neutral-500",
      itemRow: "flex items-center gap-3 rounded-xl border-l-4 bg-white p-3 shadow-sm",
      checkbox: "accent-violet-500",
      editButton: "min-w-0 flex-1 text-left",
      time: "text-xs font-bold text-neutral-400 tabular-nums",
      title: "truncate text-sm font-bold text-neutral-900",
      doneTitle: "truncate text-sm font-bold text-neutral-400 line-through",
      desc: "truncate text-xs text-neutral-400",
      delete: "shrink-0 text-neutral-300 transition hover:text-red-500",
      empty: "mt-6 text-sm text-neutral-400",
    },
    dialog: {
      overlay: "fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 backdrop-blur-sm",
      panel: "w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl",
      bodyClass: "p-6",
      decor: (
        <div
          aria-hidden
          className="h-1.5 w-full rounded-t-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400"
        />
      ),
      title: "text-lg font-bold text-neutral-900",
      inputLabel: "text-sm font-semibold text-neutral-600",
      input: "mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-violet-400",
      cancel: "text-sm font-semibold text-neutral-500 transition hover:text-neutral-700",
      save: "rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-200 transition hover:opacity-90",
    },
    viewTab: {
      active: "rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-1.5 text-sm font-bold text-white shadow-lg shadow-fuchsia-200",
      inactive: "rounded-full px-4 py-1.5 text-sm font-medium text-neutral-500 transition hover:bg-violet-50 hover:text-violet-600",
    },
    weekView: {
      column: "flex min-h-44 flex-col rounded-2xl border border-neutral-200 p-2",
      columnHighlight: "border-violet-300 bg-violet-50",
      columnHeader: "text-xs font-semibold text-neutral-700 transition hover:text-violet-600",
      addDay: "text-xs text-neutral-400 transition hover:text-violet-600",
      eventRow: "flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-violet-50",
    },
    yearView: {
      monthCard: "rounded-2xl border border-neutral-200 bg-white/80 p-3 shadow-sm backdrop-blur",
      monthTitle: "mb-1.5 text-sm font-bold text-neutral-800 transition hover:text-violet-600",
      miniCell: "relative flex aspect-square items-center justify-center rounded text-[10px] font-medium text-neutral-500 transition hover:bg-violet-50",
      miniDot: "absolute bottom-0.5 h-1 w-1 rounded-full bg-violet-500",
    },
  },
};
