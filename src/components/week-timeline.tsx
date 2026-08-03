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

const HOUR_PX = 48; // 每小时高度（像素）
const SNAP_MIN = 30; // 拖选吸附粒度（分钟）
const GUTTER = 48; // 左侧刻度列宽度
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const FOLD_START = 60; // 折叠区起点 1:00（分钟）
const FOLD_END = 420; // 折叠区终点 7:00（分钟），折叠含 1:00–6:00 共六行
const FOLD_BAND_H = 40; // 折叠时条带高度
const EXPAND_BAND_H = 26; // 展开时条带高度

// 空白处拖拽：矩形选区（矩形内有日程 → 框选；无 → 批量新建）
type RegionState = {
  top: number; // 列顶视口 y 快照
  down: number; // 按下分钟
  start: number; // 选区起止分钟（min/max）
  end: number;
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
}) {
  const [drag, setDrag] = useState<RegionState | null>(null);
  const [move, setMove] = useState<MoveState | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [folded, setFolded] = useState(true); // 默认折叠凌晨 1:00–6:00

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

  // 翻周后选中项已离开可视范围：清空选中
  useEffect(() => {
    setSelectedIds([]);
  }, [dates]);

  const snap = (minutes: number) => Math.round(minutes / SNAP_MIN) * SNAP_MIN;

  const bandTop = folded ? HOUR_PX : 7 * HOUR_PX; // 条带 y：折叠时在 0:00 与 7:00 之间，展开时在 6:00 与 7:00 之间
  const bandH = folded ? FOLD_BAND_H : EXPAND_BAND_H;
  const dayHeight = (folded ? 18 : 24) * HOUR_PX + bandH;

  // 分钟 → 可见 y 坐标；折叠时 1:00–6:59 收缩进条带（事件渲染前已过滤该区段）
  const yOf = (m: number) => {
    if (folded && m >= FOLD_START && m < FOLD_END) return bandTop + bandH;
    if (folded && m >= FOLD_END) return bandTop + bandH + ((m - FOLD_END) * HOUR_PX) / 60;
    return (m * HOUR_PX) / 60;
  };

  // 可见 y 坐标 → 分钟；条带区域返回 null（不创建/不更新）
  const minutesAtY = (y: number) => {
    const f = foldedRef.current;
    const bTop = f ? HOUR_PX : 7 * HOUR_PX;
    const bH = f ? FOLD_BAND_H : EXPAND_BAND_H;
    if (y < bTop) return snap((y / HOUR_PX) * 60);
    if (y < bTop + bH) return null;
    return snap(((y - bTop - bH) / HOUR_PX) * 60 + FOLD_END);
  };

  const hourTop = (h: number) => {
    if (h < 1) return h * HOUR_PX;
    if (h >= 7) return bandTop + bandH + (h - 7) * HOUR_PX;
    return folded ? null : h * HOUR_PX; // 折叠区内刻度
  };

  const visibleHours = folded ? [0, ...HOURS.slice(7)] : HOURS;
  const lineYs = HOURS.slice(1)
    .map(hourTop)
    .filter((y): y is number => y !== null);

  const foldCount = eventsByDay.reduce(
    (sum, day) =>
      sum +
      day.filter((e) => {
        if (!e.time) return false;
        const m = parseTimeToMinutes(e.time);
        return m >= FOLD_START && m < FOLD_END;
      }).length,
    0
  );

  const colRects = () =>
    Array.from(document.querySelectorAll("[data-date]")).map((el) => el.getBoundingClientRect());

  const colFromX = (x: number, rects: DOMRect[]) => {
    for (let i = 0; i < rects.length; i++) if (x < rects[i].right) return i;
    return rects.length - 1;
  };

  // 折叠时被隐藏的事件（与凌晨区相交）不可被框选/挪动
  const isHidden = (e: ScheduleEvent) => {
    if (!e.time || !foldedRef.current) return false;
    const s = parseTimeToMinutes(e.time);
    const en = e.endTime ? parseTimeToMinutes(e.endTime) : s + 60;
    return s < FOLD_END && en > FOLD_START;
  };

  // 拖选/挪动期间在 window 上监听，鼠标移出列外仍持续
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const m = moveRef.current;
      if (m) {
        const dx = Math.max(m.dxMin, Math.min(m.dxMax, colFromX(e.clientX, m.colRects) - m.downCol));
        const curMin = minutesAtY(e.clientY - m.top);
        const dy = curMin == null ? m.dy : Math.max(m.dyMin, Math.min(m.dyMax, curMin - m.downMin));
        const next = { ...m, dx, dy };
        moveRef.current = next;
        setMove(next);
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      const curCol = colFromX(e.clientX, d.colRects);
      const curMin = minutesAtY(e.clientY - d.top);
      if (curMin == null) {
        dragRef.current = { ...d, curCol };
        setDrag({ ...d, curCol });
        return;
      }
      const start = Math.min(d.down, curMin);
      const end = Math.max(d.down, curMin);
      const next = { ...d, curCol, start, end: end === start ? end + SNAP_MIN : end };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
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
        return;
      }
      // 空白拖拽提交：矩形内有日程 → 框选；否则批量新建（横向跨几天）
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setDrag(null);
      if (d.end - d.start <= SNAP_MIN) {
        setSelectedIds([]); // 空白单击：取消选中
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
      } else {
        onAddDayRef.current(
          weekKeysRef.current.slice(colMin, colMax + 1),
          minutesToTime(d.start),
          minutesToTime(d.end)
        );
      }
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const handleColumnDown = (e: React.MouseEvent<HTMLDivElement>, col: number) => {
    const rects = colRects();
    const top = rects[col].top;
    const down = minutesAtY(e.clientY - top);
    if (down == null) return; // 在条带上按下：交给条带按钮处理
    const d: RegionState = {
      top,
      down,
      start: down,
      end: down + SNAP_MIN,
      startCol: col,
      curCol: col,
      colRects: rects,
    };
    dragRef.current = d;
    setDrag(d);
  };

  const handleBlockDown = (e: React.MouseEvent, ev: ScheduleEvent, col: number) => {
    e.stopPropagation(); // 不触发空白拖选
    const rects = colRects();
    const downMin = minutesAtY(e.clientY - rects[col].top);
    if (downMin == null) return;
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

  return (
    <div className={tokens.weekView.timeline}>
      {/* 列头行：日期跳月视图 ＋ 全天事件胶囊 */}
      <div className="flex border-b border-neutral-200">
        <div style={{ width: GUTTER }} />
        <div className="grid flex-1 grid-cols-7">
          {dates.map((d, i) => {
            const key = toDateKey(d);
            const allDay = (eventsByDay[i] ?? []).filter((e) => !e.time);
            const isToday = isSameDay(d, today);
            return (
              <div key={key} className="min-w-0 px-1.5 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
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
      <div className="relative flex overflow-y-auto" style={{ maxHeight: 560 }}>
        <div className="relative shrink-0" style={{ width: GUTTER, height: dayHeight }}>
          {visibleHours.map((h) => (
            <div key={h} className="absolute" style={{ top: hourTop(h)!, height: HOUR_PX }}>
              <span className={tokens.weekView.hourLabel}>{h}:00</span>
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7" style={{ height: dayHeight }}>
          {dates.map((d, i) => {
            const key = toDateKey(d);
            const timed = (eventsByDay[i] ?? []).filter((e) => e.time);
            const isAnchor = key === anchorKey;
            return (
              <div
                key={key}
                data-date={key}
                className={"relative min-w-0 " + (isAnchor ? tokens.weekView.columnHighlight : "")}
                onMouseDown={(e) => handleColumnDown(e, i)}
              >
                {lineYs.map((y) => (
                  <div key={y} className={tokens.weekView.gridLine} style={{ top: y }} />
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
                  return (
                    <div
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`日程 ${e.title}`}
                      onClick={() => {
                        if (!selectedIds.includes(e.id)) setSelectedIds([e.id]);
                      }}
                      onMouseDown={(ev) => handleBlockDown(ev, e, i)}
                      className={
                        tokens.weekView.eventBlock +
                        (isSelected ? " " + tokens.weekView.eventSelected : "")
                      }
                      style={{
                        top: yOf(start),
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
                      {isSelected && move == null && (
                        <button
                          type="button"
                          onMouseDown={(ev) => ev.stopPropagation()}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onEdit(e);
                          }}
                          aria-label={`编辑 ${e.title}`}
                          className={tokens.weekView.eventEdit}
                        >
                          ✎
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {/* 凌晨折叠条：点击展开/收起 */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setFolded((f) => !f)}
          aria-label={folded ? "展开凌晨时段 1:00–6:00" : "收起凌晨时段 1:00–6:00"}
          className={"absolute inset-x-0 z-10 " + tokens.weekView.foldBand}
          style={{ top: bandTop, height: bandH }}
        >
          {folded
            ? `凌晨时段 1:00–6:00 已折叠${foldCount > 0 ? `（${foldCount} 项日程）` : ""} · 点击展开`
            : "点击收起凌晨时段"}
        </button>
      </div>
    </div>
  );
}
