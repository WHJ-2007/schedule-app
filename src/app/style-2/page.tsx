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

export default function Style2() {
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
    <main className="animate-gradient-move relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      {/* 背景装饰：模糊彩色圆 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-float-slow absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/20 blur-3xl" />
        <div className="animate-float-slow absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-white/20 blur-3xl [animation-delay:-3s]" />
        <div className="animate-float-slow absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-white/15 blur-3xl [animation-delay:-5s]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <p className="text-xs tracking-widest text-white/60">GLASS SCHEDULE</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-wide text-white drop-shadow-lg">
            玻璃日程
          </h1>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* 月历 */}
          <section className="rounded-2xl border border-white/30 bg-white/15 p-5 shadow-lg shadow-purple-900/10 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base text-white">{formatMonthTitle(viewYear, viewMonth)}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="rounded-lg border border-white/40 px-3 py-1.5 text-sm text-white transition hover:bg-white/10"
                >
                  上月
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-lg border border-white/40 px-3 py-1.5 text-sm text-white transition hover:bg-white/10"
                >
                  今天
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-lg border border-white/40 px-3 py-1.5 text-sm text-white transition hover:bg-white/10"
                >
                  下月
                </button>
              </div>
            </div>

            <div className="mb-1.5 grid grid-cols-7 gap-1.5">
              {WEEKDAY_NAMES.map((w) => (
                <div key={w} className="py-1 text-center text-xs text-white/50">
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
                    className={
                      "flex h-24 flex-col items-center rounded-xl pt-2 transition hover:bg-white/10 " +
                      (isSelected ? "bg-white/30" : "")
                    }
                  >
                    <span
                      className={
                        "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm " +
                        (isToday ? "ring-2 ring-white/90 " : "") +
                        (inMonth ? "text-white" : "text-white/30")
                      }
                    >
                      {d.getDate()}
                    </span>
                    <span className="mt-1.5 flex h-4 max-w-full items-center justify-center gap-1 overflow-hidden px-1">
                      {Array.from({ length: Math.min(n, 2) }).map((_, i) => {
                        const ev = byDay.get(key)?.[i];
                        return (
                          <span
                            key={i}
                            className="truncate rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] text-purple-900"
                          >
                            {ev ? formatEventTime(ev.time) : "·"}
                          </span>
                        );
                      })}
                      {n > 2 && <span className="shrink-0 text-[10px] text-white">+{n - 2}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 当日日程 */}
          <section className="rounded-2xl border border-white/30 bg-white/15 p-5 shadow-lg shadow-purple-900/10 backdrop-blur-xl">
            <p className="text-sm text-white/70">{formatDayLabel(selectedDate)}</p>
            <button
              type="button"
              onClick={openAdd}
              className="mt-4 w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-purple-700 transition hover:bg-white/90"
            >
              ＋ 添加日程
            </button>

            {dayEvents.length === 0 ? (
              <p className="mt-6 text-sm text-white/60">这一天没有日程</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {dayEvents.map((e) => (
                  <li
                    key={e.id}
                    className="group flex items-center gap-3 border-b border-white/15 pb-3 last:border-b-0 last:pb-0"
                  >
                    <input
                      type="checkbox"
                      checked={e.done}
                      onChange={() => toggleDone(e.id)}
                      aria-label={e.done ? `取消完成：${e.title}` : `标记完成：${e.title}`}
                      className="accent-purple-200"
                    />
                    <button
                      type="button"
                      onClick={() => openEdit(e)}
                      aria-label={`编辑 ${e.title}`}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-xs text-white/70 tabular-nums">
                        <span className="rounded-full bg-white/20 px-2 py-0.5 text-white/90">
                          {formatEventTime(e.time)}
                        </span>
                      </div>
                      <div
                        className={
                          e.done
                            ? "truncate text-sm text-white/50 line-through"
                            : "truncate text-sm text-white"
                        }
                      >
                        {e.title}
                      </div>
                      {e.description && (
                        <div className="truncate text-xs text-white/50">{e.description}</div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEvent(e.id)}
                      aria-label="删除"
                      className="shrink-0 text-white/60 transition hover:text-white"
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

      {/* 表单弹层 */}
      {form && (
        <div
          role="dialog"
          aria-label={form.id ? "编辑日程" : "添加日程"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onMouseDown={() => setForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/30 bg-white/20 p-6 shadow-lg shadow-purple-900/20 backdrop-blur-xl"
          >
            <h3 className="text-lg font-semibold text-white">
              {form.id ? "编辑日程" : "添加日程"}
            </h3>
            <div className="mt-4 space-y-4">
              <label htmlFor="title" className="block">
                <span className="text-sm text-white/70">标题</span>
                <input
                  id="title"
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="日程标题"
                  className="mt-1 w-full rounded-lg border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 focus:ring-2 focus:ring-white/60 focus:outline-none"
                />
              </label>
              <label htmlFor="time" className="block">
                <span className="text-sm text-white/70">时间</span>
                <input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 focus:ring-2 focus:ring-white/60 focus:outline-none"
                />
              </label>
              <label htmlFor="description" className="block">
                <span className="text-sm text-white/70">描述</span>
                <textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="日程描述"
                  className="mt-1 w-full resize-none rounded-lg border border-white/30 bg-white/20 px-3 py-2 text-white placeholder-white/50 focus:ring-2 focus:ring-white/60 focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="text-sm text-white/70 transition hover:text-white"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-purple-700 transition hover:bg-white/90"
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
