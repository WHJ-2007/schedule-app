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
import type { EventMovePatch } from "@/lib/use-events";
import { getSavedView, saveView, type ViewMode } from "@/lib/views";
import type { ThemeTokens } from "./theme-tokens";
import Settings from "./settings";
import SelectionBubble from "./selection-bubble";
import WeekTimeline from "./week-timeline";
import EventPanel, { emptyForm, type FormState } from "./event-panel";
import UndoToast from "./undo-toast";
import VersionPlayer from "./version-player";

// 单日看板：日期标签 +（编辑时）内嵌表单 + 单日时间轴同屏。
// 必须在模块顶层定义：ScheduleApp 内定义会随父重渲染换函数身份，导致 WeekTimeline 重挂载丢失状态
function DayPanel({
  tokens,
  dateKey,
  dayEvents,
  today,
  form,
  onFormChange,
  onSave,
  onDelete,
  onClose,
  onAddDay,
  onEdit,
  onToggleDone,
  onMoveAll,
  onBatchColor,
  onSelectionChange,
}: {
  tokens: ThemeTokens;
  dateKey: string;
  dayEvents: ScheduleEvent[];
  today: Date;
  form: FormState | null;
  onFormChange: (f: FormState) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onAddDay: (dates: string[], time?: string, endTime?: string) => void;
  onEdit: (e: ScheduleEvent) => void;
  onToggleDone: (id: string) => void;
  onMoveAll: (patches: EventMovePatch[]) => void;
  onBatchColor: (ids: string[], color: string) => void;
  onSelectionChange: (ids: string[]) => void;
}) {
  // dates 数组必须稳定引用：WeekTimeline 的「翻周清空选中」effect 依赖它，
  // 每次新建引用会导致清空选中 → 父层联动关闭编辑表单
  const dayDates = useMemo(() => [parseDateKey(dateKey)], [dateKey]);
  return (
    <section className={tokens.card + " flex flex-col"}>
      <p className={tokens.dayList.dateLabel}>{formatDayLabel(parseDateKey(dateKey))}</p>
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
        {form && form.dates[0] === dateKey && (
          <div className="anim-fade-in flex max-h-[55%] min-h-0 flex-col">
            <EventPanel
              inline
              form={form}
              tokens={tokens}
              onChange={onFormChange}
              onSave={onSave}
              onDelete={onDelete}
              onClose={onClose}
            />
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <WeekTimeline
            tokens={tokens}
            dates={dayDates}
            eventsByDay={[dayEvents]}
            anchorKey={dateKey}
            today={today}
            onJumpToMonth={() => {}}
            onAddDay={onAddDay}
            onEdit={onEdit}
            onToggleDone={onToggleDone}
            onDelete={onDelete}
            onMoveAll={onMoveAll}
            onBatchColor={onBatchColor}
            onSelectionChange={onSelectionChange}
            cols={1}
            rootClass="min-h-0 flex-1"
            scrollClass="min-h-0 flex-1"
            scrollMaxHeight="none"
          />
        </div>
      </div>
    </section>
  );
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
    fast: boolean;
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
      className={
        "pointer-events-none absolute z-40 overflow-hidden " +
        (ghost.fast ? "anim-ghost-morph-fast" : "anim-ghost-morph")
      }
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
    deleteEvents,
    toggleDone,
    replaceEvents,
    applyMoveAll,
    setEventColors,
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // 周视图选中组（Delete 键删除用）
  const [playerOpen, setPlayerOpen] = useState(false); // 版本播放条开关
  const [toast, setToast] = useState<{ text: string; undoIndex: number } | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
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
    fast: boolean; // 月→周/周→月使用更快的淡出变体，突出飞行的 7 个数字
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
  const dayNumSrcRef = useRef<
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
    // 残影只是视觉快照：移除测试钩子（含自身），避免克隆副本干扰 getByTestId 等查询；
    // 视图主体圈定标记（view-anim）换成 data-ghost-anim 保留，供测试区分 7 列与看板位
    for (const el of [node, ...Array.from(node.querySelectorAll("[data-testid]"))]) {
      if (el.getAttribute("data-testid") === "view-anim") el.setAttribute("data-ghost-anim", "");
      el.removeAttribute("data-testid");
    }
    // 交互辅助层（月历选中高亮等）不属于内容：残影缩放时剔除，避免异常残留
    node.querySelectorAll('[data-testid="selection-bubble"]').forEach((el) => el.remove());
    const pr = wrap.parentElement?.getBoundingClientRect();
    const r = wrap.getBoundingClientRect();
    let src: { ax: number; ay: number; aw: number; ah: number } | null = null;
    if (anchor) {
      // 锚点只在视图主体（view-anim）内查：看板位（DayPanel）也有 data-date，
      // 混入并集会拉偏残影终点/缩放中心
      const sel =
        anchor.kind === "week"
          ? (days ?? weekDates)
              .map((d) => `[data-testid="view-anim"] [data-date="${toDateKey(d)}"]`)
              .join(",")
          : anchor.kind === "date"
            ? `[data-testid="view-anim"] [data-date="${anchor.key}"]`
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
      fast: weekNumFlyPendingRef.current,
      src,
    });
  };

  useEffect(() => {
    setViewMode(getSavedView());
  }, []);

  // 选中为空（点空白折叠）时关闭编辑面板
  useEffect(() => {
    if (selectedIds.length === 0) setForm(null);
  }, [selectedIds]);

  // 撤销 toast 5 秒自动消失
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Delete 键删除选中日程；ESC 返回上级视图（周→月、月→年），编辑面板打开时先关面板
  // （输入框/文本编辑中不触发）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Escape") {
        if (formRef.current) {
          setForm(null);
          return;
        }
        const v = viewModeRef.current;
        if (v === "week") pickViewRef.current("month");
        else if (v === "month") pickViewRef.current("year");
        return;
      }
      if (e.key !== "Delete") return;
      const ids = selectedIdsRef.current;
      if (ids.length === 0) return;
      deleteEvents(ids);
      setSelectedIds([]);
      // undoIndex = 删除前快照的索引（deleteEvents 的 pushSnapshot 已把索引指向删除前）
      setToast({ text: `已删除 ${ids.length} 条日程`, undoIndex: indexRef.current });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteEvents]);

  // jumpToIndex 需要引用当前索引（toast 撤销）
  const indexRef = useRef(index);
  indexRef.current = index;

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

  // 视图切换时记录 7 个日期数字的位置与克隆（月→周：月历格；周→月：周列头）。
  // 月视图与周视图都以 [data-testid="view-anim"] 圈定自己的日期数字区域，
  // 避免月视图当日面板列头（同 key）干扰。days 缺省为本周；跨月边界缺失的格子自动跳过
  const captureDayNumbers = (days: Date[] = weekDates) => {
    const wrap = viewWrapRef.current;
    if (!wrap) return;
    const out: { key: string; x: number; y: number; w: number; h: number; node: HTMLElement }[] = [];
    for (const d of days) {
      const key = toDateKey(d);
      const el = wrap.querySelector<HTMLElement>(
        `[data-testid="view-anim"] [data-day-num="${key}"]`
      );
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
    dayNumSrcRef.current = out;
  };

  const pickView = (v: ViewMode) => {
    const from = viewMode;
    // 源锚点：月→周=本周 7 格区域；年→月=年历里正在查看的月卡。其余方向残影回退到新视图锚点
    let anchor: AnchorSpec | null = null;
    if (from === "month" && v === "week") {
      anchor = { kind: "week" };
      weekNumFlyPendingRef.current = true;
      captureDayNumbers();
    } else if (from === "year" && v === "month") {
      anchor = { kind: "month", key: `${viewYear}-${viewMonth}` };
    } else if (from === "week" && v === "month") {
      // 周→月镜像：7 个数字从周列头飞回月历对应日期格，残影同样缩向本周 7 列区域
      anchor = { kind: "week" };
      weekNumFlyPendingRef.current = true;
      captureDayNumbers();
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

  // ESC 键切换视图：keydown 监听只挂一次，经 ref 取最新视图/面板/切换函数（pickView 声明在后）
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const formRef = useRef(form);
  formRef.current = form;
  const pickViewRef = useRef(pickView);
  pickViewRef.current = pickView;

  // 月视图双击日期：跳到该日所在周，动画与月→周切换一致。
  // 捕获阶段旧月视图还显示着，用目标周的 7 天做残影锚点与数字飞行源（跨月缺失的格子自动跳过）
  const openWeekFromDay = (d: Date) => {
    const targetKey = toDateKey(d);
    const targetWeek = getWeekDates(d);
    // pending 先于 captureGhost：残影才能用快速淡出变体（与 tab 切换的月→周一致）
    weekNumFlyPendingRef.current = true;
    captureDayNumbers(targetWeek);
    captureGhost({ kind: "week" }, targetWeek);
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
      // 同样限定 view-anim：避开看板位里同 key 的 data-date
      const el = wrap.querySelector<HTMLElement>(
        a.kind === "date"
          ? `[data-testid="view-anim"] [data-date="${a.key}"]`
          : `[data-ym="${a.key}"]`
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
      for (const s of dayNumSrcRef.current) {
        const el = wrap.querySelector<HTMLElement>(
          `[data-testid="view-anim"] [data-day-num="${s.key}"]`
        );
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
    // 看板位内嵌编辑：新建表单显示在起始日看板（周视图列头 ＋ /拖选新建时看板跟随）
    setSelectedDateKey(list[0]);
    return setForm({ ...emptyForm(list), time: time ?? "", endTime: endTime ?? "" });
  };
  const openEdit = (e: ScheduleEvent) => {
    // 看板位内嵌编辑：表单与单日时间轴同屏，先把看板切到事件所在日
    setSelectedDateKey(e.date);
    return setForm({
      id: e.id,
      dates: [e.date],
      title: e.title,
      time: e.time,
      endTime: e.endTime ?? "",
      endDate: e.endDate ?? "",
      description: e.description,
      repeat: e.repeat
        ? { on: true, freq: e.repeat.freq, until: e.repeat.until ?? "" }
        : { on: false, freq: "", until: "" },
      color: e.color ?? "",
    });
  };

  const handleSave = () => {
    if (!form) return;
    const title = form.title.trim();
    if (!title) return;
    // 重复规则：频率空 → 不重复；重复开始即事件日期（表单"重复开始"可改）；
    // 重复至留空 = 无限重复（展开时由视图范围兜底）
    const repeat =
      form.repeat.on && form.repeat.freq
        ? { freq: form.repeat.freq as RepeatFreq, until: form.repeat.until || undefined }
        : undefined;
    if (form.id) {
      updateEvent(form.id, {
        title,
        date: form.dates[0], // 编辑时"重复开始"改动会迁移整组起始日
        time: form.time,
        endTime: form.endTime || undefined,
        endDate: form.time ? undefined : form.endDate || undefined, // 定时事件不跨天
        description: form.description,
        repeat,
        color: form.color || undefined,
      });
    } else {
      for (const d of form.dates) {
        addEvent({
          title,
          date: d,
          time: form.time,
          endTime: form.endTime || undefined,
          endDate: form.time ? undefined : form.endDate || undefined,
          description: form.description,
          repeat,
          color: form.color || undefined,
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
            <div className="relative flex gap-2">
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
              {playerOpen && (
                <VersionPlayer
                  history={history}
                  index={index}
                  onJump={jumpToIndex}
                  onClose={() => setPlayerOpen(false)}
                />
              )}
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
                          <span className={tokens.cell.eventChipArea ?? "mt-1 flex w-full gap-x-0.5 px-0.5"}>
                            {/* 竖排优先，放不下才横向第二列，最多两列 */}
                            <span className="flex min-w-0 flex-1 flex-col gap-y-0.5">
                              {dayList.slice(0, indicatorCap).map((e) => (
                                <span
                                  key={e.id}
                                  className={tokens.cell.eventChip}
                                  style={{
                                    backgroundColor: e.color ? e.color + "14" : undefined,
                                    borderLeft: e.color ? `3px solid ${e.color}` : undefined,
                                  }}
                                >
                                  {e.title}
                                </span>
                              ))}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-y-0.5">
                              {dayList.slice(indicatorCap, indicatorCap * 2).map((e) => (
                                <span
                                  key={e.id}
                                  className={tokens.cell.eventChip}
                                  style={{
                                    backgroundColor: e.color ? e.color + "14" : undefined,
                                    borderLeft: e.color ? `3px solid ${e.color}` : undefined,
                                  }}
                                >
                                  {e.title}
                                </span>
                              ))}
                              {dayList.length > indicatorCap * 2 && (
                                <span className={"truncate text-left text-[10px] " + tokens.dotMore}>
                                  +{dayList.length - indicatorCap * 2}
                                </span>
                              )}
                            </span>
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

              {/* 当日日程看板：单列时间轴 + 编辑时内嵌表单（表单与时间轴同屏） */}
              <DayPanel
                tokens={tokens}
                dateKey={selectedDateKey}
                dayEvents={dayEvents}
                today={today}
                form={form}
                onFormChange={setForm}
                onSave={handleSave}
                onDelete={(id) => {
                  deleteEvent(id);
                  setForm(null);
                }}
                onClose={() => setForm(null)}
                onAddDay={openAdd}
                onEdit={openEdit}
                onToggleDone={toggleDone}
                onMoveAll={applyMoveAll}
                onBatchColor={setEventColors}
                onSelectionChange={setSelectedIds}
              />
            </div>
            )}
            {viewMode === "week" && (
              <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
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
                      onSelectDate={setSelectedDateKey}
                      selectedDate={selectedDateKey}
                      onAddDay={openAdd}
                      onEdit={openEdit}
                      onToggleDone={toggleDone}
                      onDelete={deleteEvent}
                      onMoveAll={applyMoveAll}
                      onBatchColor={setEventColors}
                      onSelectionChange={setSelectedIds}
                    />
                  </div>
                </section>
                {/* 选中日的单日看板：编辑时表单内嵌，与月视图一致 */}
                <DayPanel
                  tokens={tokens}
                  dateKey={selectedDateKey}
                  dayEvents={sortByTime(byDay.get(selectedDateKey) ?? [])}
                  today={today}
                  form={form}
                  onFormChange={setForm}
                  onSave={handleSave}
                  onDelete={(id) => {
                    deleteEvent(id);
                    setForm(null);
                  }}
                  onClose={() => setForm(null)}
                  onAddDay={openAdd}
                  onEdit={openEdit}
                  onToggleDone={toggleDone}
                  onMoveAll={applyMoveAll}
                  onBatchColor={setEventColors}
                  onSelectionChange={setSelectedIds}
                />
              </div>
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

      <Settings events={events} onImport={replaceEvents} />
      {toast && (
        <UndoToast
          text={toast.text}
          onUndo={() => {
            jumpToIndex(toast.undoIndex);
            setToast(null);
          }}
        />
      )}
    </main>
  );
}
