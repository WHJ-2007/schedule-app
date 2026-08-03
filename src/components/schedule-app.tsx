"use client";

import { useMemo, useRef, useState } from "react";
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
  getWeekDates,
  formatWeekTitle,
  addDays,
  getYearMonths,
  getMonthDayCells,
  formatYearTitle,
  addYears,
} from "@/lib/date";
import type { ScheduleEvent } from "@/lib/events";
import { getSavedView, saveView, type ViewMode } from "@/lib/views";
import type { ThemeTokens } from "./theme-tokens";
import Settings from "./settings";
import SelectionBubble from "./selection-bubble";

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
  const [viewMode, setViewMode] = useState<ViewMode>(() => getSavedView());
  const gridRef = useRef<HTMLDivElement | null>(null);

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
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDateKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekEvents = useMemo(
    () => weekDates.map((d) => sortByTime(byDay.get(toDateKey(d)) ?? [])),
    [weekDates, byDay]
  );
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

  const pickView = (v: ViewMode) => {
    saveView(v);
    setViewMode(v);
  };

  const jumpToMonth = (d: Date) => {
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDateKey(toDateKey(d));
    setViewMode("month");
  };

  const goPrevWeek = () => {
    const d = addDays(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), -7);
    setSelectedDateKey(toDateKey(d));
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goNextWeek = () => {
    const d = addDays(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 7);
    setSelectedDateKey(toDateKey(d));
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goTodayWeek = () => {
    const t = new Date();
    setSelectedDateKey(todayKey());
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
  };

  const goPrevYear = () => setViewYear((y) => addYears(y, -1));
  const goNextYear = () => setViewYear((y) => addYears(y, 1));
  const goTodayYear = () => setViewYear(new Date().getFullYear());
  const yearMonths = useMemo(() => getYearMonths(viewYear), [viewYear]);
  const yearMonthCells = useMemo(
    () => yearMonths.map((m) => getMonthDayCells(m.getFullYear(), m.getMonth())),
    [yearMonths]
  );

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

          <div className="mb-6 flex gap-2">
            {(["week", "month", "year"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => pickView(v)}
                aria-pressed={viewMode === v}
                className={viewMode === v ? tokens.viewTab.active : tokens.viewTab.inactive}
              >
                {v === "week" ? "周" : v === "month" ? "月" : "年"}
              </button>
            ))}
          </div>

          <div key={viewMode} className="anim-fade-in">
            {viewMode === "month" && (
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

                <div
                  ref={gridRef}
                  className={"relative grid grid-cols-7 " + (tokens.cellGridGap ?? "gap-1.5")}
                >
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
                      (isToday ? tokens.cell.today + " " : "") +
                      (inMonth ? tokens.cell.plain : tokens.cell.outside);
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
                        <span data-selected={isSelected ? "" : undefined} className={numClass}>
                          {d.getDate()}
                        </span>
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
                  <SelectionBubble
                    gridRef={gridRef}
                    className={tokens.cell.num + " " + tokens.cell.selected}
                    label={selectedDate.getDate()}
                  />
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
            )}
            {viewMode === "week" && (
              <section className={tokens.viewPanel}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className={tokens.sectionTitle}>{formatWeekTitle(weekDates)}</h2>
                  <div className="flex gap-2">
                    <button type="button" onClick={goPrevWeek} className={tokens.navButton}>
                      上一周
                    </button>
                    <button type="button" onClick={goTodayWeek} className={tokens.navButton}>
                      今天
                    </button>
                    <button type="button" onClick={goNextWeek} className={tokens.navButton}>
                      下一周
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {weekDates.map((d, i) => {
                    const key = toDateKey(d);
                    const list = weekEvents[i];
                    const isAnchor = key === selectedDateKey;
                    const isToday = isSameDay(d, today);
                    return (
                      <div
                        key={key}
                        className={
                          "anim-fade-in " +
                          tokens.weekView.column +
                          " " +
                          (isAnchor ? tokens.weekView.columnHighlight : "")
                        }
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => jumpToMonth(d)}
                            aria-label={`跳转到${d.getMonth() + 1}月${d.getDate()}日`}
                            className={tokens.weekView.columnHeader}
                          >
                            {WEEKDAY_NAMES[i]} {d.getDate()}
                            {isToday && <span className={tokens.todayMark}> 今</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => openAdd(key)}
                            aria-label={`在${d.getMonth() + 1}月${d.getDate()}日添加日程`}
                            className={tokens.weekView.addDay}
                          >
                            ＋
                          </button>
                        </div>
                        <ul className="mt-1.5 space-y-1">
                          {list.map((e) => (
                            <li key={e.id} className={tokens.weekView.eventRow}>
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
                                <div
                                  className={
                                    e.done
                                      ? tokens.dayList.doneTitle + " truncate"
                                      : tokens.dayList.title + " truncate"
                                  }
                                >
                                  {e.title}
                                </div>
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
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {viewMode === "year" && (
              <section className={tokens.viewPanel}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className={tokens.sectionTitle}>{formatYearTitle(viewYear)}</h2>
                  <div className="flex gap-2">
                    <button type="button" onClick={goPrevYear} className={tokens.navButton}>
                      上一年
                    </button>
                    <button type="button" onClick={goTodayYear} className={tokens.navButton}>
                      今天
                    </button>
                    <button type="button" onClick={goNextYear} className={tokens.navButton}>
                      下一年
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {yearMonths.map((m, mi) => (
                    <div
                      key={m.getMonth()}
                      className={"anim-fade-in " + tokens.yearView.monthCard}
                      style={{ animationDelay: `${Math.min(mi, 3) * 40}ms` }}
                    >
                      <button
                        type="button"
                        onClick={() => jumpToMonth(m)}
                        aria-label={`查看${m.getFullYear()}年${m.getMonth() + 1}月`}
                        className={tokens.yearView.monthTitle}
                      >
                        {m.getMonth() + 1}月
                      </button>
                      <div className="grid grid-cols-7 gap-0.5">
                        {yearMonthCells[mi].map((d, i) => {
                          if (!d) return <span key={`blank-${i}`} />;
                          const key = toDateKey(d);
                          const n = (byDay.get(key) ?? []).length;
                          const isToday = isSameDay(d, today);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => jumpToMonth(d)}
                              aria-label={`${d.getMonth() + 1}月${d.getDate()}日`}
                              className={
                                tokens.yearView.miniCell +
                                (isToday ? " " + tokens.todayMark : "")
                              }
                            >
                              {d.getDate()}
                              {n > 0 && <span className={tokens.yearView.miniDot} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
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
