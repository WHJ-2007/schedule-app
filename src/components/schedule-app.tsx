"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEvents } from "@/lib/use-events";
import {
  WEEKDAY_NAMES,
  toDateKey,
  parseDateKey,
  todayKey,
  parseTimeToMinutes,
  minutesToTime,
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
import {
  expandEventDates,
  isInstanceDone,
  isInstanceExpired,
  markInstanceDone,
  unmarkInstanceDone,
  type RepeatFreq,
  type ScheduleEvent,
} from "@/lib/events";
import { copyViewAsJpeg } from "@/lib/export-image";
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
  onSelectionChange,
  onPostpone,
  onMarkDone,
  onEndEarly,
  onBatchMarkDone,
  onBatchUnmark,
  onStretch,
  onCopy,
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
  onSelectionChange: (ids: string[]) => void;
  onPostpone: (e: ScheduleEvent, dayKey: string) => void;
  onMarkDone: (id: string, dayKey: string) => void;
  onEndEarly: (id: string, dayKey: string) => void;
  onBatchMarkDone?: (ids: string[]) => void;
  onBatchUnmark?: (ids: string[]) => void;
  onStretch: (id: string, date: string, until: string) => void;
  onCopy: (e: ScheduleEvent) => void;
}) {
  // dates 数组必须稳定引用：WeekTimeline 的「翻周清空选中」effect 依赖它，
  // 每次新建引用会导致清空选中 → 父层联动关闭编辑表单
  const dayDates = useMemo(() => [parseDateKey(dateKey)], [dateKey]);
  // 看板时间轴缩放：默认 0.8（每小时 24px）让月视图一屏放完不滚动；Ctrl+滚轮仍可独立缩放
  const [panelZoom, setPanelZoom] = useState(0.8);
  // 编辑中的日程正在进行的判定：今天此刻在起止区间内且未完成，才显示「提前结束」
  const editingEvent = form?.id ? dayEvents.find((e) => e.id === form.id) : undefined;
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const canEndEarly =
    !!editingEvent &&
    !isInstanceDone(editingEvent, dateKey) &&
    dateKey === toDateKey(today) &&
    !!editingEvent.time &&
    parseTimeToMinutes(editingEvent.time) <= nowMin &&
    nowMin < parseTimeToMinutes(editingEvent.endTime ?? "");
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
              canEndEarly={canEndEarly}
              onEndEarly={() => {
                if (form.id) onEndEarly(form.id, dateKey);
                onClose();
              }}
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
            onSelectionChange={onSelectionChange}
            onPostpone={onPostpone}
            onMarkDone={onMarkDone}
            onEndEarly={onEndEarly}
            onBatchMarkDone={onBatchMarkDone}
            onBatchUnmark={onBatchUnmark}
            onStretch={onStretch}
            onCopy={onCopy}
            cols={1}
            zoom={panelZoom}
            onZoomChange={setPanelZoom}
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
    updateEvents,
    deleteEvent,
    deleteEvents,
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // 周视图选中组（Delete 键删除用）
  const [weekZoom, setWeekZoom] = useState(1); // 周视图时间轴缩放倍率（0.5–3，步进 0.25）
  const zoomIn = () => setWeekZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100));
  const zoomOut = () => setWeekZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100));
  const [playerOpen, setPlayerOpen] = useState(false); // 版本播放条开关
  const [toast, setToast] = useState<{ text: string; undoIndex?: number } | null>(null);
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
  const gridRef = useRef<HTMLDivElement | null>(null); // 月视图日历格（截图目标）
  const weekShotRef = useRef<HTMLDivElement | null>(null); // 周视图时间轴（截图目标）
  const yearShotRef = useRef<HTMLDivElement | null>(null); // 年视图 12 月卡（截图目标）
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

  // 删除入口统一：右键菜单/编辑面板/胶囊与 Delete 键一致，弹出撤销条
  const deleteWithToast = (id: string) => {
    deleteEvent(id);
    setSelectedIds([]);
    setToast({ text: "已删除 1 条日程", undoIndex: indexRef.current });
  };

  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = new Date();
  // 周视图右侧：只在编辑时显示表单（多选/框选不打开侧边栏）。
  // 区分「重复日程多选」（点击单个实例，同 id 全部高亮但语义是单选 → 开表单）与
  // 「真正多选」（框选多个不同 id → 无表单 → 折叠）
  const showWeekDayPanel = viewMode === "week" && form !== null;
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
  // 周视图右侧表单：编辑中的日程正在进行的时段才显示「提前结束」（只标记完成，计划不变）
  const weekEditing = form?.id ? weekEvents.flat().find((e) => e.id === form.id) : undefined;
  const weekNowMin = today.getHours() * 60 + today.getMinutes();
  const weekCanEndEarly =
    !!weekEditing &&
    !weekEditing.done &&
    form?.dates[0] === toDateKey(today) &&
    !!weekEditing.time &&
    parseTimeToMinutes(weekEditing.time) <= weekNowMin &&
    weekNowMin < parseTimeToMinutes(weekEditing.endTime ?? "");
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
        ? { on: true, freq: e.repeat.freq, until: e.repeat.until ?? "", interval: e.repeat.interval ?? 1 }
        : { on: false, freq: "", until: "", interval: 1 },
      color: e.color ?? "",
    });
  };

  const handleSave = () => {
    if (!form) return;
    const title = form.title.trim();
    if (!title) return;
    // 重复规则：频率空 → 不重复；重复开始即事件日期（表单"重复开始"可改）；
    // 重复至留空 = 无限重复（展开时由视图范围兜底）；
    // 重复至早于开始日期时钳制为开始日，避免重复塌缩成单实例
    const repeat =
      form.repeat.on && form.repeat.freq
        ? {
            freq: form.repeat.freq as RepeatFreq,
            until: form.repeat.until
              ? form.repeat.until < form.dates[0]
                ? form.dates[0]
                : form.repeat.until
              : undefined,
            interval: form.repeat.freq === "daily" ? form.repeat.interval : undefined,
          }
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

  // 菜单「标记为未完成」：取消完成标记。重复日程只取消右键实例（doneDates 移除该日）
  const postponeEvent = (e: ScheduleEvent, dayKey: string) => {
    updateEvent(e.id, unmarkInstanceDone(e, dayKey));
    setToast({ text: `已标记为未完成：「${e.title}」` });
  };
  // 菜单「标记为已完成」：已过期未完成的日程标记为已完成，计划时间不变。
  // 重复日程只标记右键实例（doneDates 记该日），不涉及全部重复
  const markDone = (id: string, dayKey: string) => {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    updateEvent(id, markInstanceDone(e, dayKey));
    setToast({ text: `已标记为已完成：「${e.title}」` });
  };
  const endEarly = (id: string, dayKey: string) => {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    updateEvent(id, markInstanceDone(e, dayKey)); // 提前做完只标记完成，计划时间不变
    setToast({ text: `已标注为完成：「${e.title}」` });
  };
  // 多选右键「批量标记为已完成」：作用于全部选中日程；重复日程 done=true = 所有实例完成
  const batchMarkDone = (ids: string[]) => {
    updateEvents(ids, { done: true });
    setToast({ text: `已标记 ${ids.length} 项日程为已完成` });
  };
  // 多选右键「批量标记为未完成」：全部选中日程取消完成（重复日程连同实例级记录一起清掉）
  const batchUnmark = (ids: string[]) => {
    updateEvents(ids, { done: false, doneDates: undefined });
    setToast({ text: `已标记 ${ids.length} 项日程为未完成` });
  };

  // 横向拖宽：事件自动改为每天重复（起点 date、截止 until，时间不变）。
  // 已完成（全局 done）的事件变重复后只有原来那天算完成（doneDates 记原日期），
  // 新实例不继承完成——重复到明天/后天显然还没做；逾期未完成无需处理（过期按实例日现算）
  const stretchEvent = (id: string, date: string, until: string) => {
    const ev = events.find((x) => x.id === id);
    if (!ev) return;
    const patch: Partial<Omit<ScheduleEvent, "id">> = { date, repeat: { freq: "daily", until } };
    if (ev.done) {
      patch.done = false;
      patch.doneDates = [ev.date];
    }
    updateEvent(id, patch);
    setToast({ text: `已改为每天重复：「${ev.title}」（${date} 至 ${until}）` });
  };

  // 复制：同一天时间 +1 小时（跨天顺延到次日，时长不变），不带重复规则
  const copyEvent = (e: ScheduleEvent) => {
    const sMin = parseTimeToMinutes(e.time);
    const dur = (e.endTime ? parseTimeToMinutes(e.endTime) : sMin + 60) - sMin;
    const ns = sMin + 60;
    const [y, m, d] = e.date.split("-").map(Number);
    const nd = new Date(y, m - 1, d);
    nd.setDate(nd.getDate() + Math.floor(ns / 1440)); // 跨天顺延次日
    const nsDay = ns % 1440;
    const neDay = nsDay + dur;
    addEvent({
      title: e.title,
      date: toDateKey(nd),
      time: minutesToTime(nsDay),
      endTime: neDay < 1440 ? minutesToTime(neDay) : undefined,
      description: e.description,
      color: e.color,
    });
    setToast({ text: `已复制：「${e.title}」（${toDateKey(nd)} ${minutesToTime(nsDay)} 开始）` });
  };

  // 一键导出：当前视图（月/周/年）内容区渲染成 JPG 复制到剪贴板
  const handleExport = async () => {
    const node =
      viewMode === "month" ? gridRef.current : viewMode === "week" ? weekShotRef.current : yearShotRef.current;
    if (!node) return;
    try {
      const result = await copyViewAsJpeg(node);
      setToast({
        text:
          result === "copied"
            ? "已复制日程图片到剪贴板（JPG）"
            : "浏览器不支持剪贴板图片，已下载为 JPG 文件",
      });
    } catch (err) {
      console.error("导出失败", err);
      setToast({ text: `导出失败：${err instanceof Error ? err.message : String(err)}` });
    }
  };

  return (
    <main className={"anim-fade-in " + tokens.main}>
      {tokens.decorations}
      {tokens.sidebar}
      <div className={tokens.contentClass}>
        <div className="relative z-10 mx-auto max-w-5xl px-6 py-10">
          <header className="mb-10">
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
              <button
                type="button"
                onClick={handleExport}
                aria-label="导出图片"
                className={tokens.navButton}
              >
                导出
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
            <div className="grid gap-6 lg:grid-cols-[3fr_1fr]">
              {/* 月历 */}
              <section className={tokens.viewPanel}>
                <div className="mb-2 flex items-center justify-between">
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

                <div className="mb-0.5 grid grid-cols-7 gap-1.5">
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
                    "relative grid grid-cols-7 " + (tokens.cellGridGap ?? "gap-x-1.5 gap-y-0.5"),
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
                              {dayList.slice(0, indicatorCap).map((e) => {
                                const instDone = isInstanceDone(e, key);
                                const expired = !instDone && isInstanceExpired(e, key, today);
                                return (
                                <span
                                  key={e.id}
                                  className={tokens.cell.eventChip + (instDone ? " line-through" : "")}
                                  style={{
                                    backgroundColor: instDone
                                      ? "rgba(124,162,140,0.5)"
                                      : expired
                                        ? "rgba(185,96,84,0.45)"
                                        : e.color
                                          ? e.color + "14"
                                          : undefined,
                                    borderLeft: instDone
                                      ? "3px solid rgb(44,98,70)"
                                      : expired
                                        ? "3px solid rgb(150,56,48)"
                                        : e.color
                                          ? `3px solid ${e.color}`
                                          : undefined,
                                  }}
                                >
                                  {e.title}
                                </span>
                                );
                              })}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-y-0.5">
                              {dayList.slice(indicatorCap, indicatorCap * 2).map((e) => {
                                const instDone = isInstanceDone(e, key);
                                const expired = !instDone && isInstanceExpired(e, key, today);
                                return (
                                <span
                                  key={e.id}
                                  className={tokens.cell.eventChip + (instDone ? " line-through" : "")}
                                  style={{
                                    backgroundColor: instDone
                                      ? "rgba(124,162,140,0.5)"
                                      : expired
                                        ? "rgba(185,96,84,0.45)"
                                        : e.color
                                          ? e.color + "14"
                                          : undefined,
                                    borderLeft: instDone
                                      ? "3px solid rgb(44,98,70)"
                                      : expired
                                        ? "3px solid rgb(150,56,48)"
                                        : e.color
                                          ? `3px solid ${e.color}`
                                          : undefined,
                                  }}
                                >
                                  {e.title}
                                </span>
                                );
                              })}
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
                  deleteWithToast(id);
                  setForm(null);
                }}
                onClose={() => setForm(null)}
                onAddDay={openAdd}
                onEdit={openEdit}
                onToggleDone={toggleDone}
                onMoveAll={applyMoveAll}
                onSelectionChange={setSelectedIds}
                onPostpone={postponeEvent}
                onMarkDone={markDone}
                onEndEarly={endEarly}
                onBatchMarkDone={batchMarkDone}
                onBatchUnmark={batchUnmark}
                onStretch={stretchEvent}
                onCopy={copyEvent}
              />
            </div>
            )}
            {viewMode === "week" && (
              <div
                data-testid="week-grid"
                className={
                  "grid gap-6 transition-[grid-template-columns] duration-300 " +
                  (showWeekDayPanel ? "lg:grid-cols-[2fr_1fr]" : "lg:grid-cols-[1fr_0fr]")
                }
              >
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
                      <span className="mx-0.5 h-5 w-px bg-neutral-200" />
                      <button type="button" onClick={zoomOut} aria-label="缩小" className={tokens.navButton}>
                        −
                      </button>
                      <button type="button" onClick={zoomIn} aria-label="放大" className={tokens.navButton}>
                        ＋
                      </button>
                    </div>
                  </div>

                  <div
                    ref={weekShotRef}
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
                      onDelete={deleteWithToast}
                      onMoveAll={applyMoveAll}
                      onSelectionChange={setSelectedIds}
                      onPostpone={postponeEvent}
                      onMarkDone={markDone}
                      onEndEarly={endEarly}
                      onBatchMarkDone={batchMarkDone}
                      onBatchUnmark={batchUnmark}
                      onStretch={stretchEvent}
                      onCopy={copyEvent}
                      zoom={weekZoom}
                      onZoomChange={setWeekZoom}
                    />
                  </div>
                </section>
                {/* 编辑时右侧只显示表单（不显示单日时间轴/日期标签）；无编辑内容时折叠 */}
                {form && (
                  <div className="min-w-0 overflow-hidden transition-opacity duration-300 opacity-100">
                    <EventPanel
                      inline
                      form={form}
                      tokens={tokens}
                      onChange={setForm}
                      onSave={handleSave}
                      onDelete={(id) => {
                        deleteWithToast(id);
                        setForm(null);
                      }}
                      onClose={() => setForm(null)}
                      canEndEarly={weekCanEndEarly}
                      onEndEarly={() => {
                        if (form.id) endEarly(form.id, form.dates[0]);
                        setForm(null);
                      }}
                    />
                  </div>
                )}
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
                  ref={yearShotRef}
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
                          const isToday = isSameDay(d, today);
                          return (
                            <button
                              key={toDateKey(d)}
                              type="button"
                              onClick={() => jumpToMonth(d)}
                              aria-label={`${d.getMonth() + 1}月${d.getDate()}日`}
                              className={
                                tokens.yearView.miniCell +
                                (isToday ? " " + tokens.yearView.todayMark : "")
                              }
                            >
                              {d.getDate()}
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
          canUndo={toast.undoIndex != null}
          onUndo={() => {
            if (toast.undoIndex != null) jumpToIndex(toast.undoIndex);
            setToast(null);
          }}
        />
      )}
    </main>
  );
}
