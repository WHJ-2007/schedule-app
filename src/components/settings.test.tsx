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

const renderSettings = () => render(<Settings events={[]} onImport={vi.fn()} />);

describe("settings", () => {
  it("齿轮按钮打开设置弹窗", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
  });

  it("切换主题：保存并跳转", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: /手账笔记本/ }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("/style-6");
    expect(pushMock).toHaveBeenCalledWith("/style-6");
  });

  it("高亮当前主题", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "/style-6");
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(screen.getByText("当前")).toBeInTheDocument();
  });

  it("tab 切换：高亮块跟随选中按钮滑动，内容区带缩放动画", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    const pill = screen.getByTestId("tab-pill");
    // jsdom 不计算布局：注入选中按钮的测量值验证高亮块位置
    const themeBtn = screen.getByRole("button", { name: "主题" });
    Object.defineProperty(themeBtn, "offsetLeft", { value: 8, configurable: true });
    Object.defineProperty(themeBtn, "offsetWidth", { value: 52, configurable: true });
    const logBtn = screen.getByRole("button", { name: "更新日志" });
    Object.defineProperty(logBtn, "offsetLeft", { value: 68, configurable: true });
    Object.defineProperty(logBtn, "offsetWidth", { value: 64, configurable: true });
    fireEvent.click(logBtn);
    expect(pill.style.left).toBe("68px");
    expect(pill.style.width).toBe("64px");
    fireEvent.click(themeBtn);
    expect(pill.style.left).toBe("8px");
    expect(pill.style.width).toBe("52px");
    const dataBtn = screen.getByRole("button", { name: "数据" });
    Object.defineProperty(dataBtn, "offsetLeft", { value: 140, configurable: true });
    Object.defineProperty(dataBtn, "offsetWidth", { value: 56, configurable: true });
    fireEvent.click(dataBtn);
    expect(pill.style.left).toBe("140px");
    expect(pill.style.width).toBe("56px");
    // 内容区切换带缩放动画
    expect(screen.getByRole("button", { name: /导出全部日程/ }).closest(".anim-scale-in")).toBeTruthy();
  });

  it("更新日志分页：翻页显示不同条目", () => {
    renderSettings();
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
