import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Style7 from "./page";
import { getMonthGrid, isSameMonth, formatDayLabel } from "@/lib/date";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// 项目未配置全局自动 cleanup（vitest 未开 globals），多次 render 需手动清理
afterEach(() => {
  cleanup();
});

describe("style-7 page", () => {
  it("renders its unique header and calendar", () => {
    render(<Style7 />);
    expect(screen.getByRole("heading", { name: /渐变日程/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /今天/ })).toBeInTheDocument();
  });

  it("selects a day when a day cell is clicked", () => {
    render(<Style7 />);
    const now = new Date();
    const grid = getMonthGrid(now.getFullYear(), now.getMonth());
    // 找一个在当前月内、且日期数字在 42 格中不重复的日子，避免按钮名字歧义
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

  it("adds an event to the selected day via the form", () => {
    render(<Style7 />);
    fireEvent.click(screen.getByRole("button", { name: /添加日程/ }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "设计评审会" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(screen.getByText("设计评审会")).toBeInTheDocument();
  });
});
