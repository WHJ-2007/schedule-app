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
  // 拖拽状态同步进 ref：window 监听只挂载一次，快速单击时 mouseup
  // 也能被捕获（useEffect 被动绑定在真实浏览器是异步的，会丢快速单击）
  const dragRef = useRef<DragState | null>(null);
  const onAddDayRef = useRef(onAddDay);
  onAddDayRef.current = onAddDay;

  const snap = (minutes: number) => Math.round(minutes / SNAP_MIN) * SNAP_MIN;

  const minutesAt = (clientY: number, top: number) =>
    snap(((clientY - top) / HOUR_PX) * 60);

  // 拖选期间在 window 上监听，鼠标移出列外仍持续；mouse 事件 jsdom 支持良好
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const cur = minutesAt(e.clientY, d.top);
      const start = Math.min(d.down, cur);
      const end = Math.max(d.down, cur);
      const next = { ...d, start, end: end === start ? end + SNAP_MIN : end };
      dragRef.current = next;
      setDrag(next);
    };
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      onAddDayRef.current(d.dateKey, minutesToTime(d.start), minutesToTime(d.end));
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
    const down = minutesAt(e.clientY, top);
    const d = { col, dateKey, top, down, start: down, end: down + SNAP_MIN };
    dragRef.current = d;
    setDrag(d);
  };

  const dayHeight = HOURS.length * HOUR_PX;

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

      {/* 滚动区：左侧小时刻度 ＋ 右侧 7 列时间轴 */}
      <div className="flex overflow-y-auto" style={{ maxHeight: 560 }}>
        <div className="shrink-0" style={{ width: GUTTER, height: dayHeight }}>
          {HOURS.map((h) => (
            <div key={h} className="relative" style={{ height: HOUR_PX }}>
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
                {HOURS.slice(1).map((h) => (
                  <div
                    key={h}
                    className={tokens.weekView.gridLine}
                    style={{ top: h * HOUR_PX }}
                  />
                ))}
                {drag && drag.col === i && (
                  <div
                    data-testid="drag-select"
                    className={tokens.weekView.dragSelect}
                    style={{
                      top: (drag.start * HOUR_PX) / 60,
                      height: ((drag.end - drag.start) * HOUR_PX) / 60,
                    }}
                  />
                )}
                {timed.map((e) => {
                  const start = parseTimeToMinutes(e.time);
                  const end = e.endTime ? parseTimeToMinutes(e.endTime) : start + 60;
                  const duration = end > start ? end - start : 60;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onEdit(e)}
                      onMouseDown={(ev) => ev.stopPropagation()}
                      aria-label={`编辑 ${e.title}`}
                      className={tokens.weekView.eventBlock}
                      style={{
                        top: (start * HOUR_PX) / 60,
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
      </div>
    </div>
  );
}
