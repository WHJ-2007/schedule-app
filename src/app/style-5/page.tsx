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

function sortByTime(list: ScheduleEvent[]): ScheduleEvent[] {
  return [...list].sort((a, b) => {
    const at = a.time || "99:99";
    const bt = b.time || "99:99";
    return at.localeCompare(bt);
  });
}

export default function Style5() {
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
    <main className="min-h-screen bg-[#f5f7fa]">
      {/* 左侧窄品牌导航栏 */}
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-16 flex-col items-center bg-[#1e3a5f] py-6 lg:flex">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-[#c9a961] font-serif text-lg font-bold text-white">
          S
        </div>
        <div className="mt-8 flex flex-col items-center gap-8">
          <span className="text-[10px] tracking-widest text-[#c9a961]">日历</span>
          <span className="text-[10px] tracking-widest text-[#8fa3bd]">设置</span>
          <span className="text-[10px] tracking-widest text-[#8fa3bd]">报表</span>
        </div>
      </aside>

      <div className="lg:pl-16">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <header className="mb-10">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#c9a961]">
              SCHEDULE · {new Date().getFullYear()}
            </p>
            <h1 className="mt-2 font-serif text-2xl font-semibold tracking-wide text-[#1e3a5f]">
              商务日程
            </h1>
          </header>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            {/* 月历 */}
            <section className="rounded-md border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base text-neutral-800">{formatMonthTitle(viewYear, viewMonth)}</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={goPrev}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
                  >
                    上月
                  </button>
                  <button
                    type="button"
                    onClick={goToday}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
                  >
                    今天
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
                  >
                    下月
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7">
                {WEEKDAY_NAMES.map((w) => (
                  <div key={w} className="border-b border-neutral-100 py-1.5 text-center text-xs font-semibold text-neutral-500">
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
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
                      className="flex h-24 flex-col items-center rounded border-b border-neutral-100 pt-2 transition hover:bg-[#f5f7fa]"
                    >
                      <span
                        className={
                          "inline-block rounded-sm px-1.5 text-xs font-medium " +
                          (isSelected
                            ? "bg-[#1e3a5f] text-white"
                            : isToday
                              ? "bg-[#c9a961] text-[#1e3a5f]"
                              : inMonth
                                ? "text-neutral-800"
                                : "text-neutral-300")
                        }
                      >
                        {d.getDate()}
                      </span>
                      <span className="mt-1.5 flex h-4 items-center justify-center gap-1">
                        {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                          <span key={i} className="h-1 w-4 rounded-full bg-[#1e3a5f]" />
                        ))}
                        {n > 3 && <span className="text-[10px] text-[#1e3a5f]">+{n - 3}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 当日日程 */}
            <section className="rounded-md border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-500">{formatDayLabel(selectedDate)}</p>
              <button
                type="button"
                onClick={openAdd}
                className="mt-4 w-full rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16304f]"
              >
                ＋ 添加日程
              </button>

              {dayEvents.length === 0 ? (
                <p className="mt-6 text-sm text-neutral-500">这一天没有日程</p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {dayEvents.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 border-l-2 border-[#c9a961] pl-3">
                      <input
                        type="checkbox"
                        checked={e.done}
                        onChange={() => toggleDone(e.id)}
                        aria-label={e.done ? `取消完成：${e.title}` : `标记完成：${e.title}`}
                        className="mt-0.5 accent-[#1e3a5f]"
                      />
                      <button
                        type="button"
                        onClick={() => openEdit(e)}
                        aria-label={`编辑 ${e.title}`}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="text-xs font-semibold text-[#1e3a5f] tabular-nums">
                          {formatEventTime(e.time)}
                        </div>
                        <div
                          className={
                            e.done
                              ? "truncate text-sm font-medium text-neutral-400 line-through"
                              : "truncate text-sm font-medium text-neutral-800"
                          }
                        >
                          {e.title}
                        </div>
                        {e.description && (
                          <div className="mt-0.5 truncate text-xs text-neutral-400">
                            {e.description}
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEvent(e.id)}
                        aria-label="删除"
                        className="shrink-0 text-neutral-400 transition hover:text-red-500"
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

      {/* 表单弹层 */}
      {form && (
        <div
          role="dialog"
          aria-label={form.id ? "编辑日程" : "添加日程"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40"
          onMouseDown={() => setForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-md border-t-2 border-[#c9a961] bg-white p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-[#1e3a5f]">
              {form.id ? "编辑日程" : "添加日程"}
            </h3>
            <div className="mt-4 space-y-4">
              <label htmlFor="title" className="block">
                <span className="text-sm font-medium text-neutral-600">标题</span>
                <input
                  id="title"
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="日程标题"
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-300 focus:border-[#1e3a5f] focus:outline-none"
                />
              </label>
              <label htmlFor="time" className="block">
                <span className="text-sm font-medium text-neutral-600">时间</span>
                <input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 focus:border-[#1e3a5f] focus:outline-none"
                />
              </label>
              <label htmlFor="description" className="block">
                <span className="text-sm font-medium text-neutral-600">描述</span>
                <textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="日程描述"
                  className="mt-1 w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-300 focus:border-[#1e3a5f] focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="text-sm text-neutral-500 transition hover:text-neutral-700"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16304f]"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}
      <Settings />
    </main>
  );
}
