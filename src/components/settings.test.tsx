import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import Settings from "./settings";

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
});

const renderSettings = () => render(<Settings events={[]} onImport={vi.fn()} />);

describe("settings", () => {
  it("齿轮按钮打开设置弹窗", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
  });

  it("tab 切换：高亮块跟随选中按钮滑动，内容区带缩放动画", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    const pill = screen.getByTestId("tab-pill");
    // jsdom 不计算布局：注入选中按钮的测量值验证高亮块位置
    // 默认 tab 已是「更新日志」，先点「数据」触发重测量，再点回「更新日志」
    const dataBtn = screen.getByRole("button", { name: "数据" });
    Object.defineProperty(dataBtn, "offsetLeft", { value: 80, configurable: true });
    Object.defineProperty(dataBtn, "offsetWidth", { value: 56, configurable: true });
    fireEvent.click(dataBtn);
    expect(pill.style.left).toBe("80px");
    expect(pill.style.width).toBe("56px");
    const logBtn = screen.getByRole("button", { name: "更新日志" });
    Object.defineProperty(logBtn, "offsetLeft", { value: 8, configurable: true });
    Object.defineProperty(logBtn, "offsetWidth", { value: 64, configurable: true });
    fireEvent.click(logBtn);
    expect(pill.style.left).toBe("8px");
    expect(pill.style.width).toBe("64px");
    // 内容区切换带缩放动画
    fireEvent.click(dataBtn);
    expect(screen.getByRole("button", { name: /导出全部日程/ }).closest(".anim-scale-in")).toBeTruthy();
    // 高亮块与按钮同高：容器 pb-3 时 pill 底部应停在内容区下沿（bottom-3）
    expect(pill.className).toContain("bottom-3");
  });

  it("导入导出 JSON 包装格式：解包 events 并整体替换", async () => {
    const onImport = vi.fn();
    const { container } = render(<Settings events={[]} onImport={onImport} />);
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: "数据" }));
    const file = new File(
      [
        JSON.stringify({
          version: 1,
          exportedAt: "2026-08-04T12:00:00.000Z",
          events: [
            { id: "a", title: "导入日程", date: "2026-08-05", time: "09:00", description: "", done: false },
            { id: 123, title: "坏数据", date: "2026-08-05" },
          ],
        }),
      ],
      "导出.json",
      { type: "application/json" }
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() => {
      expect(onImport).toHaveBeenCalledTimes(1);
    });
    const list = onImport.mock.calls[0][0] as { title: string }[];
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("导入日程");
    expect(screen.getByText("已导入 1 条日程")).toBeInTheDocument();
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
