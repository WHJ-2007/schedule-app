import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import ScheduleApp from "./schedule-app";
import { THEME_TOKENS } from "./theme-tokens";
import { getMonthGrid, isSameMonth, formatDayLabel, getWeekDates, addDays, formatMonthTitle } from "@/lib/date";

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
    expect(screen.getByText("该日新增")).toBeInTheDocument();
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
    const bubble = screen.getByTestId("selection-bubble");
    const now = new Date();
    await waitFor(() => expect(bubble.style.visibility).toBe("visible"));
    // 连翻两个月，让选中的今天彻底离开网格（相邻月补格仍包含它，需翻两个月）
    fireEvent.click(screen.getByRole("button", { name: /上月/ }));
    fireEvent.click(screen.getByRole("button", { name: /上月/ }));
    await waitFor(() => expect(bubble.style.visibility).toBe("hidden"));
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    await waitFor(() =>
      expect(bubble.style.transform).toBe(`translate(${now.getDate() * 10}px, 40px)`)
    );
  });
});
