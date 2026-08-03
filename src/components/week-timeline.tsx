"use client";

import { useEffect, useRef, useState } from "react";
import {
  WEEKDAY_NAMES,
  toDateKey,
  isSameDay,
  formatEventTime,
  parseTimeToMinutes,
  minutesToTime,
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

type DragState = {
  col: number;
  dateKey: string;
  top: number; // 按下时列顶的视口坐标（快照，供 window 级 mousemove 换算）
  down: number;
  start: number;
  end: number;
};

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
}: {
  tokens: ThemeTokens;
  dates: Date[];
  eventsByDay: ScheduleEvent[][];
  anchorKey: string;
  today: Date;
  onJumpToMonth: (d: Date) => void;
  onAddDay: (dateKey: string, time?: string, endTime?: string) => void;
  onEdit: (e: ScheduleEvent) => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [folded, setFolded] = useState(true); // 默认折叠凌晨 1:00–6:00
  // 拖拽状态同步进 ref：window 监听只挂载一次，快速单击时 mouseup
  // 也能被捕获（useEffect 被动绑定在真实浏览器是异步的，会丢快速单击）
  const dragRef = useRef<DragState | null>(null);
  const onAddDayRef = useRef(onAddDay);
  onAddDayRef.current = onAddDay;
  // 折叠状态同步进 ref：window 监听闭包只捕获首次渲染的值，必须读 ref
  const foldedRef = useRef(folded);
  foldedRef.current = folded;

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

  // 可见 y 坐标 → 分钟；条带区域返回 null（不创建/不更新拖选）
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

  // 拖选期间在 window 上监听，鼠标移出列外仍持续；mouse 事件 jsdom 支持良好
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const cur = minutesAtY(e.clientY - d.top);
      if (cur == null) return; // 指针进入条带区域：保持原选区
      const start = Math.min(d.down, cur);
      const end = Math.max(d.down, cur);
      const next = { ...d, start, end: end === start ? end + SNAP_MIN : end };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      // 只有实际拖动覆盖超过一个槽位才创建；原地单击只取消高亮
      if (d.end - d.start > SNAP_MIN) {
        onAddDayRef.current(d.dateKey, minutesToTime(d.start), minutesToTime(d.end));
      }
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const handleDown = (e: React.MouseEvent<HTMLDivElement>, col: number, dateKey: string) => {
    const top = e.currentTarget.getBoundingClientRect().top;
    const down = minutesAtY(e.clientY - top);
    if (down == null) return; // 在条带上按下：交给条带按钮处理
    const d = { col, dateKey, top, down, start: down, end: down + SNAP_MIN };
    dragRef.current = d;
    setDrag(d);
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
                    onClick={() => onAddDay(key)}
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
                onMouseDown={(e) => handleDown(e, i, key)}
              >
                {lineYs.map((y) => (
                  <div key={y} className={tokens.weekView.gridLine} style={{ top: y }} />
                ))}
                {drag && drag.col === i && (
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
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onEdit(e)}
                      onMouseDown={(ev) => ev.stopPropagation()}
                      aria-label={`编辑 ${e.title}`}
                      className={tokens.weekView.eventBlock}
                      style={{
                        top: yOf(start),
                        height: (duration * HOUR_PX) / 60,
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
                    </button>
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
