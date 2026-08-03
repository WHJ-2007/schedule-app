import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Settings from "./settings";
import { THEME_STORAGE_KEY } from "@/lib/themes";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/changelog", () => {
  const fake = Array.from({ length: 12 }, (_, i) => ({
    version: `20260803-${String(1000 + i)}`,
    date: "2026-08-03",
    title: `版本 ${i + 1}`,
    changes: [`改动 ${i + 1}`],
  }));
  return {
    CHANGELOG: fake,
    LOG_PAGE_SIZE: 5,
    getChangelogPageCount: () => Math.ceil(fake.length / 5),
    getChangelogPage: (page: number) => fake.slice((page - 1) * 5, page * 5),
  };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  pushMock.mockClear();
});

describe("settings", () => {
  it("齿轮按钮打开设置弹窗", () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
  });

  it("切换主题：保存并跳转", () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: /手账笔记本/ }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("/style-6");
    expect(pushMock).toHaveBeenCalledWith("/style-6");
  });

  it("高亮当前主题", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "/style-6");
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(screen.getByText("当前")).toBeInTheDocument();
  });

  it("更新日志分页：翻页显示不同条目", () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: "更新日志" }));
    expect(screen.getByText("第 1 / 3 页")).toBeInTheDocument();
    expect(screen.getByText("版本 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一页 ›" }));
    expect(screen.getByText("第 2 / 3 页")).toBeInTheDocument();
    expect(screen.getByText("版本 6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "‹ 上一页" }));
    expect(screen.getByText("第 1 / 3 页")).toBeInTheDocument();
  });
});
