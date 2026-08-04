"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import WeekTimeline from "./week-timeline";

type FormState = {
  id: string | null;
  dates: string[]; // 新建时可同时添加到多个日期（横向拖拽）
  title: string;
  time: string;
  endTime: string;
  description: string;
};

function emptyForm(dates: string[]): FormState {
  return { id: null, dates, title: "", time: "", endTime: "", description: "" };
}

function sortByTime(list: ScheduleEvent[]): ScheduleEvent[] {
  return [...list].sort((a, b) => {
    const at = a.time || "99:99";
    const bt = b.time || "99:99";
    return at.localeCompare(bt);
  });
}

// 旧视图快照残影：把克隆的 DOM 放入原位容器，缩小移动到锚点元素位置后淡出
function GhostLayer({
  ghost,
  onDone,
}: {
  ghost: {
    node: HTMLElement;
    x: number;
    y: number;
    w: number;
    h: number;
    tx: number;
    ty: number;
    s: number;
  };
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    ref.current?.replaceChildren(ghost.node);
  }, [ghost]);
  return (
    <div
      ref={ref}
      data-testid="view-ghost"
      aria-hidden
      className="pointer-events-none absolute z-40 overflow-hidden anim-ghost-morph"
      style={
        {
          left: ghost.x,
          top: ghost.y,
          width: ghost.w,
          height: ghost.h,
          transformOrigin: "center",
          "--g-tx": `${ghost.tx}px`,
          "--g-ty": `${ghost.ty}px`,
          "--g-s": `${ghost.s}`,
        } as React.CSSProperties
      }
      onAnimationEnd={onDone}
    />
  );
}

export default function ScheduleApp({ tokens }: { tokens: ThemeTokens }) {
  const { events, addEvent, updateEvent, deleteEvent, toggleDone } = useEvents();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState(() => todayKey());
  const [form, setForm] = useState<FormState | null>(null);
  // 初始恒为 month：SSR 无 localStorage，直接读保存视图会导致服务端 HTML 与客户端首帧不一致而水合失败
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [navDir, setNavDir] = useState<"left" | "right" | null>(null);
  // 周/月/年切换锚点缩放：目标锚点在切换时记入 ref，新视图渲染后实测矩形
  type ZoomAnchor = { mode: "in" | "out"; kind: "date" | "month"; key: string } | null;
  type ViewZoom = { mode: "in" | "out"; ox: number; oy: number } | null;
  const [viewZoom, setViewZoom] = useState<ViewZoom>(null);
  const zoomAnchorRef = useRef<ZoomAnchor>(null);
  const viewWrapRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  // 视图切换残影：旧视图 DOM 快照缩小移动到锚点元素位置并淡出，新视图从同一锚点缩放
  type Ghost = {
    node: HTMLElement;
    x: number;
    y: number;
    w: number;
    h: number;
    cx: number;
    cy: number;
    tx: number;
    ty: number;
    s: number;
  } | null;
  const [ghost, setGhost] = useState<Ghost>(null);

  // 切换前克隆旧视图容器：残影固定在原位置；父容器相对坐标（滚动时残影跟随内容）
  const captureGhost = () => {
    const wrap = viewWrapRef.current;
    if (!wrap) return;
    const node = wrap.cloneNode(true) as HTMLElement;
    // 残影只是视觉快照：移除测试钩子（含自身），避免克隆副本干扰 getByTestId 等查询
    for (const el of [node, ...Array.from(node.querySelectorAll("[data-testid]"))]) {
      el.removeAttribute("data-testid");
    }
    const pr = wrap.parentElement?.getBoundingClientRect();
    const r = wrap.getBoundingClientRect();
    setGhost({
      node,
      x: r.left - (pr?.left ?? 0),
      y: r.top - (pr?.top ?? 0),
      w: r.width,
      h: r.height,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      tx: 0,
      ty: 0,
      s: 0.4,
    });
  };

  useEffect(() => {
    setViewMode(getSavedView());
  }, []);

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
    setNavDir("left");
    const p = addMonths(viewYear, viewMonth, -1);
    setViewYear(p.year);
    setViewMonth(p.monthIndex);
  };
  const goNext = () => {
    setNavDir("right");
    const p = addMonths(viewYear, viewMonth, 1);
    setViewYear(p.year);
    setViewMonth(p.monthIndex);
  };
  const goToday = () => {
    setNavDir(null);
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    setSelectedDateKey(todayKey());
  };

  // 更细致视图（年→月/月→周）放大进入；更宏观视图（周→月/月→年）缩小退出
  const zoomModeFor = (from: ViewMode, to: ViewMode): "in" | "out" => {
    if (to === "year") return "out";
    if (to === "week") return "in";
    return from === "year" ? "in" : "out";
  };

  const pickView = (v: ViewMode) => {
    captureGhost();
    saveView(v);
    zoomAnchorRef.current = {
      mode: zoomModeFor(viewMode, v),
      kind: v === "year" ? "month" : "date",
      key: v === "year" ? `${viewYear}-${viewMonth}` : toDateKey(selectedDate),
    };
    setViewMode(v);
  };

  const jumpToMonth = (d: Date) => {
    captureGhost();
    setNavDir(null);
    const year = d.getFullYear();
    const month = d.getMonth();
    setViewYear(year);
    setViewMonth(month);
    setSelectedDateKey(toDateKey(d));
    zoomAnchorRef.current = {
      mode: zoomModeFor(viewMode, "month"),
      kind: "date",
      key: toDateKey(d),
    };
    setViewMode("month");
  };

  // 新视图渲染后实测锚点矩形 → transform-origin 百分比；测不到（jsdom 等）回退中心
  useLayoutEffect(() => {
    const a = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (!a) return;
    const wrap = viewWrapRef.current;
    if (!wrap) {
      setViewZoom(null);
      return;
    }
    let ox = 50;
    let oy = 50;
    const el = wrap.querySelector<HTMLElement>(
      a.kind === "date" ? `[data-date="${a.key}"]` : `[data-ym="${a.key}"]`
    );
    if (el) {
      const wr = wrap.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (wr.width > 0 && wr.height > 0 && (r.width > 0 || r.height > 0)) {
        ox = ((r.left + r.width / 2 - wr.left) / wr.width) * 100;
        oy = ((r.top + r.height / 2 - wr.top) / wr.height) * 100;
        // 残影缩向锚点元素：中心对齐、缩到锚点宽度比例（旧视图"缩小放进那个位置"）
        setGhost((g) =>
          g
            ? {
                ...g,
                tx: r.left + r.width / 2 - g.cx,
                ty: r.top + r.height / 2 - g.cy,
                s: r.width / g.w,
              }
            : g
        );
      }
    }
    setViewZoom({ mode: a.mode, ox, oy });
  }, [viewMode]);

  const goPrevWeek = () => {
    setNavDir("left");
    const d = addDays(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), -7);
    setSelectedDateKey(toDateKey(d));
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goNextWeek = () => {
    setNavDir("right");
    const d = addDays(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 7);
    setSelectedDateKey(toDateKey(d));
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goTodayWeek = () => {
    setNavDir(null);
    const t = new Date();
    setSelectedDateKey(todayKey());
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
  };

  const goPrevYear = () => {
    setNavDir("left");
    setViewYear((y) => addYears(y, -1));
  };
  const goNextYear = () => {
    setNavDir("right");
    setViewYear((y) => addYears(y, 1));
  };
  const goTodayYear = () => {
    setNavDir(null);
    setViewYear(new Date().getFullYear());
  };
  const yearMonths = useMemo(() => getYearMonths(viewYear), [viewYear]);
  const yearMonthCells = useMemo(
    () => yearMonths.map((m) => getMonthDayCells(m.getFullYear(), m.getMonth())),
    [yearMonths]
  );

  const openAdd = (dateKey: string | string[], time?: string, endTime?: string) => {
    const list = Array.isArray(dateKey) ? dateKey : [dateKey];
    return setForm({ ...emptyForm(list), time: time ?? "", endTime: endTime ?? "" });
  };
  const openEdit = (e: ScheduleEvent) =>
    setForm({
      id: e.id,
      dates: [e.date],
      title: e.title,
      time: e.time,
      endTime: e.endTime ?? "",
      description: e.description,
    });

  const handleSave = () => {
    if (!form) return;
    const title = form.title.trim();
    if (!title) return;
    if (form.id) {
      updateEvent(form.id, {
        title,
        time: form.time,
        endTime: form.endTime || undefined,
        description: form.description,
      });
    } else {
      for (const d of form.dates) {
        addEvent({
          title,
          date: d,
          time: form.time,
          endTime: form.endTime || undefined,
          description: form.description,
        });
      }
      setSelectedDateKey(form.dates[0]);
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
            {(["year", "month", "week"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => pickView(v)}
                aria-pressed={viewMode === v}
                className={viewMode === v ? tokens.viewTab.active : tokens.viewTab.inactive}
              >
                {v === "year" ? "年" : v === "month" ? "月" : "周"}
              </button>
            ))}
          </div>

          <div
            ref={viewWrapRef}
            key={viewMode}
            data-testid="view-zoom-wrap"
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setViewZoom(null);
            }}
            className={viewZoom ? (viewZoom.mode === "in" ? "view-zoom-in" : "view-zoom-out") : ""}
            style={viewZoom ? { transformOrigin: `${viewZoom.ox}% ${viewZoom.oy}%` } : undefined}
          >
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
                  key={`${viewYear}-${viewMonth}`}
                  data-testid="view-anim"
                  onAnimationEnd={(e) => {
                    if (e.target === e.currentTarget) setNavDir(null);
                  }}
                  className={[
                    "relative grid grid-cols-7 " + (tokens.cellGridGap ?? "gap-1.5"),
                    navDir === "left"
                      ? "anim-slide-in-left"
                      : navDir === "right"
                        ? "anim-slide-in-right"
                        : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
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
                        data-date={key}
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
              <section className="flex flex-col">
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

                <div
                  data-testid="view-anim"
                  onAnimationEnd={(e) => {
                    if (e.target === e.currentTarget) setNavDir(null);
                  }}
                  className={[
                    navDir === "left"
                      ? "anim-slide-in-left"
                      : navDir === "right"
                        ? "anim-slide-in-right"
                        : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <WeekTimeline
                    tokens={tokens}
                    dates={weekDates}
                    eventsByDay={weekEvents}
                    anchorKey={selectedDateKey}
                    today={today}
                    onJumpToMonth={jumpToMonth}
                    onAddDay={openAdd}
                    onEdit={openEdit}
                    onToggleDone={toggleDone}
                    onDelete={deleteEvent}
                    onMove={(id, patch) => updateEvent(id, patch)}
                  />
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

                <div
                  key={viewYear}
                  data-testid="view-anim"
                  onAnimationEnd={(e) => {
                    if (e.target === e.currentTarget) setNavDir(null);
                  }}
                  className={[
                    "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4",
                    navDir === "left"
                      ? "anim-slide-in-left"
                      : navDir === "right"
                        ? "anim-slide-in-right"
                        : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {yearMonths.map((m, mi) => (
                    <div
                      key={m.getMonth()}
                      data-ym={`${viewYear}-${m.getMonth()}`}
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
          {ghost && <GhostLayer ghost={ghost} onDone={() => setGhost(null)} />}
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
              {form.dates.length > 1 && (
                <p className={tokens.dialog.inputLabel + " mt-2"}>
                  将同时添加到 {form.dates.length} 天：{form.dates
                    .map(parseDateKey)
                    .map((d) => `${d.getMonth() + 1}月${d.getDate()}日`)
                    .join("、")}
                </p>
              )}
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
                  <span className={tokens.dialog.inputLabel}>开始时间</span>
                  <input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className={tokens.dialog.input}
                  />
                </label>
                <label htmlFor="endTime" className="block">
                  <span className={tokens.dialog.inputLabel}>结束时间</span>
                  <input
                    id="endTime"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
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
