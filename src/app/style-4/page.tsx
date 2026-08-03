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

// 马卡龙五色事件标记：粉 / 薄荷 / 柠檬 / 薰衣草 / 天空 轮换
const MARKER_DOTS = [
  "bg-[#ffb6c8]",
  "bg-[#a8e6cf]",
  "bg-[#ffe08a]",
  "bg-[#c3b1e1]",
  "bg-[#a0d8f1]",
];

function sortByTime(list: ScheduleEvent[]): ScheduleEvent[] {
  return [...list].sort((a, b) => {
    const at = a.time || "99:99";
    const bt = b.time || "99:99";
    return at.localeCompare(bt);
  });
}

export default function Style4() {
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
    <main className="relative min-h-screen overflow-hidden bg-[#fff6f9]">
      {/* 背景装饰：粉彩漂浮圆 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 -top-16 h-52 w-52 rounded-full bg-[#ffb6c8] opacity-70 blur-2xl" />
        <div className="absolute -right-20 top-24 h-64 w-64 rounded-full bg-[#a8e6cf] opacity-70 blur-2xl" />
        <div className="absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-[#ffe08a] opacity-70 blur-2xl" />
        <div className="absolute -right-12 -bottom-16 h-48 w-48 rounded-full bg-[#c3b1e1] opacity-70 blur-2xl" />
        <div className="absolute left-10 top-1/2 h-40 w-40 rounded-full bg-[#a0d8f1] opacity-70 blur-2xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <p className="text-xs tracking-widest text-[#c9a2b5]">SWEET DAILY PLANNER</p>
          <h1 className="mt-2 text-3xl font-bold tracking-wide text-[#f08cae]">
            🌸 马卡龙日程
          </h1>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* 月历 */}
          <section className="rounded-3xl border border-[#ffd9e4] bg-white p-5 shadow-md shadow-[#ffd9e4]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base text-neutral-800">{formatMonthTitle(viewYear, viewMonth)}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="rounded-full border border-[#ffd0de] px-3 py-1.5 text-neutral-500 transition hover:bg-[#fff0f5]"
                >
                  上月
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-full border border-[#ffd0de] px-3 py-1.5 text-neutral-500 transition hover:bg-[#fff0f5]"
                >
                  今天
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-full border border-[#ffd0de] px-3 py-1.5 text-neutral-500 transition hover:bg-[#fff0f5]"
                >
                  下月
                </button>
              </div>
            </div>

            <div className="mb-1.5 grid grid-cols-7 gap-1.5">
              {WEEKDAY_NAMES.map((w) => (
                <div key={w} className="py-1 text-center text-xs font-semibold text-neutral-400">
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
                    className="flex h-24 flex-col items-center rounded-2xl pt-2 transition hover:bg-[#fff0f5]"
                  >
                    <span
                      className={
                        "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold " +
                        (isSelected
                          ? "bg-[#ffb6c8] text-white"
                          : isToday
                            ? "bg-[#a8e6cf] text-[#1f5f4a]"
                            : inMonth
                              ? "text-neutral-800"
                              : "text-neutral-300")
                      }
                    >
                      {d.getDate()}
                    </span>
                    <span className="mt-1.5 flex h-4 items-center justify-center gap-1">
                      {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                        <span
                          key={i}
                          className={"h-2 w-2 rounded-full " + MARKER_DOTS[i % MARKER_DOTS.length]}
                        />
                      ))}
                      {n > 3 && <span className="text-[10px] text-[#f08cae]">+{n - 3}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 当日日程 */}
          <section className="rounded-3xl border border-[#ffd9e4] bg-white p-5 shadow-md shadow-[#ffd9e4]">
            <p className="text-sm text-neutral-500">{formatDayLabel(selectedDate)}</p>
            <button
              type="button"
              onClick={openAdd}
              className="mt-4 w-full rounded-full bg-[#ffb6c8] px-5 py-2.5 font-bold text-white shadow-md shadow-[#ffc8d8] transition hover:bg-[#f99cb4]"
            >
              ＋ 添加日程
            </button>

            {dayEvents.length === 0 ? (
              <p className="mt-6 text-sm text-neutral-400">这一天没有日程</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {dayEvents.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start gap-3 rounded-2xl border border-[#ffe0ea] bg-white p-3 shadow-sm shadow-[#ffd9e4]/60"
                  >
                    <input
                      type="checkbox"
                      checked={e.done}
                      onChange={() => toggleDone(e.id)}
                      aria-label={e.done ? `取消完成：${e.title}` : `标记完成：${e.title}`}
                      className="mt-1 accent-[#ffb6c8]"
                    />
                    <button
                      type="button"
                      onClick={() => openEdit(e)}
                      aria-label={`编辑 ${e.title}`}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="inline-block rounded-full bg-[#a8e6cf] px-2 py-0.5 text-xs font-semibold text-[#1f5f4a]">
                        {formatEventTime(e.time)}
                      </span>
                      <div
                        className={
                          e.done
                            ? "mt-1 truncate text-sm font-semibold text-neutral-400 line-through"
                            : "mt-1 truncate text-sm font-semibold text-neutral-800"
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
                      className="shrink-0 text-neutral-300 transition hover:text-red-400"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#ffb6c8]/25 backdrop-blur-sm"
          onMouseDown={() => setForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl shadow-[#ffd9e4]"
          >
            <h3 className="text-lg font-bold text-[#f08cae]">{form.id ? "编辑日程" : "添加日程"}</h3>
            <div className="mt-4 space-y-4">
              <label htmlFor="title" className="block">
                <span className="text-sm font-semibold text-[#b48a98]">标题</span>
                <input
                  id="title"
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="日程标题"
                  className="mt-1 w-full rounded-xl border border-[#ffd0de] bg-[#fff6f9]/50 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#ffb6c8]"
                />
              </label>
              <label htmlFor="time" className="block">
                <span className="text-sm font-semibold text-[#b48a98]">时间</span>
                <input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#ffd0de] bg-[#fff6f9]/50 px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#ffb6c8]"
                />
              </label>
              <label htmlFor="description" className="block">
                <span className="text-sm font-semibold text-[#b48a98]">描述</span>
                <textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="日程描述"
                  className="mt-1 w-full resize-none rounded-xl border border-[#ffd0de] bg-[#fff6f9]/50 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#ffb6c8]"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="text-sm text-neutral-400 transition hover:text-neutral-600"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-full bg-[#ffb6c8] px-5 py-2 text-sm font-bold text-white shadow-md shadow-[#ffc8d8] transition hover:bg-[#f99cb4]"
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
