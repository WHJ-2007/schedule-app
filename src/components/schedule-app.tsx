"use client";

import { useMemo, useState } from "react";
import { useEvents } from "@/lib/use-events";
import {
  WEEKDAY_NAMES,
  toDateKey,
  parseDateKey,
  todayKey,
  isSameDay,
  isSameMonth,
  addMonths,
  getMonthGrid,
  formatMonthTitle,
  formatDayLabel,
  formatEventTime,
} from "@/lib/date";
import type { ScheduleEvent } from "@/lib/events";
import type { ThemeTokens } from "./theme-tokens";
import Settings from "./settings";

type FormState = {
  id: string | null;
  date: string;
  title: string;
  time: string;
  description: string;
};

function emptyForm(date: string): FormState {
  return { id: null, date, title: "", time: "", description: "" };
}

function sortByTime(list: ScheduleEvent[]): ScheduleEvent[] {
  return [...list].sort((a, b) => {
    const at = a.time || "99:99";
    const bt = b.time || "99:99";
    return at.localeCompare(bt);
  });
}

export default function ScheduleApp({ tokens }: { tokens: ThemeTokens }) {
  const { events, addEvent, updateEvent, deleteEvent, toggleDone } = useEvents();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState(() => todayKey());
  const [form, setForm] = useState<FormState | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [events]);

  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = new Date();
  const selectedDate = parseDateKey(selectedDateKey);
  const dayEvents = sortByTime(byDay.get(selectedDateKey) ?? []);
  const indicatorCap = tokens.cell.indicatorCap ?? 3;
  const indicatorArea = tokens.cell.indicatorArea ?? "mt-1.5 flex h-4 items-center justify-center gap-1";

  const goPrev = () => {
    const p = addMonths(viewYear, viewMonth, -1);
    setViewYear(p.year);
    setViewMonth(p.monthIndex);
  };
  const goNext = () => {
    const p = addMonths(viewYear, viewMonth, 1);
    setViewYear(p.year);
    setViewMonth(p.monthIndex);
  };
  const goToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    setSelectedDateKey(todayKey());
  };

  const openAdd = (dateKey: string) => setForm(emptyForm(dateKey));
  const openEdit = (e: ScheduleEvent) =>
    setForm({ id: e.id, date: e.date, title: e.title, time: e.time, description: e.description });

  const handleSave = () => {
    if (!form) return;
    const title = form.title.trim();
    if (!title) return;
    if (form.id) {
      updateEvent(form.id, { title, time: form.time, description: form.description });
    } else {
      addEvent({ title, date: form.date, time: form.time, description: form.description });
      setSelectedDateKey(form.date);
    }
    setForm(null);
  };

  return (
    <main className={"anim-fade-in " + tokens.main}>
      {tokens.decorations}
      {tokens.sidebar}
      <div className={tokens.contentClass}>
        <div className="relative z-10 mx-auto max-w-5xl px-6 py-12">
          <header className="mb-10">
            <p className={tokens.header.eyebrowClass}>{tokens.header.eyebrow}</p>
            <h1 className={tokens.header.titleClass}>{tokens.header.title}</h1>
            {tokens.header.tagline}
          </header>

          <div key="month" className="anim-fade-in">
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              {/* 月历 */}
              <section className={tokens.viewPanel}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className={tokens.sectionTitle}>{formatMonthTitle(viewYear, viewMonth)}</h2>
                  <div className="flex gap-2">
                    <button type="button" onClick={goPrev} className={tokens.navButton}>
                      上月
                    </button>
                    <button type="button" onClick={goToday} className={tokens.navButton}>
                      今天
                    </button>
                    <button type="button" onClick={goNext} className={tokens.navButton}>
                      下月
                    </button>
                  </div>
                </div>

                <div className="mb-1.5 grid grid-cols-7 gap-1.5">
                  {WEEKDAY_NAMES.map((w) => (
                    <div key={w} className={tokens.weekdayHeader}>
                      {w}
                    </div>
                  ))}
                </div>

                <div className={"grid grid-cols-7 " + (tokens.cellGridGap ?? "gap-1.5")}>
                  {grid.map((d) => {
                    const key = toDateKey(d);
                    const inMonth = isSameMonth(d, viewYear, viewMonth);
                    const isToday = isSameDay(d, today);
                    const isSelected = key === selectedDateKey;
                    const n = (byDay.get(key) ?? []).length;
                    const selectedOnCell = Boolean(tokens.cell.selectedOnCell);
                    const numClass =
                      tokens.cell.num +
                      " " +
                      (selectedOnCell
                        ? (isToday ? tokens.cell.today + " " : "") +
                          (inMonth ? tokens.cell.plain : tokens.cell.outside)
                        : tokens.cell.todayWins
                          ? isToday
                            ? tokens.cell.today
                            : isSelected
                              ? tokens.cell.selected
                              : inMonth
                                ? tokens.cell.plain
                                : tokens.cell.outside
                          : isSelected
                            ? tokens.cell.selected
                            : isToday
                              ? tokens.cell.today
                              : inMonth
                                ? tokens.cell.plain
                                : tokens.cell.outside);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedDateKey(key)}
                        aria-label={`${d.getMonth() + 1}月${d.getDate()}日`}
                        className={
                          tokens.cell.base +
                          " " +
                          (selectedOnCell && isSelected ? tokens.cell.selected : tokens.cell.hover)
                        }
                      >
                        <span className={numClass}>{d.getDate()}</span>
                        <span className={indicatorArea}>
                          {tokens.cell.indicatorPills
                            ? Array.from({ length: Math.min(n, indicatorCap) }).map((_, i) => {
                                const ev = byDay.get(key)?.[i];
                                return (
                                  <span key={i} className={tokens.dot}>
                                    {ev ? formatEventTime(ev.time) : "·"}
                                  </span>
                                );
                              })
                            : Array.from({ length: Math.min(n, indicatorCap) }).map((_, i) => (
                                <span
                                  key={i}
                                  className={tokens.dot}
                                  style={
                                    tokens.dotColors
                                      ? { backgroundColor: tokens.dotColors[i % tokens.dotColors.length] }
                                      : undefined
                                  }
                                />
                              ))}
                          {n > indicatorCap && (
                            <span className={tokens.dotMore}>+{n - indicatorCap}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 当日日程 */}
              <section className={tokens.card}>
                <p className={tokens.dayList.dateLabel}>{formatDayLabel(selectedDate)}</p>
                <button
                  type="button"
                  onClick={() => openAdd(selectedDateKey)}
                  className={tokens.button.primary + " mt-4 w-full"}
                >
                  ＋ 添加日程
                </button>

                {dayEvents.length === 0 ? (
                  <p className={tokens.dayList.empty}>这一天没有日程</p>
                ) : (
                  <ul className={tokens.dayListSpacing ?? "mt-4 space-y-3"}>
                    {dayEvents.map((e, i) => (
                      <li
                        key={e.id}
                        className={"anim-slide-up " + tokens.dayList.itemRow}
                        style={{
                          animationDelay: `${Math.min(i, 2) * 40}ms`,
                          borderLeftColor: tokens.itemColors
                            ? tokens.itemColors[i % tokens.itemColors.length]
                            : undefined,
                        }}
                      >
                        {tokens.itemDecor}
                        <input
                          type="checkbox"
                          checked={e.done}
                          onChange={() => toggleDone(e.id)}
                          aria-label={e.done ? `取消完成：${e.title}` : `标记完成：${e.title}`}
                          className={tokens.dayList.checkbox}
                        />
                        <button
                          type="button"
                          onClick={() => openEdit(e)}
                          aria-label={`编辑 ${e.title}`}
                          className={tokens.dayList.editButton}
                        >
                          <div className={tokens.dayList.time}>{formatEventTime(e.time)}</div>
                          <div className={e.done ? tokens.dayList.doneTitle : tokens.dayList.title}>
                            {e.title}
                          </div>
                          {e.description && (
                            <div className={tokens.dayList.desc}>{e.description}</div>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEvent(e.id)}
                          aria-label="删除"
                          className={tokens.dayList.delete}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* 表单弹层 */}
      {form && (
        <div
          role="dialog"
          aria-label={form.id ? "编辑日程" : "添加日程"}
          className={tokens.dialog.overlay + " anim-fade-in"}
          onMouseDown={() => setForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={"anim-scale-in " + tokens.dialog.panel}
          >
            {tokens.dialog.decor}
            <div className={tokens.dialog.bodyClass}>
              <h3 className={tokens.dialog.title}>{form.id ? "编辑日程" : "添加日程"}</h3>
              <div className="mt-4 space-y-4">
                <label htmlFor="title" className="block">
                  <span className={tokens.dialog.inputLabel}>标题</span>
                  <input
                    id="title"
                    autoFocus
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="日程标题"
                    className={tokens.dialog.input}
                  />
                </label>
                <label htmlFor="time" className="block">
                  <span className={tokens.dialog.inputLabel}>时间</span>
                  <input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className={tokens.dialog.input}
                  />
                </label>
                <label htmlFor="description" className="block">
                  <span className={tokens.dialog.inputLabel}>描述</span>
                  <textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    className={tokens.dialog.input + " resize-none"}
                  />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className={tokens.dialog.cancel}
                >
                  取消
                </button>
                <button type="submit" className={tokens.dialog.save}>
                  保存
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      <Settings />
    </main>
  );
}
