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

// 手账笔色轮换：红笔 / 蓝笔 / 金色
const PEN_COLORS = ["#e05a5a", "#4a7bb5", "#e8c96a"];

function sortByTime(list: ScheduleEvent[]): ScheduleEvent[] {
  return [...list].sort((a, b) => {
    const at = a.time || "99:99";
    const bt = b.time || "99:99";
    return at.localeCompare(bt);
  });
}

export default function Style6() {
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
    <main className="paper-lines font-kai relative min-h-screen overflow-hidden bg-[#fbf6e9] text-[#4a3f35]">
      {/* 纸胶带装饰 */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-8 top-6 h-8 w-40 -rotate-3 rounded-sm bg-[#e8c96a]/70 shadow-sm"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-10 top-10 h-8 w-32 rotate-3 rounded-sm bg-[#ffb3b3]/60 shadow-sm"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-14 h-8 w-28 -rotate-2 rounded-sm bg-[#a8d8ea]/60 shadow-sm"
      />

      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <p className="font-hand text-sm text-[#b3947c]">My Daily Journal</p>
          <div className="flex flex-wrap items-baseline gap-4">
            <h1 className="font-hand -rotate-2 text-4xl text-[#4a3f35]">手账日程</h1>
            <span className="font-hand rotate-3 text-lg text-[#e05a5a]">今天也要加油呀 ✎</span>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* 月历 */}
          <section className="-rotate-[0.5deg] rounded-lg border border-[#e5dcc8] bg-[#fffdf5] p-5 shadow-sm transition">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-hand text-lg text-[#4a3f35]">
                {formatMonthTitle(viewYear, viewMonth)}
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="rounded-lg border border-[#d8cba8] px-3 py-1.5 font-kai text-[#4a3f35] transition hover:bg-[#f5edda]"
                >
                  上月
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-lg border border-[#d8cba8] px-3 py-1.5 font-kai text-[#4a3f35] transition hover:bg-[#f5edda]"
                >
                  今天
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-lg border border-[#d8cba8] px-3 py-1.5 font-kai text-[#4a3f35] transition hover:bg-[#f5edda]"
                >
                  下月
                </button>
              </div>
            </div>

            <div className="mb-1.5 grid grid-cols-7 gap-1.5">
              {WEEKDAY_NAMES.map((w) => (
                <div key={w} className="font-kai py-1 text-center text-xs text-neutral-500">
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
                    className="flex h-24 flex-col items-center rounded-md border border-dashed border-[#dfd3b8] pt-2 transition hover:bg-[#f5edda]"
                  >
                    <span
                      className={
                        "font-kai inline-flex h-7 w-7 items-center justify-center rounded-full " +
                        (isSelected
                          ? "bg-[#dbe9f5] text-[#4a3f35]"
                          : isToday
                            ? "ring-2 ring-[#e05a5a] text-[#4a3f35]"
                            : inMonth
                              ? "text-[#4a3f35]"
                              : "text-neutral-500")
                      }
                    >
                      {d.getDate()}
                    </span>
                    <span className="mt-1.5 flex h-4 items-center justify-center gap-1">
                      {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                        <span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: PEN_COLORS[i % PEN_COLORS.length] }}
                        />
                      ))}
                      {n > 3 && <span className="text-[10px] text-[#4a7bb5]">+{n - 3}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 当日日程 */}
          <section className="rotate-[0.5deg] rounded-lg border border-[#e5dcc8] bg-[#fffdf5] p-5 shadow-sm transition">
            <p className="font-kai text-sm text-[#4a3f35]">{formatDayLabel(selectedDate)}</p>
            <button
              type="button"
              onClick={openAdd}
              className="font-hand -rotate-1 mt-4 w-full rounded-lg bg-[#e05a5a] px-5 py-2 text-white shadow-md transition hover:rotate-0"
            >
              ＋ 添加日程
            </button>

            {dayEvents.length === 0 ? (
              <p className="font-kai mt-6 text-sm text-neutral-500">这一天没有日程</p>
            ) : (
              <ul className="mt-5 space-y-4">
                {dayEvents.map((e, idx) => (
                  <li
                    key={e.id}
                    className="relative rounded-lg border-l-4 bg-[#fffdf5] p-3 shadow-sm"
                    style={{ borderLeftColor: PEN_COLORS[idx % PEN_COLORS.length] }}
                  >
                    <span
                      aria-hidden
                      className="absolute -top-1.5 left-2 h-3 w-10 rotate-2 rounded-sm bg-[#e8c96a]/70"
                    />
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={e.done}
                        onChange={() => toggleDone(e.id)}
                        aria-label={e.done ? `取消完成：${e.title}` : `标记完成：${e.title}`}
                        className="accent-[#e05a5a]"
                      />
                      <button
                        type="button"
                        onClick={() => openEdit(e)}
                        aria-label={`编辑 ${e.title}`}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="font-kai text-xs text-[#4a7bb5] tabular-nums">
                          {formatEventTime(e.time)}
                        </div>
                        <div
                          className={
                            e.done
                              ? "font-kai line-through decoration-[#e05a5a] decoration-2 truncate text-sm text-[#4a3f35]"
                              : "font-kai truncate text-sm text-[#4a3f35]"
                          }
                        >
                          {e.title}
                        </div>
                        {e.description && (
                          <div className="font-kai truncate text-xs text-neutral-500">
                            {e.description}
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEvent(e.id)}
                        aria-label="删除"
                        className="shrink-0 text-neutral-500 transition hover:text-red-500"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#4a3f35]/30"
          onMouseDown={() => setForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="relative -rotate-[0.5deg] w-full max-w-sm rounded-lg border border-[#e5dcc8] bg-[#fffdf5] p-6 shadow-xl"
          >
            <span
              aria-hidden
              className="absolute -top-2 left-1/2 h-4 w-24 -translate-x-1/2 rotate-1 rounded-sm bg-[#e8c96a]/70"
            />
            <h3 className="font-hand text-lg text-[#4a3f35]">
              {form.id ? "编辑日程" : "添加日程"}
            </h3>
            <div className="mt-4 space-y-4">
              <label htmlFor="title" className="block">
                <span className="font-kai text-sm text-[#8a7a66]">标题</span>
                <input
                  id="title"
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="日程标题"
                  className="font-kai mt-1 w-full rounded-lg border-2 border-dashed border-[#d8cba8] bg-white/60 px-3 py-2 text-[#4a3f35] focus:border-[#4a7bb5] focus:outline-none"
                />
              </label>
              <label htmlFor="time" className="block">
                <span className="font-kai text-sm text-[#8a7a66]">时间</span>
                <input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="font-kai mt-1 w-full rounded-lg border-2 border-dashed border-[#d8cba8] bg-white/60 px-3 py-2 text-[#4a3f35] focus:border-[#4a7bb5] focus:outline-none"
                />
              </label>
              <label htmlFor="description" className="block">
                <span className="font-kai text-sm text-[#8a7a66]">描述</span>
                <textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="日程描述"
                  className="font-kai mt-1 w-full resize-none rounded-lg border-2 border-dashed border-[#d8cba8] bg-white/60 px-3 py-2 text-[#4a3f35] focus:border-[#4a7bb5] focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="font-kai text-sm text-[#8a7a66] transition hover:text-[#4a3f35]"
              >
                取消
              </button>
              <button
                type="submit"
                className="font-hand rounded-lg bg-[#4a7bb5] px-4 py-2 text-white"
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
