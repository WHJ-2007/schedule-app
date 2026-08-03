import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
