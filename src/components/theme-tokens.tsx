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
  weekView: {
    columnHighlight: string; columnHeader: string; addDay: string;
    columnHover: string;     // 悬停列背景淡色（鼠标位置对应日期）
    hourLabelActive: string; // 悬停时对应小时刻度高亮
    timeline: string;        // 时间轴整体容器（边框等）
    hourLabel: string;       // 纵轴小时刻度文字
    gridLine: string;        // 小时分割线
    eventBlock: string;      // 时间轴上按时间定位的事件块
    dragSelect: string;      // 拖选时间段高亮
    allDayItem: string;      // 全天事件胶囊
    foldBand: string;        // 凌晨折叠条（配合 absolute inset-x-0 z-10 使用）
    eventSelected: string;   // 选中日程的描边
    eventEdit: string;       // 选中后弹出在光标旁的编辑按钮（配合 left/top 内联样式）
    dragTip: string;         // 拖选/挪动时的时间气泡（配合 left/top 内联样式）
    cursorLine: string;      // 悬停光标横线（absolute inset-x-0，top 内联）
    cursorLabel: string;     // 悬停时刻标签（absolute，top 内联）
  };
  yearView: { monthCard: string; monthTitle: string; miniCell: string; miniDot: string };
  viewPanel?: string;      // 月历/周视图/年视图 section 的面板容器类（style-1 无 → 不填）
  contentClass?: string;   // 内容容器额外类（当前无主题使用）
  cellGridGap?: string;    // 月历网格间距类（默认 "gap-1.5"）
  dayListSpacing?: string; // 当日日程 ul 间距类（默认 "mt-4 space-y-3"）
  sidebar?: ReactNode;     // 固定定位的侧栏 JSX（当前无主题使用）
  dotColors?: string[];    // 月历事件数量点颜色轮换（style-6 有）
  itemColors?: string[];   // 当日日程条目左边框颜色轮换（style-6 有）
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
      editButton: "min-w-0 flex-1 text-left transition",
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
      active: "rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white transition",
      inactive: "rounded-full px-4 py-1.5 text-sm text-neutral-500 transition hover:bg-neutral-100",
    },
    weekView: {
      columnHighlight: "border-blue-200 bg-blue-50",
      columnHover: "bg-neutral-100/70",
      hourLabelActive: "font-semibold text-blue-600",
      columnHeader: "text-xs font-medium text-neutral-700 transition hover:text-blue-600",
      addDay: "text-xs text-neutral-400 transition hover:text-blue-600",
      timeline: "rounded-lg border border-neutral-100 bg-white",
      hourLabel: "absolute right-2 -translate-y-1/2 text-[10px] text-neutral-400 tabular-nums",
      gridLine: "absolute inset-x-0 border-t border-neutral-100",
      eventBlock: "absolute inset-x-0.5 overflow-hidden rounded-md bg-blue-600 px-1.5 py-0.5 text-left text-white shadow-sm transition hover:bg-blue-700",
      dragSelect: "pointer-events-none absolute inset-x-0.5 rounded-md bg-blue-600/25",
      allDayItem: "block w-full truncate rounded bg-neutral-100 px-1.5 py-0.5 text-left text-[10px] text-neutral-700 transition hover:bg-neutral-200",
      foldBand: "flex items-center justify-center gap-2 border-y border-dashed border-neutral-200/80 bg-white/60 text-[10px] text-neutral-400 transition hover:bg-white/90 hover:text-neutral-600",
      eventSelected: "ring-2 ring-blue-700 bg-blue-100 text-blue-900!",
      eventEdit: "absolute z-30 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white shadow-md transition hover:bg-neutral-700",
      dragTip: "pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-full bg-white px-3 py-1 text-[11px] font-medium text-neutral-900 shadow-lg ring-1 ring-neutral-200",
      cursorLine: "pointer-events-none absolute inset-x-0 border-t border-blue-600/50",
      cursorLabel: "pointer-events-none absolute left-1 -translate-y-1/2 whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-neutral-900 shadow-sm ring-1 ring-neutral-200",
    },
    yearView: {
      monthCard: "rounded-lg border border-neutral-100 p-3",
      monthTitle: "mb-1.5 text-sm font-medium text-neutral-700 transition hover:text-blue-600",
      miniCell: "relative flex aspect-square items-center justify-center rounded text-[10px] text-neutral-500 transition hover:bg-neutral-100",
      miniDot: "absolute bottom-0.5 h-1 w-1 rounded-full bg-blue-600",
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
      editButton: "min-w-0 flex-1 text-left transition",
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
      save: "font-hand rounded-lg bg-[#4a7bb5] px-4 py-2 text-white transition",
    },
    viewTab: {
      active: "rounded-full bg-[#4a3f35] px-4 py-1.5 font-kai text-sm text-white transition",
      inactive: "rounded-full px-4 py-1.5 font-kai text-sm text-[#8a7a66] transition hover:bg-[#f5edda]",
    },
    weekView: {
      columnHighlight: "border-[#4a7bb5] bg-[#dbe9f5]",
      columnHover: "bg-[#f5edda]/70",
      hourLabelActive: "font-bold text-[#4a7bb5]",
      columnHeader: "font-kai text-xs font-medium text-[#4a3f35] transition hover:text-[#4a7bb5]",
      addDay: "text-xs text-neutral-500 transition hover:text-[#4a7bb5]",
      timeline: "rounded-lg border border-[#e5dcc8] bg-[#fffdf5]",
      hourLabel: "font-kai absolute right-2 -translate-y-1/2 text-[10px] text-neutral-500",
      gridLine: "absolute inset-x-0 border-t border-dashed border-[#e5dcc8]",
      eventBlock: "absolute inset-x-0.5 overflow-hidden rounded-md bg-[#e05a5a] px-1.5 py-0.5 text-left text-white shadow-sm transition hover:brightness-105",
      dragSelect: "pointer-events-none absolute inset-x-0.5 rounded-md bg-[#4a7bb5]/30",
      allDayItem: "font-kai block w-full truncate rounded bg-[#f5edda] px-1.5 py-0.5 text-left text-[10px] text-[#4a3f35] transition hover:bg-[#e9dcc0]",
      foldBand: "font-kai flex items-center justify-center gap-2 border-y border-dashed border-[#e5dcc8]/70 bg-[#fffdf5]/50 text-[10px] text-[#b3947c] transition hover:bg-[#fffdf5]/90 hover:text-[#4a3f35]",
      eventSelected: "ring-2 ring-[#4a7bb5] bg-[#f5edda] text-[#4a3f35]!",
      eventEdit: "font-kai absolute z-30 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md bg-[#4a3f35] px-2 py-1 text-[11px] text-[#fffdf5] shadow-md transition hover:bg-[#5a4f42]",
      dragTip: "font-kai pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-full bg-[#4a3f35]/90 px-3 py-1 text-[11px] text-[#fffdf5] shadow-lg ring-1 ring-[#e5dcc8]",
      cursorLine: "pointer-events-none absolute inset-x-0 border-t border-[#4a7bb5]/60",
      cursorLabel: "font-kai pointer-events-none absolute left-1 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#fffdf5] px-1.5 py-0.5 text-[10px] text-[#4a3f35] shadow-sm ring-1 ring-[#e5dcc8]",
    },
    yearView: {
      monthCard: "rounded-lg border border-[#e5dcc8] bg-[#fffdf5] p-3 shadow-sm",
      monthTitle: "mb-1.5 font-hand text-sm text-[#4a3f35] transition hover:text-[#4a7bb5]",
      miniCell: "relative flex aspect-square items-center justify-center rounded font-kai text-[10px] text-neutral-500 transition hover:bg-[#f5edda]",
      miniDot: "absolute bottom-0.5 h-1 w-1 rounded-full bg-[#e05a5a]",
    },
  },

};
