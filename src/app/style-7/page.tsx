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
import Settings from "@/components/settings";

type FormState = {
  id: string | null;
  title: string;
  time: string;
  description: string;
};

const EMPTY_FORM: FormState = { id: null, title: "", time: "", description: "" };

// 渐变色点轮换：紫 / 粉 / 琥珀 / 青 / 天蓝
const DOT_COLORS = ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9"];
// 事件卡片左边框渐变轮换：紫 / 粉 / 琥珀 / 青
const BORDER_COLORS = ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

function sortByTime(list: ScheduleEvent[]): ScheduleEvent[] {
  return [...list].sort((a, b) => {
    const at = a.time || "99:99";
    const bt = b.time || "99:99";
    return at.localeCompare(bt);
  });
}

export default function Style7() {
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
    <main className="relative min-h-screen overflow-hidden bg-white">
      {/* 背景渐变光斑 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 opacity-30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-gradient-to-br from-amber-300 to-orange-400 opacity-30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-gradient-to-br from-teal-300 to-emerald-400 opacity-25 blur-3xl"
      />

      <div className="relative mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-neutral-400">
            Modern Daily Planner
          </p>
          <h1 className="animate-gradient-move mt-3 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-5xl font-black tracking-tight text-transparent">
            渐变日程
          </h1>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* 月历 */}
          <section className="rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-xl shadow-neutral-200/50 backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">
                {formatMonthTitle(viewYear, viewMonth)}
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium transition hover:border-violet-300 hover:text-violet-600"
                >
                  上月
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium transition hover:border-violet-300 hover:text-violet-600"
                >
                  今天
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm font-medium transition hover:border-violet-300 hover:text-violet-600"
                >
                  下月
                </button>
              </div>
            </div>

            <div className="mb-1.5 grid grid-cols-7 gap-1.5">
              {WEEKDAY_NAMES.map((w) => (
                <div key={w} className="py-1 text-center text-xs font-bold text-neutral-400">
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
                    className="flex h-24 flex-col items-center rounded-2xl pt-2 transition hover:scale-[1.02] hover:bg-white"
                  >
                    <span
                      className={
                        "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold " +
                        (isToday
                          ? "animate-gradient-move bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-200"
                          : isSelected
                            ? "bg-violet-50 text-neutral-900 ring-2 ring-violet-400"
                            : inMonth
                              ? "text-neutral-900"
                              : "text-neutral-300")
                      }
                    >
                      {d.getDate()}
                    </span>
                    <span className="mt-1.5 flex h-4 items-center justify-center gap-1">
                      {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                        <span
                          key={i}
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }}
                        />
                      ))}
                      {n > 3 && (
                        <span className="text-[10px] font-bold text-violet-500">+{n - 3}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 当日日程 */}
          <section className="rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-xl shadow-neutral-200/50 backdrop-blur">
            <p className="text-sm font-semibold text-neutral-500">
              {formatDayLabel(selectedDate)}
            </p>
            <button
              type="button"
              onClick={openAdd}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2.5 font-bold text-white shadow-lg shadow-fuchsia-200 transition hover:opacity-90"
            >
              ＋ 添加日程
            </button>

            {dayEvents.length === 0 ? (
              <p className="mt-6 text-sm text-neutral-400">这一天没有日程</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {dayEvents.map((e, idx) => (
                  <li
                    key={e.id}
                    className="rounded-xl border-l-4 bg-white p-3 shadow-sm"
                    style={{ borderLeftColor: BORDER_COLORS[idx % BORDER_COLORS.length] }}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={e.done}
                        onChange={() => toggleDone(e.id)}
                        aria-label={e.done ? `取消完成：${e.title}` : `标记完成：${e.title}`}
                        className="accent-violet-500"
                      />
                      <button
                        type="button"
                        onClick={() => openEdit(e)}
                        aria-label={`编辑 ${e.title}`}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="text-xs font-bold text-neutral-400 tabular-nums">
                          {formatEventTime(e.time)}
                        </div>
                        <div
                          className={
                            e.done
                              ? "truncate text-sm font-bold text-neutral-400 line-through"
                              : "truncate text-sm font-bold text-neutral-900"
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
                    </div>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 backdrop-blur-sm"
          onMouseDown={() => setForm(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              aria-hidden
              className="h-1.5 w-full rounded-t-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400"
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="p-6"
            >
              <h3 className="text-lg font-bold text-neutral-900">
                {form.id ? "编辑日程" : "添加日程"}
              </h3>
              <div className="mt-4 space-y-4">
                <label htmlFor="title" className="block">
                  <span className="text-sm font-semibold text-neutral-600">标题</span>
                  <input
                    id="title"
                    autoFocus
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="日程标题"
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </label>
                <label htmlFor="time" className="block">
                  <span className="text-sm font-semibold text-neutral-600">时间</span>
                  <input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </label>
                <label htmlFor="description" className="block">
                  <span className="text-sm font-semibold text-neutral-600">描述</span>
                  <textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    placeholder="日程描述"
                    className="mt-1 w-full resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="text-sm font-semibold text-neutral-500 transition hover:text-neutral-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-200 transition hover:opacity-90"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Settings />
    </main>
  );
}
