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

// 霓虹三色事件标记：青 / 紫红 / 绿 轮换，各配发光
const MARKER_DOTS = [
  "bg-cyan-400 shadow-[0_0_6px_rgba(0,240,255,0.9)]",
  "bg-fuchsia-400 shadow-[0_0_6px_rgba(255,46,255,0.9)]",
  "bg-lime-400 shadow-[0_0_6px_rgba(57,255,20,0.9)]",
];

function sortByTime(list: ScheduleEvent[]): ScheduleEvent[] {
  return [...list].sort((a, b) => {
    const at = a.time || "99:99";
    const bt = b.time || "99:99";
    return at.localeCompare(bt);
  });
}

export default function Style3() {
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
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a12] font-mono">
      {/* 背景装饰：网格线 + 霓虹辉光 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500 opacity-20 blur-[120px]" />
        <div className="absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-fuchsia-600 opacity-20 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <p className="text-xs tracking-widest text-cyan-500">// SCHEDULE SYSTEM V2.7</p>
          <h1 className="mt-2 animate-neon-flicker text-4xl font-bold text-cyan-300 drop-shadow-[0_0_12px_rgba(0,240,255,0.8)]">
            霓虹日程
          </h1>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* 月历 */}
          <section className="rounded-lg border border-cyan-400/40 bg-[#0d0d1f]/80 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base text-cyan-200">{formatMonthTitle(viewYear, viewMonth)}</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="rounded border border-cyan-400/40 px-3 py-1.5 font-mono text-sm text-cyan-300 transition hover:bg-cyan-400/10"
                >
                  上月
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded border border-cyan-400/40 px-3 py-1.5 font-mono text-sm text-cyan-300 transition hover:bg-cyan-400/10"
                >
                  今天
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded border border-cyan-400/40 px-3 py-1.5 font-mono text-sm text-cyan-300 transition hover:bg-cyan-400/10"
                >
                  下月
                </button>
              </div>
            </div>

            <div className="mb-1.5 grid grid-cols-7 gap-1.5">
              {WEEKDAY_NAMES.map((w) => (
                <div key={w} className="py-1 text-center text-xs text-neutral-500">
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
                      "flex h-24 flex-col items-center rounded border pt-2 transition " +
                      (isSelected
                        ? "border-cyan-300 bg-cyan-400/20" +
                          (isToday ? " shadow-[0_0_10px_rgba(0,240,255,0.8)]" : "")
                        : isToday
                          ? "border-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.8)]"
                          : "border-white/5 hover:border-cyan-400/60 hover:bg-cyan-400/5")
                    }
                  >
                    <span
                      className={
                        "font-mono " +
                        (isSelected
                          ? "text-cyan-200"
                          : isToday
                            ? "text-cyan-300"
                            : inMonth
                              ? "text-cyan-100"
                              : "text-neutral-700")
                      }
                    >
                      {d.getDate()}
                    </span>
                    <span className="mt-1.5 flex h-4 items-center justify-center gap-1">
                      {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                        <span key={i} className={"h-1.5 w-1.5 rounded-full " + MARKER_DOTS[i % 3]} />
                      ))}
                      {n > 3 && <span className="text-[10px] text-cyan-400">+{n - 3}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 当日日程 */}
          <section className="rounded-lg border border-cyan-400/40 bg-[#0d0d1f]/80 p-5">
            <p className="text-sm text-cyan-200/80">{formatDayLabel(selectedDate)}</p>
            <button
              type="button"
              onClick={openAdd}
              className="mt-4 w-full rounded bg-cyan-400 px-4 py-2 text-sm font-bold text-black shadow-[0_0_16px_rgba(0,240,255,0.6)] transition hover:bg-cyan-300"
            >
              ＋ 添加日程
            </button>

            {dayEvents.length === 0 ? (
              <p className="mt-6 text-sm text-neutral-500">这一天没有日程</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {dayEvents.map((e) => (
                  <li
                    key={e.id}
                    className="group flex items-center gap-3 border-b border-white/10 pb-3 last:border-b-0 last:pb-0"
                  >
                    <input
                      type="checkbox"
                      checked={e.done}
                      onChange={() => toggleDone(e.id)}
                      aria-label={e.done ? `取消完成：${e.title}` : `标记完成：${e.title}`}
                      className="accent-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => openEdit(e)}
                      aria-label={`编辑 ${e.title}`}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="text-xs tabular-nums text-cyan-400">{formatEventTime(e.time)}</div>
                      <div
                        className={
                          e.done
                            ? "truncate text-sm text-neutral-600 line-through"
                            : "truncate text-sm text-neutral-100"
                        }
                      >
                        {e.title}
                      </div>
                      {e.description && (
                        <div className="truncate text-xs text-neutral-500">{e.description}</div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEvent(e.id)}
                      aria-label="删除"
                      className="shrink-0 text-neutral-500 transition hover:text-red-400"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onMouseDown={() => setForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-cyan-400/50 bg-[#0d0d1f] p-6 shadow-[0_0_40px_rgba(0,240,255,0.25)]"
          >
            <h3 className="text-lg font-bold text-cyan-300">{form.id ? "编辑日程" : "添加日程"}</h3>
            <div className="mt-4 space-y-4">
              <label htmlFor="title" className="block">
                <span className="text-sm text-cyan-400/80">标题</span>
                <input
                  id="title"
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="日程标题"
                  className="mt-1 w-full rounded border border-cyan-400/40 bg-black/60 px-3 py-2 text-cyan-100 placeholder-neutral-600 focus:border-cyan-300 focus:outline-none"
                />
              </label>
              <label htmlFor="time" className="block">
                <span className="text-sm text-cyan-400/80">时间</span>
                <input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="mt-1 w-full rounded border border-cyan-400/40 bg-black/60 px-3 py-2 text-cyan-100 placeholder-neutral-600 focus:border-cyan-300 focus:outline-none"
                />
              </label>
              <label htmlFor="description" className="block">
                <span className="text-sm text-cyan-400/80">描述</span>
                <textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="日程描述"
                  className="mt-1 w-full resize-none rounded border border-cyan-400/40 bg-black/60 px-3 py-2 text-cyan-100 placeholder-neutral-600 focus:border-cyan-300 focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="text-sm text-neutral-500 transition hover:text-cyan-300"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded bg-cyan-400 px-4 py-2 text-sm font-bold text-black shadow-[0_0_16px_rgba(0,240,255,0.6)] transition hover:bg-cyan-300"
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
