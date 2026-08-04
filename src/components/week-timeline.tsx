"use client";

import { useEffect, useRef, useState } from "react";
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
import type { ThemeTokens } from "./theme-tokens";

const HOUR_PX = 30; // 每小时高度（像素）：一屏能放下所有时间
const SNAP_MIN = 30; // 拖选初始占位时长（未移动时选区的最小显示宽度）
const MOVE_SNAP_MIN = 5; // 事件挪动松手落点吸附单位：事件时间本身对齐到 5 分钟倍数（0/5/10 结尾）
const SELECT_SNAP_MIN = 5; // 拖选新建时间吸附单位：起止时间对齐到 5 分钟倍数
const MIN_DRAG_MIN = 5; // 拖选新建的最小时长：更短视为单击不误建
const GUTTER = 48; // 左侧刻度列宽度
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

// 事件整体挪动：相对按下位置的日/分钟偏移
type MoveState = {
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

export type EventMovePatch = { date: string; time: string; endTime?: string };

// 同一时段重叠事件并排分列（Google 日历风格）：链式重叠归入同一簇，
// 簇内按起点贪心分轨道，簇内全部事件宽度 = 100/簇内最大并发轨道数
function layoutColumns(list: ScheduleEvent[]): Map<string, { track: number; tracks: number }> {
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
    for (const i of idxs) result.set(sorted[i].id, { track: trackOf.get(i)!, tracks: max });
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
  onAddDay,
  onEdit,
  onToggleDone,
  onDelete,
  onMove,
  cols = 7,
  rootClass,
  scrollClass,
  scrollMaxHeight = "calc(100vh - 300px)",
}: {
  tokens: ThemeTokens;
  dates: Date[];
  eventsByDay: ScheduleEvent[][];
  anchorKey: string;
  today: Date;
  onJumpToMonth: (d: Date) => void;
  onAddDay: (dates: string[], time?: string, endTime?: string) => void;
  onEdit: (e: ScheduleEvent) => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, patch: EventMovePatch) => void;
  cols?: number; // 列数：周视图 7 列，月视图当日面板 1 列
  rootClass?: string; // 追加到根容器 className（如 flex-1 min-h-0 供父 flex 撑满）
  scrollClass?: string; // 追加到滚动区 className（如 flex-1 min-h-0 供父 flex 撑满）
  scrollMaxHeight?: string; // 滚动区最大高度；传 "none" 由父容器决定
}) {
  const [drag, setDrag] = useState<RegionState | null>(null);
  const [move, setMove] = useState<MoveState | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [folded, setFolded] = useState(true); // 默认折叠凌晨 0:00–6:00
  const [hover, setHover] = useState<{ col: number; min: number | null } | null>(null); // 悬停高亮：列 + 分钟
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null); // 拖拽时间气泡
  const [editAnchor, setEditAnchor] = useState<{ x: number; y: number } | null>(null); // 编辑按钮弹出位置（光标旁）
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // 拖拽/选中状态同步进 ref：window 监听只挂载一次，闭包只捕获首次渲染值，
  // 快速单击时 mouseup 也能被捕获（useEffect 被动绑定在真实浏览器是异步的）
  const dragRef = useRef<RegionState | null>(null);
  const moveRef = useRef<MoveState | null>(null);
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const onAddDayRef = useRef(onAddDay);
  onAddDayRef.current = onAddDay;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const foldedRef = useRef(folded);
  foldedRef.current = folded;
  const eventsRef = useRef(eventsByDay);
  eventsRef.current = eventsByDay;
  const weekKeys = dates.map(toDateKey);
  const weekKeysRef = useRef(weekKeys);
  weekKeysRef.current = weekKeys;

  // 翻周后选中项已离开可视范围：清空选中与编辑按钮
  useEffect(() => {
    setSelectedIds([]);
    setEditAnchor(null);
  }, [dates]);

  const bandTop = folded ? 0 : 7 * HOUR_PX; // 条带 y：折叠时在顶部（0:00 起），展开时在 6:00 与 7:00 之间
  const bandH = folded ? FOLD_BAND_H : EXPAND_BAND_H;
  const dayHeight = (folded ? 18 : 24) * HOUR_PX + bandH;

  // 分钟 → 可见 y 坐标；折叠时 1:00–6:59 收缩进条带（事件渲染前已过滤该区段）
  const yOf = (m: number) => {
    if (folded && m >= FOLD_START && m < FOLD_END) return bandTop + bandH;
    if (folded && m >= FOLD_END) return bandTop + bandH + ((m - FOLD_END) * HOUR_PX) / 60;
    return (m * HOUR_PX) / 60;
  };

  // 原始分钟（不吸附）：供光标横线、时刻标签、拖选新建与挪动基准使用；条带区域返回 null
  const rawMinAtY = (y: number) => {
    const f = foldedRef.current;
    const bTop = f ? 0 : 7 * HOUR_PX;
    const bH = f ? FOLD_BAND_H : EXPAND_BAND_H;
    if (y < bTop) return Math.round((y / HOUR_PX) * 60);
    if (y < bTop + bH) return null;
    return Math.round(((y - bTop - bH) / HOUR_PX) * 60 + FOLD_END);
  };

  // 拖选新建时间吸附到 5 分钟倍数：按下与拖动的选区起止都对齐刻度
  const snapSelect = (m: number) => Math.round(m / SELECT_SNAP_MIN) * SELECT_SNAP_MIN;

  const hourTop = (h: number) => {
    if (h >= 7) return bandTop + bandH + (h - 7) * HOUR_PX;
    return folded ? null : h * HOUR_PX; // 折叠区内刻度（0:00–6:00）
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

  // 指针捕获：按下即捕获，指针移出窗口/在窗外松手也持续收到事件，释放可靠
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = timelineRef.current?.getBoundingClientRect();
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
    // 事件挪动提交
    const m = moveRef.current;
    if (m) {
      if (m.dx !== 0 || m.dy !== 0) {
        for (const id of selectedRef.current) {
          const ev = eventsRef.current.flat().find((x) => x.id === id);
          if (!ev || isHidden(ev)) continue;
          const s = parseTimeToMinutes(ev.time);
          const day = parseDateKey(ev.date);
          onMoveRef.current(id, {
            date: toDateKey(addDays(day.getFullYear(), day.getMonth(), day.getDate(), m.dx)),
            time: minutesToTime(s + m.dy),
            endTime: ev.endTime
              ? minutesToTime(parseTimeToMinutes(ev.endTime) + m.dy)
              : undefined,
          });
        }
      }
      moveRef.current = null;
      setMove(null);
      setTip(null);
      // 单事件（点击选中/拖动单个）结束后编辑按钮弹出在光标旁；批量挪动不弹
      if (selectedRef.current.length === 1) {
        const r = timelineRef.current?.getBoundingClientRect();
        setEditAnchor({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) });
      } else {
        setEditAnchor(null);
      }
      return;
    }
    // 空白拖拽提交：矩形内有日程 → 框选；否则批量新建（横向跨几天）
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDrag(null);
    setTip(null);
    if (!d.moved || d.end - d.start < MIN_DRAG_MIN) {
      setSelectedIds([]); // 空白单击：取消选中
      setEditAnchor(null);
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
        if (s < d.end && en > d.start) hit.push(ev.id);
      }
    }
    if (hit.length > 0) {
      setSelectedIds(hit);
      // 编辑按钮只服务单选：框选多个时不弹
      if (hit.length === 1) {
        const r = timelineRef.current?.getBoundingClientRect();
        setEditAnchor({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) });
      } else {
        setEditAnchor(null);
      }
    } else {
      setSelectedIds([]); // 拖选空白新建：清掉残留选中
      setEditAnchor(null);
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
    setTip(null);
  };

  // 悬停高亮：鼠标位置的日期列与小时刻度跟随变化；拖拽/挪动期间不更新
  const handleTimelineMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current || moveRef.current) return;
    const rects = colRects();
    const col = colFromX(e.clientX, rects);
    const min = rawMinAtY(e.clientY - rects[col].top);
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

  const handleBlockDown = (e: React.PointerEvent, ev: ScheduleEvent, col: number) => {
    e.stopPropagation(); // 不触发空白拖选
    e.preventDefault();
    setHover(null);
    const rects = colRects();
    const downMin = rawMinAtY(e.clientY - rects[col].top); // 基准也按精确分钟
    if (downMin == null) return;
    (e.currentTarget as HTMLElement).closest("[data-date]")?.setPointerCapture(e.pointerId);
    // 未选中 → 只挪这一个；已选中 → 挪整个选中组
    const ids = selectedIds.includes(ev.id) ? selectedIds : [ev.id];
    if (!selectedIds.includes(ev.id)) setSelectedIds(ids);
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

  const editTarget = editAnchor
    ? eventsByDay.flat().find((x) => x.id === selectedIds[0])
    : undefined;

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
            const allDay = (eventsByDay[i] ?? []).filter((e) => !e.time);
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
                    onClick={() => onJumpToMonth(d)}
                    aria-label={`跳转到${d.getMonth() + 1}月${d.getDate()}日`}
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
                {allDay.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {allDay.map((e) => (
                      <div key={e.id} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={e.done}
                          onChange={() => onToggleDone(e.id)}
                          aria-label={e.done ? `取消完成：${e.title}` : `标记完成：${e.title}`}
                          className={tokens.dayList.checkbox}
                        />
                        <button
                          type="button"
                          onClick={() => onEdit(e)}
                          aria-label={`编辑 ${e.title}`}
                          className={tokens.weekView.allDayItem}
                        >
                          {e.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(e.id)}
                          aria-label="删除"
                          className={tokens.dayList.delete}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 滚动区：左侧小时刻度 ＋ 右侧 7 列时间轴 ＋ 凌晨折叠条 */}
      <div
        className={"relative flex select-none touch-none overflow-y-auto" + (scrollClass ? " " + scrollClass : "")}
        style={scrollMaxHeight !== "none" ? { maxHeight: scrollMaxHeight } : undefined}
        onMouseMove={handleTimelineMove}
        onMouseLeave={() => setHover(null)}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="anim-fold relative shrink-0" style={{ width: GUTTER, height: dayHeight }}>
          {visibleHours.map((h) => (
            // inset-x-0：绝对定位容器必须有宽度，否则子刻度溢出到列外不可见
            <div key={h} className="anim-fold absolute inset-x-0" style={{ top: hourTop(h)!, height: HOUR_PX }}>
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
        </div>
        <div
          className="anim-fold grid flex-1"
          style={{ height: dayHeight, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {dates.map((d, i) => {
            const key = toDateKey(d);
            const timed = (eventsByDay[i] ?? []).filter((e) => e.time);
            const layout = layoutColumns(timed);
            const isAnchor = key === anchorKey;
            return (
              <div
                key={key}
                data-date={key}
                className={
                  "relative min-w-0 " +
                  (isAnchor
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
                {timed.map((e) => {
                  const start = parseTimeToMinutes(e.time);
                  const end = e.endTime ? parseTimeToMinutes(e.endTime) : start + 60;
                  const duration = end > start ? end - start : 60;
                  // 折叠时与凌晨区相交的事件整体收起，仅显示在折叠条计数里
                  if (folded && start < FOLD_END && end > FOLD_START) return null;
                  const isSelected = selectedIds.includes(e.id);
                  const moving = move != null && isSelected;
                  const { track, tracks } = layout.get(e.id) ?? { track: 0, tracks: 1 };
                  return (
                    <div
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`日程 ${e.title}`}
                      onClick={(ev) => {
                        if (!selectedIds.includes(e.id)) setSelectedIds([e.id]);
                        // 编辑按钮弹出在光标旁
                        const r = timelineRef.current?.getBoundingClientRect();
                        setEditAnchor({ x: ev.clientX - (r?.left ?? 0), y: ev.clientY - (r?.top ?? 0) });
                      }}
                      draggable={false}
                      onPointerDown={(ev) => handleBlockDown(ev, e, i)}
                      className={
                        "anim-fold " +
                        tokens.weekView.eventBlock +
                        (isSelected ? " " + tokens.weekView.eventSelected : "")
                      }
                      style={{
                        top: yOf(start),
                        // 重叠并排：按轨道百分比定位，块间留 2px 缝隙
                        left: `${(track / tracks) * 100}%`,
                        width: `calc(${100 / tracks}% - 2px)`,
                        height: (duration * HOUR_PX) / 60,
                        transform:
                          moving && move
                            ? `translate(${move.dx * move.colW}px, ${move.dy * (HOUR_PX / 60)}px)`
                            : undefined,
                        zIndex: moving ? 30 : isSelected ? 10 : undefined,
                      }}
                    >
                      <span
                        className={
                          "block truncate text-xs " + (e.done ? "opacity-60 line-through" : "")
                        }
                      >
                        {e.title}
                      </span>
                      <span className="block truncate text-[10px] opacity-80">
                        {formatEventTime(e.time)}–{formatEventTime(e.endTime ?? "")}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
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
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setFolded((f) => !f)}
          aria-label={folded ? "展开凌晨时段 0:00–6:00" : "收起凌晨时段 0:00–6:00"}
          className={"anim-fold absolute inset-x-0 z-10 " + tokens.weekView.foldBand}
          style={{ top: bandTop, height: bandH }}
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
      {/* 编辑按钮：选中日程后弹出在光标旁，方便点击 */}
      {editAnchor && editTarget && (
        <button
          type="button"
          onClick={() => onEdit(editTarget)}
          aria-label={`编辑 ${editTarget.title}`}
          className={tokens.weekView.eventEdit}
          style={{ left: editAnchor.x, top: editAnchor.y }}
        >
          ✎ 编辑
        </button>
      )}
    </div>
  );
}
