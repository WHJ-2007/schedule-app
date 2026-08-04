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
import { expandEventDates, type RepeatFreq, type ScheduleEvent } from "@/lib/events";
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
  repeat: { freq: RepeatFreq | ""; until: string }; // 重复规则；freq 空 = 不重复
};

function emptyForm(dates: string[]): FormState {
  return { id: null, dates, title: "", time: "", endTime: "", description: "", repeat: { freq: "", until: "" } };
}

function sortByTime(list: ScheduleEvent[]): ScheduleEvent[] {
  return [...list].sort((a, b) => {
    const at = a.time || "99:99";
    const bt = b.time || "99:99";
    return at.localeCompare(bt);
  });
}

// offsetLeft/Top 链坐标（相对 stop 元素）：CSS transform 不影响布局坐标，
// 视图缩放动画期间也能量到元素的真实布局位置（getBoundingClientRect 会包含缩放变换）
function layoutPos(el: HTMLElement, stop: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== stop) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

// 飞行数字容器：把克隆的旧数字节点放入盒内（克隆保留主题样式类）
function NumFlyNode({ node }: { node: HTMLElement }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    ref.current?.replaceChildren(node);
  }, [node]);
  return <div ref={ref} className="h-full w-full" />;
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
  const {
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    toggleDone,
    replaceEvents,
    applyMoveAll,
    undo,
    redo,
    jumpToIndex,
    history,
    index,
    canUndo,
    canRedo,
  } = useEvents();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState(() => todayKey());
  const [form, setForm] = useState<FormState | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false); // 版本播放条开关
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
  // src = 源视图锚点区域（相对 wrap 的像素矩形）：年→月用年历月卡、月→周用本周 7 格合并区域
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
    src: { ax: number; ay: number; aw: number; ah: number } | null;
  } | null;
  const [ghost, setGhost] = useState<Ghost>(null);
  const ghostSrcRef = useRef<{ ax: number; ay: number; aw: number; ah: number } | null>(null);
  // 月→周切换：月历里的 7 个日期数字克隆飞向周视图对应列头（先行），周视图随后从锚点展开
  type WeekNumFlyItem = {
    key: string;
    x: number;
    y: number;
    w: number;
    h: number;
    tx: number;
    ty: number;
    s: number;
    node: HTMLElement;
  };
  const [weekNumFly, setWeekNumFly] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    items: WeekNumFlyItem[];
  } | null>(null);
  const weekNumFlyPendingRef = useRef(false);
  const weekNumSrcRef = useRef<
    { key: string; x: number; y: number; w: number; h: number; node: HTMLElement }[]
  >([]);

  // 锚点规格：date = 单日 data-date；month = 年历月卡 data-ym；week = 本周 7 格合并区域
  type AnchorSpec = { kind: "date" | "month" | "week"; key?: string };

  // 切换前克隆旧视图容器：残影固定在原位置；父容器相对坐标（滚动时残影跟随内容）。
  // 锚点优先取源视图坐标（此时旧视图还在 DOM）：月→周=本周 7 格、年→月=被点月卡，
  // 残影缩向那里、新视图从同一位置展开，两个方向的数字/月卡位置才能对上。
  // days 可指定目标周（双击跳周等场景：残影缩向目标周的 7 格，而非当前选中周）
  const captureGhost = (anchor: AnchorSpec | null = null, days?: Date[]) => {
    const wrap = viewWrapRef.current;
    if (!wrap) return;
    const node = wrap.cloneNode(true) as HTMLElement;
    // 残影只是视觉快照：移除测试钩子（含自身），避免克隆副本干扰 getByTestId 等查询
    for (const el of [node, ...Array.from(node.querySelectorAll("[data-testid]"))]) {
      el.removeAttribute("data-testid");
    }
    // 交互辅助层（月历选中高亮等）不属于内容：残影缩放时剔除，避免异常残留
    node.querySelectorAll('[data-testid="selection-bubble"]').forEach((el) => el.remove());
    const pr = wrap.parentElement?.getBoundingClientRect();
    const r = wrap.getBoundingClientRect();
    let src: { ax: number; ay: number; aw: number; ah: number } | null = null;
    if (anchor) {
      const sel =
        anchor.kind === "week"
          ? (days ?? weekDates).map((d) => `[data-date="${toDateKey(d)}"]`).join(",")
          : anchor.kind === "date"
            ? `[data-date="${anchor.key}"]`
            : `[data-ym="${anchor.key}"]`;
      const els = wrap.querySelectorAll(sel);
      if (els.length > 0) {
        let l = Infinity;
        let t = Infinity;
        let rr = -Infinity;
        let b = -Infinity;
        for (const el of els) {
          const rc = el.getBoundingClientRect();
          l = Math.min(l, rc.left);
          t = Math.min(t, rc.top);
          rr = Math.max(rr, rc.right);
          b = Math.max(b, rc.bottom);
        }
        if (rr > l || b > t) src = { ax: l - r.left, ay: t - r.top, aw: rr - l, ah: b - t };
      }
    }
    ghostSrcRef.current = src;
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
      src,
    });
  };

  useEffect(() => {
    setViewMode(getSavedView());
  }, []);

  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = new Date();
  const selectedDate = parseDateKey(selectedDateKey);
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDateKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // 无限重复（无 until）的展开兜底：只展开到当前视图可见的最远日期，避免无限展开
  const byDayHorizon = useMemo(() => {
    if (viewMode === "year") return `${viewYear}-12-31`;
    if (viewMode === "week") return toDateKey(weekDates[6]);
    return toDateKey(grid[grid.length - 1]);
  }, [viewMode, viewYear, weekDates, grid]);
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      // 重复事件展开到全部实例日期（同一条记录，编辑/删除/完成作用于整组）
      for (const d of expandEventDates(e, byDayHorizon)) {
        const arr = m.get(d) ?? [];
        arr.push(e);
        m.set(d, arr);
      }
    }
    return m;
  }, [events, byDayHorizon]);
  const weekEvents = useMemo(
    () => weekDates.map((d) => sortByTime(byDay.get(toDateKey(d)) ?? [])),
    [weekDates, byDay]
  );
  const dayEvents = sortByTime(byDay.get(selectedDateKey) ?? []);
  const indicatorCap = tokens.cell.indicatorCap ?? 3; // 每日小卡片上限

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

  // 月→周：记录目标周 7 个日期数字在月历格里的位置与克隆（相对 wrap 的布局坐标）。
  // days 缺省为本周；双击跳周时传目标周（跨月边界缺失的格子自动跳过）
  const captureWeekNumbers = (days: Date[] = weekDates) => {
    const wrap = viewWrapRef.current;
    const grid = gridRef.current;
    if (!wrap || !grid) return;
    const out: { key: string; x: number; y: number; w: number; h: number; node: HTMLElement }[] = [];
    for (const d of days) {
      const key = toDateKey(d);
      const el = grid.querySelector<HTMLElement>(`[data-day-num="${key}"]`);
      if (!el) continue;
      const p = layoutPos(el, wrap);
      out.push({
        key,
        x: p.x,
        y: p.y,
        w: el.offsetWidth,
        h: el.offsetHeight,
        node: el.cloneNode(true) as HTMLElement,
      });
    }
    weekNumSrcRef.current = out;
  };

  const pickView = (v: ViewMode) => {
    const from = viewMode;
    // 源锚点：月→周=本周 7 格区域；年→月=年历里正在查看的月卡。其余方向残影回退到新视图锚点
    let anchor: AnchorSpec | null = null;
    if (from === "month" && v === "week") {
      anchor = { kind: "week" };
      weekNumFlyPendingRef.current = true;
      captureWeekNumbers();
    } else if (from === "year" && v === "month") {
      anchor = { kind: "month", key: `${viewYear}-${viewMonth}` };
    } else if (from === "week" && v === "month") {
      // 周视图残影缩向本周 7 列区域，与月→周对称
      anchor = { kind: "week" };
    }
    captureGhost(anchor);
    saveView(v);
    if (v === "month" && from !== "year") {
      // 周→月等：定位到选中日期所在月（保证锚点日期在网格内）；年→月保持正在查看的年月
      setViewYear(selectedDate.getFullYear());
      setViewMonth(selectedDate.getMonth());
    }
    zoomAnchorRef.current = {
      mode: zoomModeFor(from, v),
      kind: v === "year" ? "month" : "date",
      key: v === "year" ? `${viewYear}-${viewMonth}` : toDateKey(selectedDate),
    };
    setViewMode(v);
  };

  // 月视图双击日期：跳到该日所在周，动画与月→周切换一致。
  // 捕获阶段旧月视图还显示着，用目标周的 7 天做残影锚点与数字飞行源（跨月缺失的格子自动跳过）
  const openWeekFromDay = (d: Date) => {
    const targetKey = toDateKey(d);
    const targetWeek = getWeekDates(d);
    captureGhost({ kind: "week" }, targetWeek);
    weekNumFlyPendingRef.current = true;
    captureWeekNumbers(targetWeek);
    saveView("week");
    setSelectedDateKey(targetKey);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    zoomAnchorRef.current = { mode: "in", kind: "date", key: targetKey };
    setViewMode("week");
  };

  const jumpToMonth = (d: Date) => {
    const from = viewMode;
    // 从年历点月卡/迷你日期：残影缩向被点的那张月卡
    const anchor: AnchorSpec | null =
      from === "year" ? { kind: "month", key: `${d.getFullYear()}-${d.getMonth()}` } : null;
    captureGhost(anchor);
    setNavDir(null);
    const year = d.getFullYear();
    const month = d.getMonth();
    setViewYear(year);
    setViewMonth(month);
    setSelectedDateKey(toDateKey(d));
    zoomAnchorRef.current = {
      mode: zoomModeFor(from, "month"),
      kind: "date",
      key: toDateKey(d),
    };
    setViewMode("month");
  };

  // 新视图渲染后确定锚点与缩放中心。优先用源视图锚点（captureGhost 已记录，
  // 相对 wrap 顶左的像素坐标：wrap 位置不随切换移动，像素 origin 与残影终点严格同屏），
  // 否则回退到新视图里实测锚点元素；都测不到（jsdom 等）回退中心
  useLayoutEffect(() => {
    const a = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (!a) return;
    const wrap = viewWrapRef.current;
    if (!wrap) {
      setViewZoom(null);
      return;
    }
    let ox: number | null = null;
    let oy: number | null = null;
    const src = ghostSrcRef.current;
    ghostSrcRef.current = null;
    if (src) {
      ox = src.ax + src.aw / 2;
      oy = src.ay + src.ah / 2;
      setGhost((g) =>
        g
          ? {
              ...g,
              // 残影中心移到锚点区域中心、缩到区域宽度比例（旧视图"缩小放进那个位置"）
              tx: src.ax + src.aw / 2 - g.w / 2,
              ty: src.ay + src.ah / 2 - g.h / 2,
              s: src.aw / g.w,
            }
          : g
      );
    } else {
      const el = wrap.querySelector<HTMLElement>(
        a.kind === "date" ? `[data-date="${a.key}"]` : `[data-ym="${a.key}"]`
      );
      if (el) {
        const wr = wrap.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        if (wr.width > 0 && wr.height > 0 && (r.width > 0 || r.height > 0)) {
          ox = r.left + r.width / 2 - wr.left;
          oy = r.top + r.height / 2 - wr.top;
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
    }
    setViewZoom({ mode: a.mode, ox: ox ?? wrap.offsetWidth / 2, oy: oy ?? wrap.offsetHeight / 2 });
    // 月→周：测量 7 个日期数字在周视图列头的位置，生成飞行轨迹
    if (weekNumFlyPendingRef.current) {
      weekNumFlyPendingRef.current = false;
      const items: WeekNumFlyItem[] = [];
      for (const s of weekNumSrcRef.current) {
        const el = wrap.querySelector<HTMLElement>(`[data-day-num="${s.key}"]`);
        if (!el) continue;
        const t = layoutPos(el, wrap);
        items.push({
          key: s.key,
          x: s.x,
          y: s.y,
          w: s.w,
          h: s.h,
          tx: t.x - s.x,
          ty: t.y - s.y,
          s: s.w > 0 && el.offsetWidth > 0 ? Math.max(0.5, Math.min(2, el.offsetWidth / s.w)) : 1,
          node: s.node,
        });
      }
      setWeekNumFly(
        items.length > 0
          ? { x: wrap.offsetLeft, y: wrap.offsetTop, w: wrap.offsetWidth, h: wrap.offsetHeight, items }
          : null
      );
    }
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
      repeat: e.repeat
        ? { freq: e.repeat.freq, until: e.repeat.until ?? "" }
        : { freq: "", until: "" },
    });

  const handleSave = () => {
    if (!form) return;
    const title = form.title.trim();
    if (!title) return;
    // 重复规则：频率空 → 不重复；重复开始即事件日期（表单"重复开始"可改）；
    // 重复至留空 = 无限重复（展开时由视图范围兜底）
    const repeat = form.repeat.freq
      ? { freq: form.repeat.freq as RepeatFreq, until: form.repeat.until || undefined }
      : undefined;
    if (form.id) {
      updateEvent(form.id, {
        title,
        date: form.dates[0], // 编辑时"重复开始"改动会迁移整组起始日
        time: form.time,
        endTime: form.endTime || undefined,
        description: form.description,
        repeat,
      });
    } else {
      for (const d of form.dates) {
        addEvent({
          title,
          date: d,
          time: form.time,
          endTime: form.endTime || undefined,
          description: form.description,
          repeat,
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

          <div className="mb-6 flex items-center justify-between">
            <div className="flex gap-2">
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                aria-label="撤销"
                className={tokens.navButton + " disabled:opacity-40"}
              >
                ↶ 撤销
              </button>
              <button
                type="button"
                onClick={() => setPlayerOpen(true)}
                aria-label="版本播放"
                className={tokens.navButton}
              >
                ⏱ 版本
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                aria-label="重做"
                className={tokens.navButton + " disabled:opacity-40"}
              >
                重做 ↷
              </button>
            </div>
          </div>

          <div
            ref={viewWrapRef}
            key={viewMode}
            data-testid="view-zoom-wrap"
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setViewZoom(null);
            }}
            className={"relative " + (viewZoom ? (viewZoom.mode === "in" ? "view-zoom-in" : "view-zoom-out") : "")}
            style={viewZoom ? { transformOrigin: `${viewZoom.ox}px ${viewZoom.oy}px` } : undefined}
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
                    const dayList = sortByTime(byDay.get(key) ?? []);
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
                        onDoubleClick={() => openWeekFromDay(d)}
                        aria-label={`${d.getMonth() + 1}月${d.getDate()}日`}
                        className={
                          tokens.cell.base +
                          " " +
                          (selectedOnCell && isSelected ? tokens.cell.selected : tokens.cell.hover)
                        }
                      >
                        <span
                          data-selected={isSelected ? "" : undefined}
                          data-day-num={key}
                          className={numClass}
                        >
                          {d.getDate()}
                        </span>
                        {dayList.length > 0 && (
                          <span className={tokens.cell.eventChipArea ?? "mt-1 w-full space-y-0.5 px-0.5"}>
                            {dayList.slice(0, indicatorCap).map((e) => (
                              <span key={e.id} className={tokens.cell.eventChip}>
                                {e.title}
                              </span>
                            ))}
                            {dayList.length > indicatorCap && (
                              <span className={"truncate text-left text-[10px] " + tokens.dotMore}>
                                +{dayList.length - indicatorCap}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {/* 切换动画期间隐藏：泡泡不随缩放乱跑，动画结束后重新定位到选中格 */}
                  {viewZoom === null && (
                    <SelectionBubble
                      gridRef={gridRef}
                      className={tokens.cell.num + " " + tokens.cell.selected}
                      label={selectedDate.getDate()}
                    />
                  )}
                </div>
              </section>

              {/* 当日日程：单列时间轴，交互与周视图一致 */}
              <section className={tokens.card + " flex flex-col"}>
                <p className={tokens.dayList.dateLabel}>{formatDayLabel(selectedDate)}</p>
                <div className="mt-4 flex min-h-0 flex-1 flex-col">
                  <WeekTimeline
                    tokens={tokens}
                    dates={[selectedDate]}
                    eventsByDay={[dayEvents]}
                    anchorKey={selectedDateKey}
                    today={today}
                    onJumpToMonth={() => {}}
                    onAddDay={openAdd}
                    onEdit={openEdit}
                    onToggleDone={toggleDone}
                    onDelete={deleteEvent}
                    onMoveAll={applyMoveAll}
                    cols={1}
                    rootClass="min-h-0 flex-1"
                    scrollClass="min-h-0 flex-1"
                    scrollMaxHeight="none"
                  />
                </div>
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
                    onMoveAll={applyMoveAll}
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
          {/* 月→周：日期数字从月历格飞到周视图列头的轨道（浮在残影上方） */}
          {weekNumFly && (
            <div
              data-testid="week-num-fly"
              aria-hidden
              className="pointer-events-none absolute z-50 overflow-hidden"
              style={{ left: weekNumFly.x, top: weekNumFly.y, width: weekNumFly.w, height: weekNumFly.h }}
            >
              {weekNumFly.items.map((f) => (
                <div
                  key={f.key}
                  data-testid="week-num-fly-item"
                  data-day-num={f.key}
                  className="anim-num-fly absolute"
                  style={
                    {
                      left: f.x,
                      top: f.y,
                      width: f.w,
                      height: f.h,
                      "--f-tx": `${f.tx}px`,
                      "--f-ty": `${f.ty}px`,
                      "--f-s": `${f.s}`,
                    } as React.CSSProperties
                  }
                  onAnimationEnd={() => setWeekNumFly(null)}
                >
                  <NumFlyNode node={f.node} />
                </div>
              ))}
            </div>
          )}
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
                <label htmlFor="repeatFreq" className="block">
                  <span className={tokens.dialog.inputLabel}>重复</span>
                  <select
                    id="repeatFreq"
                    value={form.repeat.freq}
                    onChange={(e) =>
                      setForm({ ...form, repeat: { ...form.repeat, freq: e.target.value as RepeatFreq | "" } })
                    }
                    className={tokens.dialog.input}
                  >
                    <option value="">不重复</option>
                    <option value="daily">每天</option>
                    <option value="weekly">每周</option>
                    <option value="monthly">每月</option>
                    <option value="weekday">工作日（周一至周五）</option>
                    <option value="weekend">周末（周六、周日）</option>
                  </select>
                </label>
                {form.repeat.freq !== "" && (
                  <>
                    <div className="flex gap-3">
                      <label htmlFor="repeatStart" className="block flex-1">
                        <span className={tokens.dialog.inputLabel}>重复开始</span>
                        <input
                          id="repeatStart"
                          type="date"
                          value={form.dates[0]}
                          onChange={(e) =>
                            setForm({ ...form, dates: [e.target.value, ...form.dates.slice(1)] })
                          }
                          className={tokens.dialog.input}
                        />
                      </label>
                      <label htmlFor="repeatUntil" className="block flex-1">
                        <span className={tokens.dialog.inputLabel}>重复至</span>
                        <input
                          id="repeatUntil"
                          type="date"
                          value={form.repeat.until}
                          onChange={(e) =>
                            setForm({ ...form, repeat: { ...form.repeat, until: e.target.value } })
                          }
                          className={tokens.dialog.input}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-neutral-400">重复开始默认为所选卡片的开始日期；重复至留空表示无限重复</p>
                  </>
                )}
              </div>
              <div className="mt-6 flex items-center justify-between gap-3">
                {form.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (form.id) deleteEvent(form.id);
                      setForm(null);
                    }}
                    className="text-sm text-red-500 transition hover:text-red-700"
                  >
                    删除
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-3">
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
            </div>
          </form>
        </div>
      )}
      <Settings events={events} onImport={replaceEvents} />
    </main>
  );
}
