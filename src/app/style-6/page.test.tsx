import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Style6 from "./page";
import { getMonthGrid, isSameMonth, formatDayLabel } from "@/lib/date";
import { STORAGE_KEY } from "@/lib/events";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// 项目未配置全局自动 cleanup（vitest 未开 globals），多次 render 需手动清理
afterEach(() => {
  cleanup();
});

describe("style-6 page", () => {
  it("renders its unique header and calendar", () => {
    render(<Style6 />);
    expect(screen.getByRole("heading", { name: /手账日程/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /今天/ })).toBeInTheDocument();
  });

  it("selects a day when a day cell is clicked", () => {
    render(<Style6 />);
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
    render(<Style6 />);
    fireEvent.click(screen.getByRole("button", { name: /添加日程/ }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "手账补记" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(screen.getByText("手账补记")).toBeInTheDocument();
  });

  it("日程条目左边框颜色按主题色轮换", () => {
    // 清空事件存储，避免样本数据/前序用例污染：保证新增条目是当天第一条
    localStorage.setItem(STORAGE_KEY, "[]");
    render(<Style6 />);
    fireEvent.click(screen.getByRole("button", { name: /添加日程/ }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "手账条目" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    const li = screen.getByText("手账条目").closest("li");
    expect(li?.getAttribute("style")).toMatch(/rgb\(224, 90, 90\)/);
  });
});
