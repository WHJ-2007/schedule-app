"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  WEEKDAY_NAMES,
  toDateKey,
  isSameDay,
  formatEventTime,
  parseTimeToMinutes,
  minutesToTime,
  addDays,
  parseDateKey,
} from "@/lib/date";
import type { ScheduleEvent } from "@/lib/events";
import { isInstanceDone, isInstanceExpired } from "@/lib/events";
import type { EventMovePatch } from "@/lib/use-events";
import { EVENT_COLORS } from "@/lib/colors";
import type { ThemeTokens } from "./theme-tokens";

const HOUR_PX = 30; // 每小时高度（像素）：一屏能放下所有时间
const SNAP_MIN = 30; // 拖选初始占位时长（未移动时选区的最小显示宽度）
const MOVE_SNAP_MIN = 5; // 事件挪动松手落点吸附单位：事件时间本身对齐到 5 分钟倍数（0/5/10 结尾）
const SELECT_SNAP_MIN = 5; // 拖选新建时间吸附单位：起止时间对齐到 5 分钟倍数
const MIN_DRAG_MIN = 5; // 拖选新建的最小时长：更短视为单击不误建
const GUTTER = 48; // 左侧刻度列宽度
const ALLDAY_ROW_H = 24; // 全天横条行高
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const FOLD_START = 0; // 折叠区起点 0:00（分钟）
const FOLD_END = 420; // 折叠区终点 7:00（分钟），折叠含 0:00–6:00 共七行
const FOLD_BAND_H = 40; // 折叠时条带高度
const EXPAND_BAND_H = 26; // 展开时条带高度

// 空白处拖拽：矩形选区（矩形内有日程 → 框选；无 → 批量新建）
type RegionState = {
  top: number; // 列顶视口 y 快照
  down: number; // 按下分钟（精确，不吸附）
  start: number; // 选区起止分钟（min/max）
  end: number;
  moved: boolean; // 指针是否实际移动（区分单击与拖选）
  startCol: number; // 按下列
  curCol: number; // 当前列
  colRects: DOMRect[]; // 7 列矩形快照
};

// 拖边缘调整大小：edge = 调整哪条边；curMin = 当前吸附分钟（预览用）
type ResizeState = {
  id: string;
  date: string; // 被拖实例的日期：重复日程多实例同 id，预览/提交只作用于被拖的那一个
  edge: "start" | "end";
  top: number; // 列顶视口 y
  downMin: number; // 按下分钟
  curMin: number; // 当前预览分钟（已吸附与钳制）
  colRects: DOMRect[];
};

// 全天事件横条：跨连续日期列（start/end 为周内列索引）；重复事件每实例一行
type AllDayBar = { e: ScheduleEvent; start: number; end: number; row: number };

// 全天横条横向拉伸：edge = 拉哪条边；cur = 当前指针列（预览用）
type AllDayDrag = {
  id: string;
  start: number;
  end: number;
  edge: "start" | "end";
  cur: number;
  colRects: DOMRect[];
};

// 时间块横向拖宽：非重复事件拖左右边界 → 自动设每天重复（起点=左边界列，until=右边界列）；
// 重复事件拖第一个实例左边界 → 调重复开始日期、拖最后一个实例右边界 → 调截止日期（频率不变）
type HStretchDrag = {
  id: string;
  col: number; // 按下时的列
  cur: number; // 当前指针列（预览用）
  edge: "start" | "end"; // 拖的是哪条边（重复事件按边提交开始/截止）
  colRects: DOMRect[];
};

// 事件整体挪动：相对按下位置的日/分钟偏移
type MoveState = {
  pressId: string; // 按下的事件 id（单击未移动时用于打开编辑面板）
  pressKey: string; // 被按实例身份「id:原日期」：重复事件同 id 多实例，只移动被按的那个
  top: number;
  downCol: number;
  downMin: number;
  dx: number; // 日偏移（钳制在周内）
  dy: number; // 分钟偏移（已吸附，钳制在一天内）
  dxMin: number;
  dxMax: number;
  dyMin: number;
  dyMax: number;
  colW: number;
  colRects: DOMRect[];
};

// 实例身份键：重复日程多实例同 id，用「id + 原日期」区分；_src 为拖动预览里变换前的日期
type LayoutEvent = ScheduleEvent & { _src?: string };
const posKey = (e: LayoutEvent) => `${e.id}:${e._src ?? e.date}`;

// 同一时段重叠事件并排分列（Google 日历风格）：链式重叠归入同一簇，
// 簇内按起点贪心分轨道，簇内全部事件宽度 = 100/簇内最大并发轨道数
function layoutColumns(list: LayoutEvent[]): Map<string, { track: number; tracks: number }> {
  const sorted = [...list].sort((a, b) => {
    const as = parseTimeToMinutes(a.time);
    const bs = parseTimeToMinutes(b.time);
    if (as !== bs) return as - bs;
    const ae = a.endTime ? parseTimeToMinutes(a.endTime) : as + 60;
    const be = b.endTime ? parseTimeToMinutes(b.endTime) : bs + 60;
    return be - ae; // 同起点时长长的靠前，占用左侧轨道
  });
  const starts = sorted.map((e) => parseTimeToMinutes(e.time));
  const ends = sorted.map((e, i) => (e.endTime ? parseTimeToMinutes(e.endTime) : starts[i] + 60));
  // 并查集式分簇：事件 i 与任一更早的 j 重叠即同簇（重叠沿链传递）
  const cluster = new Array<number>(sorted.length).fill(-1);
  let cid = 0;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = 0; j < i; j++) {
      if (starts[i] < ends[j] && starts[j] < ends[i]) {
        if (cluster[i] === -1) cluster[i] = cluster[j];
        else if (cluster[i] !== cluster[j]) {
          const old = cluster[j];
          for (let k = 0; k < i; k++) if (cluster[k] === old) cluster[k] = cluster[i];
        }
      }
    }
    if (cluster[i] === -1) cluster[i] = cid++;
  }
  const groups = new Map<number, number[]>();
  sorted.forEach((_, i) => {
    const arr = groups.get(cluster[i]) ?? [];
    arr.push(i);
    groups.set(cluster[i], arr);
  });
  const result = new Map<string, { track: number; tracks: number }>();
  for (const idxs of groups.values()) {
    const endsByTrack: number[] = [];
    const trackOf = new Map<number, number>();
    let max = 1;
    for (const i of idxs) {
      let track = endsByTrack.findIndex((t) => t <= starts[i]);
      if (track === -1) {
        track = endsByTrack.length;
        endsByTrack.push(starts[i]);
      }
      endsByTrack[track] = ends[i];
      trackOf.set(i, track);
      max = Math.max(max, endsByTrack.length);
    }
    for (const i of idxs) result.set(posKey(sorted[i]), { track: trackOf.get(i)!, tracks: max });
  }
  return result;
}

export default function WeekTimeline({
  tokens,
  dates,
  eventsByDay,
  anchorKey,
  today,
  onJumpToMonth,
  onSelectDate,
  selectedDate,
  onAddDay,
  onEdit,
  onToggleDone,
  onDelete,
  onMoveAll,
  onBatchColor,
  onSelectionChange,
  onPostpone,
  onMarkDone,
  onBatchMarkDone,
  onBatchUnmark,
  onEndEarly,
  onStretch,
  onStretchRepeat,
  onCopy,
  cols = 7,
  rootClass,
  scrollClass,
  scrollMaxHeight = "calc(100vh - 300px)",
  zoom = 1,
  onZoomChange,
}: {
  tokens: ThemeTokens;
  dates: Date[];
  eventsByDay: ScheduleEvent[][];
  anchorKey: string;
  today: Date;
  onJumpToMonth: (d: Date) => void;
  onSelectDate?: (dateKey: string) => void; // 单击列头选中该天（浅蓝竖条跟随）
  selectedDate?: string; // 选中日 key：该列显示浅蓝竖条高亮
  onAddDay: (dates: string[], time?: string, endTime?: string) => void;
  onEdit: (e: ScheduleEvent) => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveAll: (patches: EventMovePatch[]) => void;
  onBatchColor?: (ids: string[], color: string) => void; // 批量设色（"" = 清除为默认）
  onSelectionChange?: (ids: string[]) => void; // 选中组变化上报（父层用于 Delete 键删除与面板联动）
  onPostpone: (e: ScheduleEvent, dayKey: string) => void; // 菜单「标记为未完成」：取消该实例完成标记（重复日程只作用于右键实例）
  onMarkDone: (id: string, dayKey: string) => void; // 菜单「标记为已完成」：已过期未完成的日程标记为已完成（重复日程只作用于右键实例），计划时间不变
  onBatchMarkDone?: (ids: string[]) => void; // 多选右键「批量标记为已完成」：作用于全部选中日程（含重复日程全部实例）
  onBatchUnmark?: (ids: string[]) => void; // 多选右键「批量标记为未完成」
  onEndEarly: (id: string, dayKey: string) => void; // 菜单「提前结束」：未结束日程只标记该实例完成，计划时间不变
  onStretch: (id: string, date: string, until: string) => void; // 横向拖宽：事件改为每天重复，起点 date、截止 until（时间不变）
  onStretchRepeat: (id: string, edge: "start" | "end", date: string) => void; // 重复日程拖边界：左边界改重复开始、右边界改截止日期（频率不变）
  onCopy: (e: ScheduleEvent) => void; // 菜单「复制」：复制被右击的实例（同天时间 +1 小时）
  cols?: number; // 列数：周视图 7 列，月视图当日面板 1 列
  rootClass?: string; // 追加到根容器 className（如 flex-1 min-h-0 供父 flex 撑满）
  zoom?: number; // 时间轴缩放倍率（1 = 每小时 30px），0.5–3
  onZoomChange?: (z: number) => void; // 缩放请求（Ctrl+滚轮）上报父层
  scrollClass?: string; // 追加到滚动区 className（如 flex-1 min-h-0 供父 flex 撑满）
  scrollMaxHeight?: string; // 滚动区最大高度；传 "none" 由父容器决定
}) {
  const [drag, setDrag] = useState<RegionState | null>(null);
  const [move, setMove] = useState<MoveState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [allDayDrag, setAllDayDrag] = useState<AllDayDrag | null>(null);
  const [hStretch, setHStretch] = useState<HStretchDrag | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 点击日程弹出的操作菜单：鼠标坐标 + 目标日程（null = 关闭）
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; e: ScheduleEvent; day: string } | null>(null);
  const openCtxMenu = (x: number, y: number, e: ScheduleEvent, day: string) => setCtxMenu({ x, y, e, day });
  // 菜单打开期间：点外部/右键空白处关闭、按任意键关闭（块上的右键已 stopPropagation，不会误关再弹）
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("contextmenu", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("contextmenu", close);
      document.removeEventListener("keydown", close);
    };
  }, [ctxMenu]);
  const [folded, setFolded] = useState(true); // 默认折叠凌晨 0:00–6:00
  // 悬停展开的短卡片：块高不足时标题被裁，hover 自动展开到完整标题高度（posKey 键，重复实例互不干扰）
  const [expanded, setExpanded] = useState<{ id: string; h: number } | null>(null);
  const titleRefs = useRef(new Map<string, HTMLSpanElement | null>());
  // 完成动画：从未完成 → 完成瞬间该实例块播放绿色光晕弹跳（1 秒后清除动画位）
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const doneMapRef = useRef(new Map<string, boolean>());
  useEffect(() => {
    const prev = doneMapRef.current;
    const next = new Map<string, boolean>();
    const newly: string[] = [];
    for (const e of eventsByDay.flat()) {
      if (!e.time) continue;
      next.set(posKey(e), !!e.done);
      if (prev.get(posKey(e)) === false && e.done) newly.push(posKey(e));
    }
    doneMapRef.current = next;
    if (newly.length === 0) return;
    setJustDone((s) => {
      const n = new Set(s);
      for (const k of newly) n.add(k);
      return n;
    });
    const t = setTimeout(() => {
      setJustDone((s) => {
        const n = new Set(s);
        for (const k of newly) n.delete(k);
        return n;
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [eventsByDay]);
  const [hover, setHover] = useState<{ col: number; min: number | null } | null>(null); // 悬停高亮：列 + 分钟
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null); // 拖拽时间气泡
  const [now, setNow] = useState(() => new Date()); // 当前时间：驱动现在线与进行中日程高亮
  const timelineRef = useRef<HTMLDivElement | null>(null);
  // 滚动条占位宽度：滚动区右侧滚动条压缩内部列，表头行同步留白避免列错位
  // 滚动条出现/消失（表单开关、内容增减）都会改变 clientWidth，用 ResizeObserver
  // 监听动态重测；jsdom 无 ResizeObserver 时退回仅 dates/folded 变化重测
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [sbWidth, setSbWidth] = useState(0);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const measure = () => {
      const w = scroller.offsetWidth - scroller.clientWidth;
      setSbWidth((prev) => (prev === w ? prev : w));
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(scroller);
      return () => ro.disconnect();
    }
    return;
  }, [dates, folded]);

  const hourPx = HOUR_PX * zoom; // 当前每小时像素高度（缩放倍率作用于全部 y 坐标）
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const hourPxRef = useRef(hourPx);
  hourPxRef.current = hourPx;
  // Ctrl+滚轮缩放：普通滚轮仍是滚动浏览；缩放围绕鼠标下的时刻锚点（缩放后该时刻保持在鼠标位置）
  const zoomAnchorRef = useRef<{ minute: number; mouseY: number } | null>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const base = zoomRef.current;
      const next = Math.min(3, Math.max(0.5, base + (e.deltaY < 0 ? 0.25 : -0.25)));
      if (next === base) return;
      const rect = scroller.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const contentY = scroller.scrollTop + mouseY;
      const hp = hourPxRef.current;
      const f = foldedRef.current;
      const bTop = f ? 0 : 7 * hp;
      const bH = f ? FOLD_BAND_H : EXPAND_BAND_H;
      const minute =
        contentY < bTop
          ? Math.round((contentY / hp) * 60)
          : contentY >= bTop + bH
            ? Math.round(((contentY - bTop - bH) / hp) * 60 + FOLD_END)
            : null; // 折叠条带内：无锚点
      zoomAnchorRef.current = minute == null ? null : { minute, mouseY };
      onZoomChangeRef.current?.(next);
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, []);
  // 缩放落地后把锚点时刻拉回鼠标位置（用缩放后的新 yOf）
  useLayoutEffect(() => {
    const a = zoomAnchorRef.current;
    const scroller = scrollRef.current;
    if (!a || !scroller) return;
    zoomAnchorRef.current = null;
    scroller.scrollTop = yOf(a.minute) - a.mouseY;
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // 拖拽/选中状态同步进 ref：window 监听只挂载一次，闭包只捕获首次渲染值，
  // 快速单击时 mouseup 也能被捕获（useEffect 被动绑定在真实浏览器是异步的）
  const dragRef = useRef<RegionState | null>(null);
  const moveRef = useRef<MoveState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const allDayDragRef = useRef<AllDayDrag | null>(null);
  const allDayLayerRef = useRef<HTMLDivElement | null>(null);
  const hStretchRef = useRef<HStretchDrag | null>(null);
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const onAddDayRef = useRef(onAddDay);
  onAddDayRef.current = onAddDay;
  const onMoveAllRef = useRef(onMoveAll);
  onMoveAllRef.current = onMoveAll;
  const onBatchColorRef = useRef(onBatchColor);
  onBatchColorRef.current = onBatchColor;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onPostponeRef = useRef(onPostpone);
  onPostponeRef.current = onPostpone;
  const onMarkDoneRef = useRef(onMarkDone);
  onMarkDoneRef.current = onMarkDone;
  const onBatchMarkDoneRef = useRef(onBatchMarkDone);
  onBatchMarkDoneRef.current = onBatchMarkDone;
  const onBatchUnmarkRef = useRef(onBatchUnmark);
  onBatchUnmarkRef.current = onBatchUnmark;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const onEndEarlyRef = useRef(onEndEarly);
  onEndEarlyRef.current = onEndEarly;
  const onStretchRef = useRef(onStretch);
  onStretchRef.current = onStretch;
  const onStretchRepeatRef = useRef(onStretchRepeat);
  onStretchRepeatRef.current = onStretchRepeat;
  const onCopyRef = useRef(onCopy);
  onCopyRef.current = onCopy;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onSelectDateRef = useRef(onSelectDate);
  onSelectDateRef.current = onSelectDate;
  // 拖动提交后抑制随后的 click：避免把事件拖到新时间后意外弹出编辑面板
  const justMovedRef = useRef(false);
  // 提交渲染时 transform 加入过渡列表：松手瞬间新 top 与 transform 同时过渡，
  // 否则 transform 骤降（不在列表里）会让块先跳回起点再滑向落点
  const settleRef = useRef(false);
  const foldedRef = useRef(folded);
  foldedRef.current = folded;
  const eventsRef = useRef(eventsByDay);
  eventsRef.current = eventsByDay;
  const weekKeys = dates.map(toDateKey);
  const todayKey = toDateKey(today);
  const weekKeysRef = useRef(weekKeys);
  weekKeysRef.current = weekKeys;

  // 选中组统一入口：本地 state + 上报父层
  // 内容守卫：同签名不上报也不 setState，避免「父重渲染 → 新 dates → effect 重跑」死循环
  // report=false：只清本地选中不上报（拖选新建时父层表单刚打开，上报空集会让父层误关表单）
  const lastReportedRef = useRef("");
  const applySelection = (ids: string[], report = true) => {
    const sig = ids.length + ":" + ids.join(",");
    if (sig === lastReportedRef.current) return;
    lastReportedRef.current = sig;
    setSelectedIds(ids);
    if (report) onSelectionChangeRef.current?.(ids);
  };

  // 翻周后选中项已离开可视范围：清空选中（按周内容判断：同周内切换选中日
  // 只换数组引用，不触发清空，否则父层看板会误以为取消选中而折叠）。
  // 单日看板（cols=1）日期切换由父层驱动，没有翻周概念，不参与清空
  const weekKeyStr = weekKeys.join(",");
  useEffect(() => {
    if (cols === 1) return;
    applySelection([]);
  }, [weekKeyStr, cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const bandTop = folded ? 0 : 6 * hourPx; // 条带 y：折叠时在顶部（0:00 起），展开时在 6:00 与 7:00 之间
  const bandH = folded ? FOLD_BAND_H : EXPAND_BAND_H;
  const dayHeight = (folded ? 18 : 24) * hourPx + bandH;

  // 分钟 → 可见 y 坐标；折叠时 1:00–6:59 收缩进条带（事件渲染前已过滤该区段）
  const yOf = (m: number) => {
    if (folded && m >= FOLD_START && m < FOLD_END) return bandTop + bandH;
    if (folded && m >= FOLD_END) return bandTop + bandH + ((m - FOLD_END) * hourPx) / 60;
    return (m * hourPx) / 60;
  };

  // 原始分钟（不吸附）：供光标横线、时刻标签、拖选新建与挪动基准使用；条带区域返回 null
  const rawMinAtY = (y: number) => {
    const f = foldedRef.current;
    const bTop = f ? 0 : 7 * hourPx;
    const bH = f ? FOLD_BAND_H : EXPAND_BAND_H;
    if (y < bTop) return Math.round((y / hourPx) * 60);
    if (y < bTop + bH) return null;
    return Math.round(((y - bTop - bH) / hourPx) * 60 + FOLD_END);
  };

  // 拖选新建时间吸附到 5 分钟倍数：按下与拖动的选区起止都对齐刻度
  const snapSelect = (m: number) => Math.round(m / SELECT_SNAP_MIN) * SELECT_SNAP_MIN;

  const hourTop = (h: number) => {
    if (h >= 7) return bandTop + bandH + (h - 7) * hourPx;
    return folded ? null : h * hourPx; // 折叠区内刻度（0:00–6:00）
  };

  const visibleHours = folded ? HOURS.slice(7) : HOURS;
  // 网格线按小时做 key：折叠切换时 top 变化走 transition，key 稳定才不重挂载
  const lineHours = HOURS.slice(1)
    .map((h) => ({ h, y: hourTop(h) }))
    .filter((x): x is { h: number; y: number } => x.y !== null);

  const foldCount = eventsByDay.reduce(
    (sum, day) =>
      sum +
      day.filter((e) => {
        if (!e.time) return false;
        const m = parseTimeToMinutes(e.time);
        return m < FOLD_END;
      }).length,
    0
  );

  // 全天横条：跨天事件（endDate）多日各有一个条目，合并为一条横跨列；
  // 重复事件每个实例独立成条（键 = id:日期），不合并
  const weekIdxMap = new Map<string, number>(weekKeys.map((k, i) => [k, i]));
  const mergedBars = new Map<string, Omit<AllDayBar, "row">>();
  eventsByDay.forEach((dayEvents, i) => {
    for (const e of dayEvents) {
      if (e.time) continue;
      // 重复实例 e.date 都是起点日期（展开时复用同一记录对象），键改用列索引区分
      const key = e.repeat ? `${e.id}:${i}` : e.id;
      const ex = mergedBars.get(key);
      if (ex) {
        ex.end = Math.max(ex.end, i);
        continue;
      }
      let end = i;
      if (!e.repeat && e.endDate) {
        const ei = weekIdxMap.get(e.endDate);
        if (ei != null) end = Math.max(end, ei);
        else if (e.endDate > weekKeys[weekKeys.length - 1]) end = cols - 1; // 超出周范围钳到末列
      }
      mergedBars.set(key, { e, start: i, end });
    }
  });
  // 贪心行分配：按起点排序，放入第一条不与既有条目重叠的行
  const allDayRows: { end: number }[][] = [];
  const allDayBars: AllDayBar[] = [];
  for (const bar of [...mergedBars.values()].sort((a, b) => a.start - b.start)) {
    let row = allDayRows.findIndex((r) => r.every((b) => b.end < bar.start));
    if (row === -1) {
      row = allDayRows.length;
      allDayRows.push([]);
    }
    allDayRows[row].push({ end: bar.end });
    allDayBars.push({ ...bar, row });
  }

  // 重复日程把手定位：同 id 实例的首列显示左把手（调重复开始日期）、末列显示右把手（调截止日期）；
  // 与折叠区相交的实例不可见不计数。真实 byDay 多实例共享同一记录（date 全是起点日），
  // 这里按列索引而不是事件日期定位，两种实例形态（真实/测试按日构造）都正确
  const repFirstCol = new Map<string, number>();
  const repLastCol = new Map<string, number>();
  eventsByDay.forEach((list, i) => {
    for (const e of list) {
      if (!e.time || !e.repeat) continue;
      const s = parseTimeToMinutes(e.time);
      const en = e.endTime ? parseTimeToMinutes(e.endTime) : s + 60;
      if (folded && s < FOLD_END && en > FOLD_START) continue;
      if (!repFirstCol.has(e.id)) repFirstCol.set(e.id, i);
      repLastCol.set(e.id, i);
    }
  });

  // 只查时间轴自身的列：document 级查询会捕获月视图的 42 个月历格子（同样带 data-date），
  // 导致 rects[col].top 取到月历格子的坐标、拖选/挪动位置与鼠标错位
  const colRects = () =>
    Array.from(timelineRef.current?.querySelectorAll("[data-date]") ?? []).map((el) =>
      el.getBoundingClientRect()
    );

  const colFromX = (x: number, rects: DOMRect[]) => {
    for (let i = 0; i < rects.length; i++) if (x < rects[i].right) return i;
    return rects.length - 1;
  };

  // 折叠时被隐藏的事件（起点早于 7:00 即与 0:00 起的条带相交）不可被框选/挪动
  const isHidden = (e: ScheduleEvent) => {
    if (!e.time || !foldedRef.current) return false;
    return parseTimeToMinutes(e.time) < FOLD_END;
  };

  // 现在线与进行中高亮：仅当当前日期在可视范围内显示；折叠时此刻若在凌晨区内则隐藏
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNowLine = !(folded && nowMin < FOLD_END) && dates.some((d) => isSameDay(d, today));

  // 拖动中实时重排预览：把选中组从各列移除、按目标日期/时间放回后重算轨道，
  // 未松手就开始播放让位/收缩动画——表现「松手后就这么排」
  const activeMove = move && selectedIds.length > 0 ? move : null;
  // 本次拖动的移动集：被按实例（重复事件同 id 只动它）+ 其余选中事件；
  // 未在拖动时（move 为 null）一律不移动——松手后 settle 过渡由其它条件接管
  const isMoved = (e: ScheduleEvent) =>
    move
      ? e.id === move.pressId
        ? `${e.id}:${e.date}` === move.pressKey
        : selectedIds.includes(e.id)
      : false;
  const previewLayouts = activeMove
    ? new Map<number, Map<string, { track: number; tracks: number }>>(
        weekKeys.map((_, dayIdx) => {
          const others = (eventsByDay[dayIdx] ?? []).filter(
            (e) => e.time && !selectedIds.includes(e.id)
          );
          const incoming = eventsByDay
            .flatMap((dayList, dayIdx) =>
              dayList
                .filter((e) => e.time && !isHidden(e) && isMoved(e))
                .map((e) => {
                  // 实例身份/位移基准用所在列日期：重复事件多实例共享 e.date（起点日），
                  // 若用 e.date 会把同 id 全部实例映射到同一列 → 自我重叠 → 块缩成半宽
                  const src = weekKeys[dayIdx];
                  const s = parseTimeToMinutes(e.time);
                  const en = e.endTime ? parseTimeToMinutes(e.endTime) : s + 60;
                  const day = parseDateKey(src);
                  return {
                    ...e,
                    _src: src, // 身份键用实例所在日：同 id 重复实例拖入同列时互不覆盖
                    date: toDateKey(
                      addDays(day.getFullYear(), day.getMonth(), day.getDate(), activeMove.dx)
                    ),
                    time: minutesToTime(s + activeMove.dy),
                    endTime: minutesToTime(en + activeMove.dy),
                  };
                })
            )
            .filter(
              (e) =>
                e.date === weekKeys[dayIdx] &&
                !(folded && parseTimeToMinutes(e.time) < FOLD_END)
            );
          return [dayIdx, layoutColumns([...others, ...incoming])];
        })
      )
    : null;

  // 指针捕获：按下即捕获，指针移出窗口/在窗外松手也持续收到事件，释放可靠
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    // 时间块横向拖宽：按列吸附预览
    const hs = hStretchRef.current;
    if (hs) {
      handleHStretchMove(e);
      return;
    }
    // 拖边缘调整：预览吸附分钟（钳制 0 ≤ start、end ≤ 1439、时长 ≥ 5 分钟）
    const rz = resizeRef.current;
    if (rz) {
      const raw = rawMinAtY(e.clientY - rz.top);
      if (raw != null) {
        const ev = eventsRef.current.flat().find((x) => x.id === rz.id && x.date === rz.date);
        if (ev) {
          const s = parseTimeToMinutes(ev.time);
          const en = ev.endTime ? parseTimeToMinutes(ev.endTime) : s + 60;
          const lo = rz.edge === "start" ? 0 : s + MIN_DRAG_MIN;
          const hi = rz.edge === "start" ? en - MIN_DRAG_MIN : 1439;
          const curMin = Math.max(lo, Math.min(hi, snapSelect(raw)));
          resizeRef.current = { ...rz, curMin };
          setResize({ ...rz, curMin });
          // 实时写时间：气泡跟随鼠标显示调整后的起止区间
          const rect = timelineRef.current?.getBoundingClientRect();
          if (rect) {
            setTip({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              text:
                rz.edge === "start"
                  ? `${minutesToTime(curMin)}–${minutesToTime(en)}`
                  : `${minutesToTime(s)}–${minutesToTime(curMin)}`,
            });
          }
        }
      }
      return;
    }
    const m = moveRef.current;
    if (m) {
      const dx = Math.max(m.dxMin, Math.min(m.dxMax, colFromX(e.clientX, m.colRects) - m.downCol));
      // 参考事件（选中组里第一个可见的）：绝对对齐以事件时间为基准
      const first = selectedRef.current
        .map((id) => eventsRef.current.flat().find((x) => x.id === id))
        .find((x) => x && x.time && !isHidden(x));
      const refStart = first ? parseTimeToMinutes(first.time) : m.downMin;
      const curMin = rawMinAtY(e.clientY - m.top);
      // 落点绝对对齐 5 分钟：事件时间本身取整到 5 的倍数（0/5/10 结尾），
      // 不再对相对偏移取整（否则起点非 5 倍数时会累计出 1/6/11 这类结尾）
      const dyRaw = curMin == null ? m.dy : curMin - m.downMin;
      const target = Math.round((refStart + dyRaw) / MOVE_SNAP_MIN) * MOVE_SNAP_MIN;
      const dy = Math.max(m.dyMin, Math.min(m.dyMax, target - refStart));
      const next = { ...m, dx, dy };
      moveRef.current = next;
      setMove(next);
      if (rect && first) {
        const s = parseTimeToMinutes(first.time);
        const en = first.endTime ? parseTimeToMinutes(first.endTime) : s + 60;
        const day = parseDateKey(first.date);
        const nd = addDays(day.getFullYear(), day.getMonth(), day.getDate(), next.dx);
        setTip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          text: `${nd.getMonth() + 1}月${nd.getDate()}日 ${minutesToTime(s + next.dy)}–${minutesToTime(en + next.dy)}`,
        });
      }
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const curCol = colFromX(e.clientX, d.colRects);
    const rawMin = rawMinAtY(e.clientY - d.top);
    if (rawMin == null) {
      dragRef.current = { ...d, curCol };
      setDrag({ ...d, curCol });
      return;
    }
    const curMin = snapSelect(rawMin); // 起止时间对齐 5 分钟刻度
    const start = Math.min(d.down, curMin);
    const end = Math.max(d.down, curMin);
    const next = {
      ...d,
      curCol,
      start,
      end: end === start ? end + SNAP_MIN : end,
      moved: d.moved || curMin !== d.down,
    };
    dragRef.current = next;
    setDrag(next);
    if (rect) {
      const colMin = Math.min(next.startCol, next.curCol);
      const colMax = Math.max(next.startCol, next.curCol);
      const range = `${minutesToTime(next.start)}–${minutesToTime(next.end)}`;
      const sd = parseDateKey(weekKeysRef.current[colMin]);
      const ed = parseDateKey(weekKeysRef.current[colMax]);
      setTip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        text:
          colMin === colMax
            ? range
            : `${sd.getMonth() + 1}月${sd.getDate()}日–${ed.getMonth() + 1}月${ed.getDate()}日 ${range}`,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    // 时间块横向拖宽提交
    if (hStretchRef.current) {
      handleHStretchUp();
      return;
    }
    // 调整大小提交：一次 commit（撤销一条记录）
    const rz = resizeRef.current;
    if (rz) {
      const ev = eventsRef.current.flat().find((x) => x.id === rz.id && x.date === rz.date);
      if (ev && rz.curMin !== rz.downMin) {
        onMoveAllRef.current([
          rz.edge === "start"
            ? { id: rz.id, date: ev.date, time: minutesToTime(rz.curMin), endTime: ev.endTime }
            : { id: rz.id, date: ev.date, time: ev.time, endTime: minutesToTime(rz.curMin) },
        ]);
        justMovedRef.current = true; // 抑制随后的 click，避免误触发选中/菜单
      }
      resizeRef.current = null;
      setResize(null);
      setTip(null);
      return;
    }
    // 事件挪动：单击（未移动）只选中；操作菜单由右键 contextmenu 呼出
    const m = moveRef.current;
    if (m) {
      if (m.dx === 0 && m.dy === 0) {
        // 指针捕获后浏览器把 click 派发到捕获元素（列）而非事件块，onClick 收不到：
        // 左键单击事件块 → 只选中（左键不再弹菜单，右键才弹）
        // 重复事件同 id 多实例：pressKey 定位被按实例，选中不误报其他实例
        applySelection([m.pressId]);
        moveRef.current = null;
        setMove(null);
        setTip(null);
        return;
      }
      if (m.dx !== 0 || m.dy !== 0) {
        const patches: EventMovePatch[] = [];
        for (const id of selectedRef.current) {
          for (const ev of eventsRef.current.flat()) {
            if (ev.id !== id || !ev.time || isHidden(ev)) continue;
            // 重复事件同 id 多实例：只提交被按的那个实例，其余实例留在原列
            if (id === m.pressId && `${ev.id}:${ev.date}` !== m.pressKey) continue;
            const s = parseTimeToMinutes(ev.time);
            const day = parseDateKey(ev.date);
            patches.push({
              id,
              date: toDateKey(addDays(day.getFullYear(), day.getMonth(), day.getDate(), m.dx)),
              time: minutesToTime(s + m.dy),
              endTime: ev.endTime
                ? minutesToTime(parseTimeToMinutes(ev.endTime) + m.dy)
                : undefined,
            });
          }
        }
        // 整组一次提交：撤销/重做按一次操作记录
        onMoveAllRef.current(patches);
        justMovedRef.current = true; // 抑制紧随的 click，避免误触发选中/菜单
        // 提交渲染时 transform 参与过渡：块从松手位置平滑落到吸附落点，不跳回起点
        settleRef.current = true;
      }
      moveRef.current = null;
      setMove(null);
      setTip(null);
      return;
    }
    // 空白拖拽提交：矩形内有日程 → 框选；否则批量新建（横向跨几天）
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDrag(null);
    setTip(null);
    if (!d.moved || d.end - d.start < MIN_DRAG_MIN) {
      applySelection([]); // 空白单击：取消选中，并选中该列日期
      onSelectDateRef.current?.(weekKeysRef.current[d.startCol]);
      return;
    }
    const colMin = Math.min(d.startCol, d.curCol);
    const colMax = Math.max(d.startCol, d.curCol);
    const hit: string[] = [];
    for (let c = colMin; c <= colMax; c++) {
      for (const ev of eventsRef.current[c] ?? []) {
        if (!ev.time || isHidden(ev)) continue;
        const s = parseTimeToMinutes(ev.time);
        const en = ev.endTime ? parseTimeToMinutes(ev.endTime) : s + 60;
        // 选中是 id 集合：重复事件多实例同 id，命中多个实例只记一次（否则批量条计数虚高）
        if (s < d.end && en > d.start && !hit.includes(ev.id)) hit.push(ev.id);
      }
    }
    if (hit.length > 0) {
      applySelection(hit);
    } else {
      applySelection([], false); // 拖选空白新建：只清本地选中（父层表单刚打开，不上报空集）
      onAddDayRef.current(
        weekKeysRef.current.slice(colMin, colMax + 1),
        minutesToTime(d.start),
        minutesToTime(d.end)
      );
    }
  };

  // 指针中断（如触摸滚动接管）：清空拖拽状态但不提交
  const handlePointerCancel = () => {
    if (moveRef.current) {
      moveRef.current = null;
      setMove(null);
    }
    if (dragRef.current) {
      dragRef.current = null;
      setDrag(null);
    }
    if (resizeRef.current) {
      resizeRef.current = null;
      setResize(null);
    }
    if (hStretchRef.current) {
      hStretchRef.current = null;
      setHStretch(null);
    }
    setTip(null);
  };

  // 悬停高亮：鼠标位置的日期列与小时刻度跟随变化；拖拽/挪动期间不更新
  const handleTimelineMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current || moveRef.current) return;
    const rects = colRects();
    const col = colFromX(e.clientX, rects);
    // 光标时刻与拖选一致：吸附到 5 分钟刻度（左侧时刻标签与横线跟着走）
    const raw = rawMinAtY(e.clientY - rects[col].top);
    const min = raw == null ? null : snapSelect(raw);
    setHover((prev) => (prev && prev.col === col && prev.min === min ? prev : { col, min }));
  };

  const handleColumnDown = (e: React.PointerEvent<HTMLDivElement>, col: number) => {
    e.preventDefault(); // 阻止文本选择与系统原生拖拽
    setHover(null);
    const rects = colRects();
    const top = rects[col].top;
    const raw = rawMinAtY(e.clientY - top);
    if (raw == null) return; // 在条带上按下：交给条带按钮处理
    const down = snapSelect(raw); // 新建时间对齐 5 分钟刻度
    e.currentTarget.setPointerCapture(e.pointerId); // 捕获后拖出窗口仍可靠释放
    const d: RegionState = {
      top,
      down,
      start: down,
      end: down + SNAP_MIN,
      moved: false,
      startCol: col,
      curCol: col,
      colRects: rects,
    };
    dragRef.current = d;
    setDrag(d);
  };

  const handleResizeDown = (
    e: React.PointerEvent,
    ev: ScheduleEvent,
    col: number,
    edge: "start" | "end"
  ) => {
    e.stopPropagation(); // 不触发事件块整体挪动
    e.preventDefault();
    const rects = colRects();
    const raw = rawMinAtY(e.clientY - rects[col].top);
    if (raw == null) return;
    (e.currentTarget as HTMLElement).closest("[data-date]")?.setPointerCapture(e.pointerId);
    const snap = snapSelect(raw);
    const r: ResizeState = { id: ev.id, date: ev.date, edge, top: rects[col].top, downMin: snap, curMin: snap, colRects: rects };
    resizeRef.current = r;
    setResize(r);
  };

  // 全天横条横向拉伸：按列吸附（指针在每列范围内取该列索引），预览左右边界随列变化
  const handleAllDayDown = (
    e: React.PointerEvent,
    bar: AllDayBar,
    edge: "start" | "end"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const rects = colRects();
    allDayLayerRef.current?.setPointerCapture(e.pointerId);
    const d: AllDayDrag = {
      id: bar.e.id,
      start: bar.start,
      end: bar.end,
      edge,
      cur: colFromX(e.clientX, rects),
      colRects: rects,
    };
    allDayDragRef.current = d;
    setAllDayDrag(d);
  };

  const handleAllDayMove = (e: React.PointerEvent) => {
    const d = allDayDragRef.current;
    if (!d) return;
    const next = { ...d, cur: colFromX(e.clientX, d.colRects) };
    allDayDragRef.current = next;
    setAllDayDrag(next);
    const rect = timelineRef.current?.getBoundingClientRect();
    if (rect) {
      const lo = Math.min(d.start, d.end, next.cur);
      const hi = Math.max(d.start, d.end, next.cur);
      const sd = parseDateKey(weekKeysRef.current[lo]);
      const ed = parseDateKey(weekKeysRef.current[hi]);
      setTip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        text: `${sd.getMonth() + 1}月${sd.getDate()}日–${ed.getMonth() + 1}月${ed.getDate()}日`,
      });
    }
  };

  const handleAllDayUp = () => {
    const d = allDayDragRef.current;
    if (!d) return;
    allDayDragRef.current = null;
    setAllDayDrag(null);
    setTip(null);
    const ev = eventsRef.current.flat().find((x) => x.id === d.id);
    if (!ev || ev.repeat) return; // 重复事件实例不可横向拉伸
    const lo = Math.min(d.start, d.end, d.cur);
    const hi = Math.max(d.start, d.end, d.cur);
    const newDate = weekKeysRef.current[lo];
    const newEnd = weekKeysRef.current[hi];
    if (ev.date === newDate && (ev.endDate ?? ev.date) === newEnd) return;
    onMoveAllRef.current([{ id: d.id, date: newDate, endDate: newEnd }]);
  };

  const handleAllDayCancel = () => {
    if (!allDayDragRef.current) return;
    allDayDragRef.current = null;
    setAllDayDrag(null);
    setTip(null);
  };

  // 时间块横向拖宽：按下左右把手，按列吸附，预览跨列范围
  const handleHStretchDown = (
    e: React.PointerEvent,
    ev: ScheduleEvent,
    col: number,
    edge: "start" | "end"
  ) => {
    e.stopPropagation(); // 不触发事件块整体挪动
    e.preventDefault();
    const rects = colRects();
    (e.currentTarget as HTMLElement).closest("[data-date]")?.setPointerCapture(e.pointerId);
    const d: HStretchDrag = { id: ev.id, col, cur: col, edge, colRects: rects };
    hStretchRef.current = d;
    setHStretch(d);
  };

  const handleHStretchMove = (e: React.PointerEvent) => {
    const d = hStretchRef.current;
    if (!d) return;
    const next = { ...d, cur: colFromX(e.clientX, d.colRects) };
    hStretchRef.current = next;
    setHStretch(next);
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const src = eventsRef.current.flat().find((x) => x.id === d.id);
    if (src?.repeat) {
      // 重复日程：气泡显示被调整的边（开始/截止日期），频率保持不变
      const [y, m, day] = weekKeysRef.current[next.cur].split("-").map(Number);
      setTip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        text:
          d.edge === "start"
            ? `重复开始：${y}年${m}月${day}日（频率不变）`
            : `重复截止：${y}年${m}月${day}日（频率不变）`,
      });
      return;
    }
    const lo = Math.min(d.col, next.cur);
    const hi = Math.max(d.col, next.cur);
    const sd = parseDateKey(weekKeysRef.current[lo]);
    const ed = parseDateKey(weekKeysRef.current[hi]);
    setTip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      text: `${sd.getMonth() + 1}月${sd.getDate()}日–${ed.getMonth() + 1}月${ed.getDate()}日 · 每天重复`,
    });
  };

  const handleHStretchUp = () => {
    const d = hStretchRef.current;
    if (!d) return;
    hStretchRef.current = null;
    setHStretch(null);
    setTip(null);
    const src = eventsRef.current.flat().find((x) => x.id === d.id);
    if (src?.repeat) {
      // 重复日程：拖第一个实例左边界 → 改重复开始日期；拖最后一个实例右边界 → 改截止日期
      const target = weekKeysRef.current[d.cur];
      const until = src.repeat.until ?? src.date;
      if (d.edge === "start") {
        if (target === src.date) return; // 未变化
        onStretchRepeatRef.current(d.id, "start", target);
      } else {
        if (target === until) return; // 未变化
        onStretchRepeatRef.current(d.id, "end", target);
      }
      return;
    }
    const lo = Math.min(d.col, d.cur);
    const hi = Math.max(d.col, d.cur);
    if (lo === hi) return; // 未跨列：无变化
    onStretchRef.current(d.id, weekKeysRef.current[lo], weekKeysRef.current[hi]);
  };

  const handleHStretchCancel = () => {
    if (!hStretchRef.current) return;
    hStretchRef.current = null;
    setHStretch(null);
    setTip(null);
  };

  const handleBlockDown = (e: React.PointerEvent, ev: ScheduleEvent, col: number) => {
    e.stopPropagation(); // 不触发空白拖选
    e.preventDefault();
    setHover(null);
    const rects = colRects();
    const downMin = rawMinAtY(e.clientY - rects[col].top); // 基准也按精确分钟
    if (downMin == null) return;
    (e.currentTarget as HTMLElement).closest("[data-date]")?.setPointerCapture(e.pointerId);
    settleRef.current = false; // 新一次拖拽：落位过渡已结束，恢复正常过渡列表
    // 未选中 → 只挪这一个；已选中 → 挪整个选中组
    const ids = selectedIds.includes(ev.id) ? selectedIds : [ev.id];
    if (!selectedIds.includes(ev.id)) applySelection(ids);
    // 可偏移范围：选中组保持在周内与一天内
    let dxMin = 0;
    let dxMax = 0;
    let dyMin = -Infinity; // 负向（上移）边界取最大值，不能从 0 起步
    let dyMax = Infinity; // 正向（下移）边界取最小值，不能从 0 起步
    for (const id of ids) {
      const x = eventsByDay.flat().find((y) => y.id === id);
      if (!x || !x.time) continue;
      const c = weekKeys.indexOf(x.date);
      dxMin = Math.min(dxMin, -c);
      dxMax = Math.max(dxMax, 6 - c);
      const s = parseTimeToMinutes(x.time);
      const en = x.endTime ? parseTimeToMinutes(x.endTime) : s + 60;
      dyMin = Math.max(dyMin, -s);
      dyMax = Math.min(dyMax, 1439 - en);
    }
    const m: MoveState = {
      pressId: ev.id,
      pressKey: `${ev.id}:${ev.date}`,
      top: rects[col].top,
      downCol: col,
      downMin,
      dx: 0,
      dy: 0,
      dxMin,
      dxMax,
      dyMin,
      dyMax,
      colW: rects[col].width,
      colRects: rects,
    };
    moveRef.current = m;
    setMove(m);
  };

  return (
    <div
      ref={timelineRef}
      className={
        "relative flex flex-col " + tokens.weekView.timeline + (rootClass ? " " + rootClass : "")
      }
    >
      {/* 列头行：日期跳月视图 ＋ 全天事件胶囊 */}
      <div className="flex border-b border-neutral-200">
        <div style={{ width: GUTTER }} />
        <div
          className="grid flex-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {dates.map((d, i) => {
            const key = toDateKey(d);
            const isToday = isSameDay(d, today);
            return (
              <div
                key={key}
                className={
                  "min-w-0 px-1.5 py-1.5" +
                  (hover?.col === i ? " " + tokens.weekView.columnHover : "")
                }
              >
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    data-day-num={key}
                    onClick={() => onSelectDateRef.current?.(key)}
                    onDoubleClick={() => onJumpToMonth(d)}
                    aria-label={`选择${d.getMonth() + 1}月${d.getDate()}日`}
                    className={tokens.weekView.columnHeader}
                  >
                    {WEEKDAY_NAMES[i]} {d.getDate()}
                    {isToday && <span className={tokens.todayMark}> 今</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddDay([key])}
                    aria-label={`在${d.getMonth() + 1}月${d.getDate()}日添加日程`}
                    className={tokens.weekView.addDay}
                  >
                    ＋
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {/* 滚动条占位：滚动区右侧滚动条压缩内部列，这里同步留白保持列对齐 */}
        <div aria-hidden data-testid="header-scrollbar-gap" style={{ width: sbWidth }} />
      </div>

      {/* 全天横条层：跨连续日期列渲染；非重复事件可左右拖拽拉伸 */}
      {allDayBars.length > 0 && (
        <div className="relative flex border-b border-neutral-100">
          <div style={{ width: GUTTER }} />
          <div
            ref={allDayLayerRef}
            data-testid="all-day-layer"
            className="relative flex-1 select-none touch-none"
            style={{ height: allDayRows.length * ALLDAY_ROW_H }}
            onPointerMove={handleAllDayMove}
            onPointerUp={handleAllDayUp}
            onPointerCancel={handleAllDayCancel}
            onDragStart={(e) => e.preventDefault()}
          >
            {allDayBars.map((bar) => {
              // 拖动中预览：被拖条跟随指针列变化左右边界
              const preview =
                allDayDrag?.id === bar.e.id && allDayDrag
                  ? {
                      left: Math.min(allDayDrag.start, allDayDrag.end, allDayDrag.cur),
                      right: Math.max(allDayDrag.start, allDayDrag.end, allDayDrag.cur),
                    }
                  : { left: bar.start, right: bar.end };
              const isSelected = selectedIds.includes(bar.e.id);
              // 全天事件按结束日期（重复截止/跨至/当天）判过期：整个事件在过去才标暗红
              const barEndDate = bar.e.repeat?.until ?? bar.e.endDate ?? bar.e.date;
              // 实例级完成：重复全天胶囊每实例独立（实例日 = 胶囊起始列）
              const barInstDone = isInstanceDone(bar.e, weekKeys[bar.start]);
              const barExpired = !barInstDone && isInstanceExpired(bar.e, barEndDate, now);
              return (
                <div
                  key={bar.e.repeat ? `${bar.e.id}:${bar.start}` : bar.e.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`日程 ${bar.e.title}`}
                  onClick={(ev) => {
                    if (justMovedRef.current) {
                      justMovedRef.current = false;
                      return;
                    }
                    ev.stopPropagation();
                    applySelection([bar.e.id]);
                    onEdit(bar.e);
                  }}
                  className="absolute"
                  style={{
                    left: `${(preview.left / cols) * 100}%`,
                    width: `${((preview.right - preview.left + 1) / cols) * 100}%`,
                    top: bar.row * ALLDAY_ROW_H + 1,
                    height: ALLDAY_ROW_H - 2,
                  }}
                >
                  <div
                    className={
                      "flex h-full items-center gap-1 rounded-md border border-transparent px-1 transition " +
                      (isSelected ? " ring-2 ring-blue-700 " : "") +
                      (bar.e.repeat ? "" : " cursor-grab hover:scale-[1.01] hover:bg-blue-100/70") +
                      (justDone.has(posKey(bar.e)) ? " anim-done-pop" : "")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={bar.e.done}
                      onChange={(ev) => {
                        ev.stopPropagation();
                        onToggleDone(bar.e.id);
                      }}
                      aria-label={bar.e.done ? `取消完成：${bar.e.title}` : `标记完成：${bar.e.title}`}
                      className={tokens.dayList.checkbox + " shrink-0"}
                    />
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        applySelection([bar.e.id]);
                        onEdit(bar.e);
                      }}
                      aria-label={`编辑 ${bar.e.title}`}
                      className={
                        tokens.weekView.allDayItem +
                        " min-w-0 flex-1" +
                        (barInstDone ? " line-through" : "")
                      }
                      style={{
                        backgroundColor: barInstDone
                          ? "rgba(124,162,140,0.45)"
                          : barExpired
                            ? "rgba(185,96,84,0.4)"
                            : bar.e.color
                              ? bar.e.color + "59"
                              : undefined,
                        borderLeft: barInstDone
                          ? "3px solid rgb(44,98,70)"
                          : barExpired
                            ? "3px solid rgb(150,56,48)"
                            : bar.e.color
                              ? `3px solid ${bar.e.color}`
                              : undefined,
                      }}
                    >
                      {bar.e.title}
                    </button>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onDelete(bar.e.id);
                      }}
                      aria-label="删除"
                      className={tokens.dayList.delete + " shrink-0"}
                    >
                      ✕
                    </button>
                    {isSelected && !bar.e.repeat && (
                      <>
                        <div
                          data-testid="all-day-resize-start"
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                          onPointerDown={(ev) => handleAllDayDown(ev, bar, "start")}
                        />
                        <div
                          data-testid="all-day-resize-end"
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
                          onPointerDown={(ev) => handleAllDayDown(ev, bar, "end")}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div aria-hidden style={{ width: sbWidth }} />
        </div>
      )}

      {/* 滚动区：左侧小时刻度 ＋ 右侧 7 列时间轴 ＋ 凌晨折叠条 */}
      <div
        ref={scrollRef}
        data-testid="timeline-scroll"
        className={"relative flex select-none touch-none overflow-y-auto" + (scrollClass ? " " + scrollClass : "")}
        style={scrollMaxHeight !== "none" ? { maxHeight: scrollMaxHeight } : undefined}
        onMouseMove={handleTimelineMove}
        onMouseLeave={() => setHover(null)}
        onDragStart={(e) => e.preventDefault()}
      >
        {selectedIds.length > 1 && (
          <div
            data-testid="batch-color-bar"
            className="absolute left-0 right-0 top-0 z-20 flex items-center gap-2 rounded-b-xl border border-white/40 bg-white/70 px-3 py-2 shadow-xl backdrop-blur-xl"
          >
            <span className="text-xs text-neutral-600">已选 {selectedIds.length}</span>
            <div className="flex gap-1.5">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`批量颜色 ${c}`}
                  onClick={() => onBatchColorRef.current?.(selectedIds, c)}
                  className="h-4 w-4 rounded-full border border-black/10 transition hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                type="button"
                aria-label="批量颜色 默认"
                onClick={() => onBatchColorRef.current?.(selectedIds, "")}
                className="h-4 w-4 rounded-full border border-dashed border-neutral-400 text-[8px] leading-none text-neutral-500 transition hover:scale-110"
              >
                默
              </button>
            </div>
          </div>
        )}
        <div className="anim-fold relative shrink-0" style={{ width: GUTTER, height: dayHeight }}>
          {visibleHours.map((h) => (
            // inset-x-0：绝对定位容器必须有宽度，否则子刻度溢出到列外不可见
            <div key={h} className="anim-fold absolute inset-x-0" style={{ top: hourTop(h)!, height: hourPx }}>
              <span
                className={
                  tokens.weekView.hourLabel +
                  (hover?.min != null && Math.floor(hover.min / 60) === h
                    ? " " + tokens.weekView.hourLabelActive
                    : "")
                }
              >
                {h}:00
              </span>
            </div>
          ))}
          {/* 一天终点 24:00：hourTop(24) 在折叠/展开下都指向最后一行底部 */}
          <div className="anim-fold absolute inset-x-0" style={{ top: hourTop(24)!, height: 0 }}>
            <span className={tokens.weekView.hourLabel}>24:00</span>
          </div>
        </div>
        <div
          className="anim-fold grid flex-1"
          style={{ height: dayHeight, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {dates.map((d, i) => {
            const key = toDateKey(d);
            const timed = (eventsByDay[i] ?? []).filter((e) => e.time);
            const baseLayout = layoutColumns(timed);
            // 拖动中：本列用预览排布（选中组已挪走/加入后重算的轨道）
            const layout = previewLayouts?.get(i) ?? baseLayout;
            const isAnchor = key === anchorKey;
            return (
              <div
                key={key}
                data-date={key}
                className={
                  "relative min-w-0 " +
                  (selectedDate === key
                    ? "border-blue-200 bg-blue-50/40"
                    : isAnchor
                      ? tokens.weekView.columnHighlight
                      : hover?.col === i
                        ? tokens.weekView.columnHover
                        : "")
                }
                onPointerDown={(e) => handleColumnDown(e, i)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
              >
                {lineHours.map(({ h, y }) => (
                  <div key={h} className={"anim-fold " + tokens.weekView.gridLine} style={{ top: y }} />
                ))}
                {drag &&
                  i >= Math.min(drag.startCol, drag.curCol) &&
                  i <= Math.max(drag.startCol, drag.curCol) && (
                    <div
                      data-testid="drag-select"
                      className={tokens.weekView.dragSelect}
                      style={{
                        top: yOf(drag.start),
                        height: yOf(drag.end) - yOf(drag.start),
                      }}
                    />
                  )}
                {/* 横向拖宽预览：范围内每列显示半透明副本（时间与原事件相同）。
                    重复日程预览新的重复跨度：开始边 = 新起点 → 截止（或周末）；截止边 = 起点 → 新截止 */}
                {hStretch &&
                  (() => {
                    const src = eventsByDay.flat().find((x) => x.id === hStretch.id);
                    if (!src || !src.time) return null;
                    let lo = Math.min(hStretch.col, hStretch.cur);
                    let hi = Math.max(hStretch.col, hStretch.cur);
                    if (src.repeat) {
                      const dateCol = weekIdxMap.get(src.date);
                      const untilCol = src.repeat.until ? weekIdxMap.get(src.repeat.until) : undefined;
                      if (hStretch.edge === "start") {
                        const endCol = untilCol == null ? cols - 1 : Math.min(untilCol, cols - 1);
                        lo = Math.min(hStretch.cur, endCol); // 拖过截止 → 钳到截止列
                        hi = endCol;
                      } else {
                        lo = Math.max(dateCol ?? 0, 0);
                        hi = Math.max(hStretch.cur, lo); // 拖过起点 → 钳到起点列
                      }
                    }
                    if (i < lo || i > hi) return null;
                    const s = parseTimeToMinutes(src.time);
                    const en = src.endTime ? parseTimeToMinutes(src.endTime) : s + 60;
                    const dur = en > s ? en - s : 60;
                    return (
                      <div
                        data-testid="hstretch-preview"
                        className="pointer-events-none absolute rounded-lg border-2 border-dashed border-blue-400/80 bg-blue-400/25"
                        style={{ top: yOf(s), height: (dur * hourPx) / 60, left: 0, width: "100%" }}
                      />
                    );
                  })()}
                {timed.map((e) => {
                  const start = parseTimeToMinutes(e.time);
                  const end = e.endTime ? parseTimeToMinutes(e.endTime) : start + 60;
                  const duration = end > start ? end - start : 60;
                  // 折叠时与凌晨区相交的事件整体收起，仅显示在折叠条计数里
                  if (folded && start < FOLD_END && end > FOLD_START) return null;
                  const isSelected = selectedIds.includes(e.id);
                  const instDone = isInstanceDone(e, weekKeys[i]); // 实例级完成（重复日程按实例日）
                  // 只有移动集内的块跟手位移：重复事件未被按的实例留在原列不动
                  const moving = isMoved(e);
                  // 重复日程拖边界把手：首列实例左把手、末列实例右把手（中间实例不显示）
                  const repFirst = e.repeat && repFirstCol.get(e.id) === i;
                  const repLast = e.repeat && repLastCol.get(e.id) === i;
                  // 只对被拖的那一个实例做拉伸预览：重复日程多实例同 id，全匹配会一起拉伸
                  const isResizing = resize?.id === e.id && resize.date === e.date;
                  // 横向拖宽中：原块淡化，把手隐藏（预览副本在列层渲染）
                  const hst = hStretch && hStretch.id === e.id ? hStretch : null;
                  // 正在进行的日程（今天此刻起止区间覆盖当前时间）：蓝环＋柔光高亮
                  // 按实例所在列判今天：重复事件多实例共享 e.date（起点日），用 e.date 会让重复日实例漏判
                  const ongoing =
                    !isHidden(e) &&
                    !instDone &&
                    weekKeys[i] === todayKey &&
                    start <= nowMin &&
                    nowMin < end;
                  // 已过期未完成（实例日 + 结束时间 < 现在）：暗红亚克力（与进行中互斥）
                  const expired = !instDone && isInstanceExpired(e, weekKeys[i], now);
                  // 拖动块看目标列的预览轨道（显示松手后将占的轨位）；其余块看本列预览。
                  // 移动块身份键用所在列日期（与 previewLayouts 的 _src 一致）：重复事件
                  // 多实例共享 e.date，用 posKey 会让同 id 全部实例查到同一轨位
                  const basePos = baseLayout.get(posKey(e)) ?? { track: 0, tracks: 1 };
                  const previewKey = moving ? `${e.id}:${weekKeys[i]}` : posKey(e);
                  const { track, tracks } = moving
                    ? (previewLayouts?.get(
                        Math.min(Math.max(i + move!.dx, 0), cols - 1)
                      )?.get(previewKey) ?? basePos)
                    : (layout.get(previewKey) ?? basePos);
                  let blockTop = yOf(start);
                  let blockH = (duration * hourPx) / 60;
                  if (isResizing && resize) {
                    const sMin = resize.edge === "start" ? resize.curMin : start;
                    const eMin = resize.edge === "end" ? resize.curMin : end;
                    const lo = Math.min(sMin, eMin);
                    const hi = Math.max(sMin, eMin);
                    blockTop = yOf(lo);
                    blockH = yOf(hi) - yOf(lo);
                  }
                  return (
                    <div
                      key={posKey(e)}
                      role="button"
                      tabIndex={0}
                      aria-label={`日程 ${e.title}`}
                      onClick={(ev) => {
                        // 拖动刚提交时跳过：松手瞬间的 click 不该触发选中/菜单
                        if (justMovedRef.current) {
                          justMovedRef.current = false;
                          return;
                        }
                        ev.stopPropagation();
                        // 已选中组里的块保持多选；否则点谁选谁
                        if (!selectedIds.includes(e.id)) applySelection([e.id]);
                        // 鼠标左键只选中；键盘激活（Enter）时 detail=0，等同右键呼出菜单（居中显示在块上）
                        if (ev.detail !== 0) return;
                        const r = ev.currentTarget.getBoundingClientRect();
                        openCtxMenu(r.left + r.width / 2, r.top + r.height / 2, e, weekKeys[i]);
                      }}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        // 右键已选中组里的块保持多选（批量操作菜单）；否则单选该块
                        if (!selectedIds.includes(e.id)) applySelection([e.id]);
                        openCtxMenu(ev.clientX, ev.clientY, e, weekKeys[i]);
                      }}
                      draggable={false}
                      onPointerDown={(ev) => handleBlockDown(ev, e, i)}
                      // 悬停展开短卡片：块高不足时标题被裁，hover 撑到完整标题高度（scrollHeight 不受 max-h 裁切影响）
                      onPointerEnter={() => {
                        const s = titleRefs.current.get(posKey(e));
                        setExpanded({ id: posKey(e), h: Math.min(s?.scrollHeight ?? 16, 96) });
                      }}
                      onPointerLeave={() => setExpanded((cur) => (cur?.id === posKey(e) ? null : cur))}
                      className={
                        tokens.weekView.eventBlock +
                        (isResizing ? " !transition-none" : "") +
                        (isSelected ? " " + tokens.weekView.eventSelected : "") +
                        (hst ? " opacity-50" : "") +
                        (justDone.has(posKey(e)) ? " anim-done-pop" : "")
                      }
                      style={{
                        top: blockTop,
                        // 重叠并排：按轨道百分比定位，块间留 2px 缝隙
                        left: `${(track / tracks) * 100}%`,
                        width: `calc(${100 / tracks}% - 2px)`,
                        // 展开时撑到标题 + 时间行 + 上下留白；块本身够高时不变
                        height: expanded?.id === posKey(e) ? Math.max(blockH, expanded.h + 19) : blockH,
                        // 毛玻璃日程：彩色事件半透明底 + 左侧色条；已完成→低饱和深绿亚克力；已过期未完成→暗红亚克力（文字保持深色清晰）
                        backgroundColor: instDone
                          ? "rgba(124,162,140,0.45)"
                          : expired
                            ? "rgba(185,96,84,0.4)"
                            : e.color
                              ? e.color + "59"
                              : undefined,
                        borderLeft: instDone
                          ? "3px solid rgb(44,98,70)"
                          : expired
                            ? "3px solid rgb(150,56,48)"
                            : e.color
                              ? `3px solid ${e.color}`
                              : undefined,
                        // 进行中日程：2px 蓝环＋柔光，浅蓝玻璃块上也清晰可见
                        boxShadow: ongoing
                          ? "0 0 0 2px rgb(59 130 246 / 0.95), 0 0 12px 1px rgb(59 130 246 / 0.35)"
                          : undefined,
                        transform:
                          moving && move
                            ? `translate(${move.dx * move.colW}px, ${move.dy * (hourPx / 60)}px)`
                            : undefined,
                        // 拖动中只过渡轨道（left/width 跟随重叠实时让位）；transform 由指针驱动不能过渡
                        // 提交渲染：transform 参与过渡，块从松手位置平滑落到吸附落点
                        transitionProperty: moving
                          ? "left,width"
                          : expanded?.id === posKey(e) || (settleRef.current && !isResizing)
                            ? "top,left,width,height,transform"
                            : undefined,
                        // 悬停展开的块最上层（不被相邻事件/进行中高亮挡住）；拖拽中的块更高
                        zIndex: moving ? 50 : expanded?.id === posKey(e) ? 40 : isSelected ? 10 : undefined,
                      }}
                    >
                      <span
                        ref={(el) => {
                          if (el) titleRefs.current.set(posKey(e), el);
                          else titleRefs.current.delete(posKey(e));
                        }}
                        className={
                          "block overflow-hidden whitespace-normal text-xs transition-all duration-200 " +
                          (expanded?.id === posKey(e)
                            ? "max-h-none"
                            : isSelected
                              ? "max-h-16"
                              : "max-h-4") +
                          (instDone ? " line-through" : "")
                        }
                      >
                        {e.title}
                      </span>
                      <span className="block truncate text-[10px] opacity-80">
                        {/* 拖边缘实时写时间：块内时间标签跟随预览 */}
                        {isResizing && resize
                          ? resize.edge === "start"
                            ? `${minutesToTime(resize.curMin)}–${formatEventTime(e.endTime ?? "")}`
                            : `${formatEventTime(e.time)}–${minutesToTime(resize.curMin)}`
                          : `${formatEventTime(e.time)}–${formatEventTime(e.endTime ?? "")}`}
                      </span>
                      {isSelected && e.time && !isHidden(e) && (
                        <>
                          <div
                            data-testid="resize-handle-start"
                            className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
                            onPointerDown={(ev) => handleResizeDown(ev, e, i, "start")}
                          />
                          <div
                            data-testid="resize-handle-end"
                            className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                            onPointerDown={(ev) => handleResizeDown(ev, e, i, "end")}
                          />
                        </>
                      )}
                      {/* 横向拖宽把手：非重复事件左右边缘；重复事件只在首实例左缘（调开始日期）
                          与末实例右缘（调截止日期）显示；悬停显示 ew-resize 光标与蓝条 */}
                      {!hst && (
                        <>
                          {(!e.repeat || repFirst) && (
                            <div
                              data-testid="hstretch-handle-start"
                              className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize opacity-0 transition-opacity hover:opacity-100 hover:bg-blue-400/50"
                              onPointerDown={(ev) => handleHStretchDown(ev, e, i, "start")}
                            />
                          )}
                          {(!e.repeat || repLast) && (
                            <div
                              data-testid="hstretch-handle-end"
                              className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize opacity-0 transition-opacity hover:opacity-100 hover:bg-blue-400/50"
                              onPointerDown={(ev) => handleHStretchDown(ev, e, i, "end")}
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {/* 现在线：高亮当前时刻（仅当当前日期在可视范围且此刻不在折叠区内） */}
        {showNowLine && (
          <div
            data-testid="now-line"
            className="pointer-events-none absolute inset-x-0 z-10"
            style={{ top: yOf(nowMin) }}
          >
            <div className="h-0.5 rounded-full bg-blue-500/90" />
          </div>
        )}
        {/* 光标横线与时刻标签：悬停时横向高亮当前时刻，左侧显示精确分钟 */}
        {hover?.min != null && (
          <>
            <div
              data-testid="cursor-line"
              className={tokens.weekView.cursorLine}
              style={{ top: yOf(hover.min) }}
            />
            <div
              data-testid="cursor-label"
              className={tokens.weekView.cursorLabel}
              style={{ top: yOf(hover.min) }}
            >
              {minutesToTime(hover.min)}
            </div>
          </>
        )}
        {/* 凌晨折叠条：点击展开/收起 */}
        {/* 条带从刻度列右缘到内容右缘（right: sbWidth 不覆盖滚动条），否则居中文字比列中心偏右 */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setFolded((f) => !f)}
          aria-label={folded ? "展开凌晨时段 0:00–6:00" : "收起凌晨时段 0:00–6:00"}
          className={"anim-fold absolute z-10 " + tokens.weekView.foldBand}
          style={{ left: GUTTER, right: sbWidth, top: bandTop, height: bandH }}
        >
          {folded
            ? `凌晨时段 0:00–6:00 已折叠${foldCount > 0 ? `（${foldCount} 项日程）` : ""} · 点击展开`
            : "点击收起凌晨时段"}
        </button>
      </div>
      {/* 拖拽时间气泡：跟随鼠标显示当前选区/目标时间（放滚动容器外，避免裁剪与滚动偏移） */}
      {tip && (
        <div className={tokens.weekView.dragTip} style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
      {/* 点击日程弹出的操作菜单：鼠标旁边显示，点外部/任意键关闭 */}
      {ctxMenu &&
        (() => {
          const { x, y, e, day } = ctxMenu;
          // 多选（框选多个不同日程，selectedIds 按 id 去重）右键 → 批量菜单；
          // 重复日程的多个实例只算 1 个 id，仍走单实例分支（实例级操作）
          const multi = selectedIds.length > 1;
          const items: { label: string; onClick: () => void }[] = [];
          if (multi) {
            items.push(
              {
                label: "批量标记为已完成",
                onClick: () => {
                  setCtxMenu(null);
                  onBatchMarkDoneRef.current?.(selectedIds);
                },
              },
              {
                label: "批量标记为未完成",
                onClick: () => {
                  setCtxMenu(null);
                  onBatchUnmarkRef.current?.(selectedIds);
                },
              }
            );
          } else {
            // 单实例：完成状态按右键的实例日判断（重复日程只作用于该实例）
            const instDone = isInstanceDone(e, day);
            // 结束判断按实例所在日（右键的列）：明天下午的日程即使时刻早于现在也没结束，
            // 只有「实例日 < 今天」或「今天且已过结束时刻」才算已结束
            const ended = isInstanceExpired(e, day, now);
            const notEnded = !instDone && !!e.time && !ended; // 未结束：可提前结束
            const expiredPending = !instDone && !!e.time && ended; // 已过期未完成：可标记为已完成
            const unmarkable = !!e.time && instDone; // 已完成（含提前结束）：可标记为未完成
            items.push(
              { label: "编辑", onClick: () => { setCtxMenu(null); onEdit(e); } },
              { label: "复制", onClick: () => { setCtxMenu(null); onCopyRef.current(e); } }
            );
            if (notEnded) {
              items.push({
                label: "提前结束",
                onClick: () => {
                  setCtxMenu(null);
                  onEndEarlyRef.current(e.id, day);
                },
              });
            }
            if (expiredPending) {
              items.push({
                label: "标记为已完成",
                onClick: () => {
                  setCtxMenu(null);
                  onMarkDoneRef.current(e.id, day);
                },
              });
            }
            if (unmarkable) {
              items.push({
                label: "标记为未完成",
                onClick: () => {
                  setCtxMenu(null);
                  onPostponeRef.current(e, day);
                },
              });
            }
            items.push({
              label: "删除",
              onClick: () => {
                setCtxMenu(null);
                onDeleteRef.current(e.id);
              },
            });
          }
          // 菜单在鼠标右/下边缘时向内翻转，避免超出屏幕
          const menuW = 132;
          const menuH = items.length * 34 + 10;
          const left = Math.max(4, Math.min(x, window.innerWidth - menuW - 4));
          const top = Math.max(4, Math.min(y, window.innerHeight - menuH - 4));
          return (
            <div
              role="menu"
              aria-label="日程操作"
              className="fixed z-50 min-w-[132px] rounded-xl border border-white/40 bg-white/85 p-1 shadow-xl backdrop-blur-xl"
              style={{ left, top }}
            >
              {items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  onClick={it.onClick}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-neutral-700 transition hover:bg-blue-50 hover:text-blue-700"
                >
                  {it.label}
                </button>
              ))}
            </div>
          );
        })()}
    </div>
  );
}
