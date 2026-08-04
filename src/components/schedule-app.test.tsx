import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import ScheduleApp from "./schedule-app";
import { THEME_TOKENS } from "./theme-tokens";
import {
  getMonthGrid,
  isSameMonth,
  formatDayLabel,
  getWeekDates,
  addDays,
  formatMonthTitle,
  formatYearTitle,
  addMonths,
  toDateKey,
  formatWeekTitle,
} from "@/lib/date";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ScheduleApp (month view)", () => {
  it("渲染月视图与标题", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    expect(screen.getByRole("heading", { name: /极简日程/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /今天/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /添加日程/ })).toBeInTheDocument();
  });

  it("点日期格显示当日标题", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    const now = new Date();
    const grid = getMonthGrid(now.getFullYear(), now.getMonth());
    const counts = new Map<number, number>();
    for (const d of grid) counts.set(d.getDate(), (counts.get(d.getDate()) ?? 0) + 1);
    const target = grid.find(
      (d) => isSameMonth(d, now.getFullYear(), now.getMonth()) && counts.get(d.getDate()) === 1
    )!;
    fireEvent.click(
      screen.getByRole("button", { name: `${target.getMonth() + 1}月${target.getDate()}日` })
    );
    expect(screen.getByText(formatDayLabel(target))).toBeInTheDocument();
  });

  it("添加日程到选中日", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: /添加日程/ }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "测试日程" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(screen.getByText("测试日程")).toBeInTheDocument();
  });
});

describe("ScheduleApp (switcher & week view)", () => {
  // jsdom 不计算布局：模拟周视图 7 列矩形（每列 100px 宽、top 0）
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const col = this.closest("[data-date]") as HTMLElement | null;
        if (col) {
          const idx = Array.from(document.querySelectorAll("[data-date]")).indexOf(col);
          // DOMRect 的 right/bottom 是原型上的访问器，plain 对象必须显式带上
          return {
            left: idx * 100,
            top: 0,
            width: 100,
            height: 0,
            right: (idx + 1) * 100,
            bottom: 0,
          } as DOMRect;
        }
        return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 } as DOMRect;
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("渲染 周/月/年 切换器", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    expect(screen.getByRole("button", { name: "周" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "月" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "年" })).toBeInTheDocument();
  });

  it("点周页签显示 7 天列并持久化", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const now = new Date();
    const week = getWeekDates(now);
    for (const d of week) {
      expect(
        screen.getByRole("button", { name: `跳转到${d.getMonth() + 1}月${d.getDate()}日` })
      ).toBeInTheDocument();
    }
    expect(localStorage.getItem("schedule-view")).toBe("week");
  });

  it("周视图翻周：上一周/下一周日期变化", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: /上一周/ }));
    const prevWeek = getWeekDates(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
    expect(
      screen.getByRole("button", { name: `跳转到${prevWeek[0].getMonth() + 1}月${prevWeek[0].getDate()}日` })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /下一周/ }));
    const nextWeek = getWeekDates(now);
    expect(
      screen.getByRole("button", { name: `跳转到${nextWeek[0].getMonth() + 1}月${nextWeek[0].getDate()}日` })
    ).toBeInTheDocument();
  });

  it("点周视图列头日期切到月视图并选中那天", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const now = new Date();
    const week = getWeekDates(now);
    const target = week[2];
    fireEvent.click(
      screen.getByRole("button", { name: `跳转到${target.getMonth() + 1}月${target.getDate()}日` })
    );
    expect(screen.getByRole("button", { name: "月" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(formatDayLabel(target))).toBeInTheDocument();
  });

  it("周视图点事件直接打开编辑弹窗", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: /添加日程/ }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "周视图事件" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /编辑 周视图事件/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/标题/)).toHaveValue("周视图事件");
  });

  it("周视图列头＋按钮添加到该日", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const now = new Date();
    const week = getWeekDates(now);
    const target = week[3];
    fireEvent.click(
      screen.getByRole("button", { name: `在${target.getMonth() + 1}月${target.getDate()}日添加日程` })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "该日新增" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: `跳转到${target.getMonth() + 1}月${target.getDate()}日` }));
    // 残影层克隆了旧周视图（aria-hidden 被 getByRole 忽略），用 role 查询当日日程条目
    expect(screen.getByRole("button", { name: /编辑 该日新增/ })).toBeInTheDocument();
  });

  it("周视图连续翻周跨月后切回月视图显示对应月份", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole("button", { name: /上一周/ }));
    }
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    const now = new Date();
    const target = addDays(now.getFullYear(), now.getMonth(), now.getDate(), -42);
    expect(
      screen.getByText(formatMonthTitle(target.getFullYear(), target.getMonth()))
    ).toBeInTheDocument();
  });

  it("周视图拖选时间段：弹窗预填起止时间，保存后时间轴出现事件块", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /展开凌晨时段/ }));
    const col = document.querySelector(`[data-date="${toDateKey(getWeekDates(new Date())[0])}"]`)!;
    // 60px → 2:00，90px → 3:00
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 90 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/开始时间/)).toHaveValue("02:00");
    expect(screen.getByLabelText(/结束时间/)).toHaveValue("03:00");
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "拖选新建" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(screen.getByRole("button", { name: /日程 拖选新建/ })).toBeInTheDocument();
  });

  it("横向拖拽跨多天批量创建日程", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /展开凌晨时段/ }));
    const week = getWeekDates(new Date());
    const col0 = document.querySelector(`[data-date="${toDateKey(week[0])}"]`)!;
    fireEvent.pointerDown(col0, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    fireEvent.pointerMove(col0, { pointerId: 1, clientX: 250, clientY: 90 }); // 拖到第 3 列 → 3:00
    fireEvent.pointerUp(col0, { pointerId: 1 });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/将同时添加到 3 天：/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "晚间练习" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(screen.getAllByRole("button", { name: "日程 晚间练习" })).toHaveLength(3);
  });

  it("周视图时间轴事件块点击打开编辑弹窗并回填结束时间", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: /添加日程/ }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "时间段事件" } });
    fireEvent.change(screen.getByLabelText(/开始时间/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/结束时间/), { target: { value: "11:30" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /日程 时间段事件/ }));
    fireEvent.click(screen.getByRole("button", { name: /编辑 时间段事件/ }));
    expect(screen.getByLabelText(/开始时间/)).toHaveValue("10:00");
    expect(screen.getByLabelText(/结束时间/)).toHaveValue("11:30");
  });
});

describe("ScheduleApp (year view)", () => {
  it("点年页签显示 12 个月卡片", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    const year = new Date().getFullYear();
    for (let m = 1; m <= 12; m++) {
      expect(screen.getByRole("button", { name: `查看${year}年${m}月` })).toBeInTheDocument();
    }
  });

  it("年视图上一年/下一年切换", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    const year = new Date().getFullYear();
    fireEvent.click(screen.getByRole("button", { name: /上一年/ }));
    expect(screen.getByRole("button", { name: `查看${year - 1}年1月` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /下一年/ }));
    expect(screen.getByRole("button", { name: `查看${year}年1月` })).toBeInTheDocument();
  });

  it("点月名切到月视图并定位该月", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    const year = new Date().getFullYear();
    fireEvent.click(screen.getByRole("button", { name: "上一年" }));
    fireEvent.click(screen.getByRole("button", { name: `查看${year - 1}年6月` }));
    expect(screen.getByText(formatMonthTitle(year - 1, 5))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "月" })).toHaveAttribute("aria-pressed", "true");
  });

  it("点迷你网格日期切到月视图并选中那天", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    const year = new Date().getFullYear();
    // 当前月迷你网格里的 15 日
    const d = new Date(year, new Date().getMonth(), 15);
    const label = `${d.getMonth() + 1}月${d.getDate()}日`;
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByText(formatDayLabel(d))).toBeInTheDocument();
  });
});

describe("ScheduleApp (selection bubble)", () => {
  let rectSpy: ReturnType<typeof vi.spyOn>;

  // jsdom 不计算布局：按 aria-label 中的日期号模拟坐标（第 N 日 → left=N*10, top=40, 28x28）
  beforeEach(() => {
    rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const label = this.closest("[aria-label]")?.getAttribute("aria-label") ?? "";
        const m = /^(\d+)月(\d+)日/.exec(label);
        if (!m) return { left: 0, top: 0, width: 0, height: 0 } as DOMRect;
        return { left: Number(m[2]) * 10, top: 40, width: 28, height: 28 } as DOMRect;
      }
    );
  });

  afterEach(() => {
    rectSpy.mockRestore();
  });

  it("切换日期时选中泡泡滑到新位置", async () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    const bubble = screen.getByTestId("selection-bubble");
    const now = new Date();
    await waitFor(() =>
      expect(bubble.style.transform).toBe(`translate(${now.getDate() * 10}px, 40px)`)
    );
    const grid = getMonthGrid(now.getFullYear(), now.getMonth());
    const counts = new Map<number, number>();
    for (const d of grid) counts.set(d.getDate(), (counts.get(d.getDate()) ?? 0) + 1);
    const target = grid.find(
      (d) =>
        isSameMonth(d, now.getFullYear(), now.getMonth()) &&
        d.getDate() !== now.getDate() &&
        counts.get(d.getDate()) === 1
    )!;
    fireEvent.click(
      screen.getByRole("button", { name: `${target.getMonth() + 1}月${target.getDate()}日` })
    );
    await waitFor(() =>
      expect(bubble.style.transform).toBe(`translate(${target.getDate() * 10}px, 40px)`)
    );
  });

  it("选中日期不在当月网格时泡泡隐藏，回当月后恢复", async () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    const now = new Date();
    await waitFor(() =>
      expect(screen.getByTestId("selection-bubble").style.visibility).toBe("visible")
    );
    // 连翻两个月，让选中的今天彻底离开网格（相邻月补格仍包含它，需翻两个月）
    fireEvent.click(screen.getByRole("button", { name: /上月/ }));
    fireEvent.click(screen.getByRole("button", { name: /上月/ }));
    await waitFor(() =>
      expect(screen.getByTestId("selection-bubble").style.visibility).toBe("hidden")
    );
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    await waitFor(() =>
      expect(screen.getByTestId("selection-bubble").style.transform).toBe(
        `translate(${now.getDate() * 10}px, 40px)`
      )
    );
  });
});

describe("ScheduleApp (view zoom transition)", () => {
  const wrap = () => screen.getByTestId("view-zoom-wrap");

  it("月→年缩小进入、年→月放大进入、月→周放大进入、周→月缩小进入", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    expect(wrap().className).toContain("view-zoom-out");
    fireEvent.animationEnd(wrap());
    expect(wrap().className).not.toContain("view-zoom");
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(wrap().className).toContain("view-zoom-in");
    fireEvent.animationEnd(wrap());
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    expect(wrap().className).toContain("view-zoom-in");
    fireEvent.animationEnd(wrap());
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(wrap().className).toContain("view-zoom-out");
  });

  it("jsdom 下锚点测不到时回退中心（transform-origin 50% 50%）", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.animationEnd(wrap());
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(wrap().style.transformOrigin).toBe("50% 50%");
  });

  it("月视图日期格带 data-date，年视图卡片带 data-ym", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    const now = new Date();
    const todayBtn = screen.getByRole("button", { name: `${now.getMonth() + 1}月${now.getDate()}日` });
    expect(todayBtn).toHaveAttribute("data-date", toDateKey(now));
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    expect(document.querySelector(`[data-ym="${now.getFullYear()}-${now.getMonth()}"]`)).not.toBeNull();
  });

  it("月→周切换出现旧视图残影，内容为旧月视图，动画结束后移除", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const ghost = screen.getByTestId("view-ghost");
    expect(ghost).toBeInTheDocument();
    // 残影克隆了旧月视图：含月历日期格（jsdom rect 全 0 → 原位 0,0）
    expect(ghost.querySelector(`[data-date="${toDateKey(now)}"]`)).not.toBeNull();
    expect(ghost.style.left).toBe("0px");
    expect(ghost.style.top).toBe("0px");
    fireEvent.animationEnd(ghost);
    expect(screen.queryByTestId("view-ghost")).toBeNull();
  });

  it("周→月切换残影为旧周视图（7 列时间轴）", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const week = getWeekDates(new Date());
    fireEvent.click(
      screen.getByRole("button", { name: `跳转到${week[0].getMonth() + 1}月${week[0].getDate()}日` })
    );
    expect(screen.getByTestId("view-ghost").querySelectorAll("[data-date]")).toHaveLength(7);
  });

  it("仅视图切换产生残影：翻月/翻周等导航不产生", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    expect(screen.queryByTestId("view-ghost")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.animationEnd(screen.getByTestId("view-ghost"));
    fireEvent.click(screen.getByRole("button", { name: /下一周/ }));
    expect(screen.queryByTestId("view-ghost")).toBeNull();
  });

  it("残影缩小移动到锚点元素：月→周缩向日期格、月→年缩向月卡", () => {
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        // 锚点元素（日期格/月卡）有对应 data 属性 → 小矩形；其余（视图容器等）→ 大矩形
        if (this.getAttribute("data-date") || this.getAttribute("data-ym")) {
          return { left: 300, top: 200, width: 28, height: 28 } as DOMRect;
        }
        return { left: 0, top: 0, width: 800, height: 600 } as DOMRect;
      }
    );
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const ghost = screen.getByTestId("view-ghost");
    // 残影中心 (400,300) → 锚点中心 (314,214)：平移 -86/-86，缩放 28/800
    expect(ghost.className).toContain("anim-ghost-morph");
    expect(ghost.style.getPropertyValue("--g-tx")).toBe("-86px");
    expect(ghost.style.getPropertyValue("--g-ty")).toBe("-86px");
    expect(ghost.style.getPropertyValue("--g-s")).toBe("0.035");
    spy.mockRestore();
  });
});

describe("ScheduleApp (page-turn animation)", () => {
  // 动画只作用于日期区域容器（data-testid="view-anim"），标题与导航按钮不参与
  const animArea = () => screen.getByTestId("view-anim");

  it("月视图：下月从右滑入、上月从左滑入（仅日期区域）", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    const next = addMonths(now.getFullYear(), now.getMonth(), 1);
    expect(screen.getByText(formatMonthTitle(next.year, next.monthIndex))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-right");
    fireEvent.click(screen.getByRole("button", { name: /上月/ }));
    expect(screen.getByText(formatMonthTitle(now.getFullYear(), now.getMonth()))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-left");
  });

  it("年视图：下一年从右滑入、上一年从左滑入（与月视图一致）", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    const year = new Date().getFullYear();
    fireEvent.click(screen.getByRole("button", { name: /下一年/ }));
    expect(screen.getByText(formatYearTitle(year + 1))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-right");
    fireEvent.click(screen.getByRole("button", { name: /上一年/ }));
    expect(screen.getByText(formatYearTitle(year))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-left");
  });

  it("周视图：下一周从右滑入、上一周从左滑入", () => {
    render(<ScheduleApp tokens={THEME_TOKENS[1]} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: /下一周/ }));
    const nextWeek = getWeekDates(
      addDays(now.getFullYear(), now.getMonth(), now.getDate(), 7)
    );
    expect(screen.getByText(formatWeekTitle(nextWeek))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-right");
    fireEvent.click(screen.getByRole("button", { name: /上一周/ }));
    expect(screen.getByText(formatWeekTitle(getWeekDates(now)))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-left");
  });

  it.each([1, 6])("主题 %i 翻月动画与功能一致", (n) => {
    render(<ScheduleApp tokens={THEME_TOKENS[n]} />);
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    const next = addMonths(now.getFullYear(), now.getMonth(), 1);
    expect(animArea().className).toContain("anim-slide-in-right");
    // 功能一致：翻月后日期可点选
    const grid = getMonthGrid(next.year, next.monthIndex);
    const counts = new Map<number, number>();
    for (const d of grid) counts.set(d.getDate(), (counts.get(d.getDate()) ?? 0) + 1);
    const target = grid.find(
      (d) =>
        isSameMonth(d, next.year, next.monthIndex) && counts.get(d.getDate()) === 1
    )!;
    fireEvent.click(
      screen.getByRole("button", { name: `${target.getMonth() + 1}月${target.getDate()}日` })
    );
    expect(screen.getByText(formatDayLabel(target))).toBeInTheDocument();
  });
});
