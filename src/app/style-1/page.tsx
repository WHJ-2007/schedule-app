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

type FormState = {
  id: string | null;
  title: string;
  time: string;
  description: string;
};

const EMPTY_FORM: FormState = { id: null, title: "", time: "", description: "" };

function sortByTime(list: ScheduleEvent[]): ScheduleEvent[] {
  return [...list].sort((a, b) => {
    const at = a.time || "99:99";
    const bt = b.time || "99:99";
    return at.localeCompare(bt);
  });
}

export default function Style1() {
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

  const openAdd = () => setForm(EMPTY_FORM);
  const openEdit = (e: ScheduleEvent) =>
    setForm({ id: e.id, title: e.title, time: e.time, description: e.description });

  const handleSave = () => {
    if (!form) return;
    const title = form.title.trim();
    if (!title) return;
    if (form.id) {
      updateEvent(form.id, { title, time: form.time, description: form.description });
    } else {
      const created = addEvent({
        title,
        date: selectedDateKey,
        time: form.time,
        description: form.description,
      });
      setSelectedDateKey(created.date);
    }
    setForm(null);
  };

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <p className="text-xs tracking-widest text-neutral-400">MINIMAL SCHEDULE</p>
          <h1 className="mt-2 text-2xl font-light tracking-wide text-neutral-900">极简日程</h1>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* 月历 */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base text-neutral-900">{formatMonthTitle(viewYear, viewMonth)}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-neutral-400"
                >
                  上月
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-neutral-400"
                >
                  今天
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-neutral-400"
                >
                  下月
                </button>
              </div>
            </div>

            <div className="mb-1.5 grid grid-cols-7 gap-1.5">
              {WEEKDAY_NAMES.map((w) => (
                <div key={w} className="py-1 text-center text-xs text-neutral-400">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {grid.map((d) => {
                const key = toDateKey(d);
                const inMonth = isSameMonth(d, viewYear, viewMonth);
                const isToday = isSameDay(d, today);
                const isSelected = key === selectedDateKey;
                const n = (byDay.get(key) ?? []).length;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDateKey(key)}
                    aria-label={`${d.getMonth() + 1}月${d.getDate()}日`}
                    className="flex h-24 flex-col items-center rounded-lg pt-2 transition hover:bg-neutral-50"
                  >
                    <span
                      className={
                        "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm " +
                        (isSelected
                          ? "bg-blue-600 text-white"
                          : isToday
                            ? "border-2 border-blue-600 text-neutral-900"
                            : inMonth
                              ? "text-neutral-900"
                              : "text-neutral-300")
                      }
                    >
                      {d.getDate()}
                    </span>
                    <span className="mt-1.5 flex h-4 items-center justify-center gap-1">
                      {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                        <span key={i} className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      ))}
                      {n > 3 && <span className="text-[10px] text-blue-600">+{n - 3}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 当日日程 */}
          <section>
            <div className="rounded-lg border border-neutral-200 bg-white p-5">
              <p className="text-sm text-neutral-500">{formatDayLabel(selectedDate)}</p>
              <button
                type="button"
                onClick={openAdd}
                className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
              >
                ＋ 添加日程
              </button>

              {dayEvents.length === 0 ? (
                <p className="mt-6 text-sm text-neutral-400">今天没有日程</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {dayEvents.map((e) => (
                    <li key={e.id} className="group flex items-center gap-3 border-b border-neutral-100 pb-3 last:border-b-0 last:pb-0">
                      <input
                        type="checkbox"
                        checked={e.done}
                        onChange={() => toggleDone(e.id)}
                        aria-label={e.done ? `取消完成：${e.title}` : `标记完成：${e.title}`}
                        className="accent-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => openEdit(e)}
                        aria-label={`编辑 ${e.title}`}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="text-xs text-neutral-400 tabular-nums">
                          {formatEventTime(e.time)}
                        </div>
                        <div
                          className={
                            e.done
                              ? "truncate text-sm text-neutral-400 line-through"
                              : "truncate text-sm text-neutral-900"
                          }
                        >
                          {e.title}
                        </div>
                        {e.description && (
                          <div className="truncate text-xs text-neutral-400">{e.description}</div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEvent(e.id)}
                        aria-label="删除"
                        className="shrink-0 text-neutral-300 transition hover:text-red-500"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* 表单弹层 */}
      {form && (
        <div
          role="dialog"
          aria-label={form.id ? "编辑日程" : "添加日程"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onMouseDown={() => setForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-light text-neutral-900">
              {form.id ? "编辑日程" : "添加日程"}
            </h3>
            <div className="mt-4 space-y-4">
              <label htmlFor="title" className="block">
                <span className="text-sm text-neutral-600">标题</span>
                <input
                  id="title"
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="日程标题"
                  className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
                />
              </label>
              <label htmlFor="time" className="block">
                <span className="text-sm text-neutral-600">时间</span>
                <input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
                />
              </label>
              <label htmlFor="description" className="block">
                <span className="text-sm text-neutral-600">描述</span>
                <textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-blue-600 focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="text-sm text-neutral-500 transition hover:text-neutral-900"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
