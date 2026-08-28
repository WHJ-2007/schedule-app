import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import EventPanel, { emptyForm } from "./event-panel";
import { THEME_TOKENS } from "./theme-tokens";

afterEach(() => cleanup());

function renderPanel(form = emptyForm(["2026-08-05"]), overrides: Partial<Parameters<typeof EventPanel>[0]> = {}) {
  const props = {
    form,
    tokens: THEME_TOKENS,
    onChange: vi.fn(),
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return render(<EventPanel {...props} />);
}

describe("EventPanel", () => {
  it("渲染全部字段：标题/开始时间/结束时间/描述/重复开关", () => {
    renderPanel();
    expect(screen.getByRole("dialog", { name: "添加日程" })).toBeInTheDocument();
    expect(screen.getByLabelText(/标题/)).toBeInTheDocument();
    expect(screen.getByLabelText(/开始时间/)).toBeInTheDocument();
    expect(screen.getByLabelText(/结束时间/)).toBeInTheDocument();
    expect(screen.getByLabelText("时长")).toBeInTheDocument();
    // 色盘：8 色点 + 默认格
    expect(screen.getAllByLabelText(/颜色/).length).toBeGreaterThanOrEqual(9);
    expect(screen.getByLabelText(/描述/)).toBeInTheDocument();
    expect(screen.queryByLabelText("响铃")).toBeNull();
    expect(screen.getByText("日程开始和结束时发送通知")).toBeInTheDocument();
    expect(screen.getByLabelText("重复")).toBeInTheDocument();
    // 未勾选重复时不展开频率选项
    expect(screen.queryByLabelText("频率")).toBeNull();
    expect(screen.queryByLabelText(/重复至/)).toBeNull();
  });

  it("编辑模式：标题显示编辑日程且出现删除按钮", () => {
    const form = { ...emptyForm(["2026-08-05"]), id: "x", title: "旧标题" };
    renderPanel(form, { onDelete: vi.fn() });
    expect(screen.getByRole("dialog", { name: "编辑日程" })).toBeInTheDocument();
    expect(screen.getByLabelText(/标题/)).toHaveValue("旧标题");
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("新增模式不显示删除按钮", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
  });

  it("点保存触发 onSave", () => {
    const onSave = vi.fn();
    renderPanel(emptyForm(["2026-08-05"]), { onSave });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(onSave).toHaveBeenCalled();
  });

  it("全天日程提示设置开始时间后提醒才生效", () => {
    renderPanel(emptyForm(["2026-08-05"]));
    expect(screen.getByText("设置开始时间后生效")).toBeInTheDocument();
  });

  it("点删除触发 onDelete 且带 id", () => {
    const onDelete = vi.fn();
    const form = { ...emptyForm(["2026-08-05"]), id: "x" };
    renderPanel(form, { onDelete });
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(onDelete).toHaveBeenCalledWith("x");
  });

  it("点取消与 ✕ 触发 onClose", () => {
    const onClose = vi.fn();
    renderPanel(emptyForm(["2026-08-05"]), { onClose });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("勾选重复开关后展开频率/重复开始/重复至，默认频率每天", () => {
    const onChange = vi.fn();
    renderPanel(emptyForm(["2026-08-05"]), { onChange });
    fireEvent.click(screen.getByLabelText("重复"));
    const next = onChange.mock.calls[0][0] as ReturnType<typeof emptyForm>;
    expect(next.repeat.on).toBe(true);
    expect(next.repeat.freq).toBe("daily");
  });

  it("重复开关打开时渲染频率选项与起止日期", () => {
    const form: ReturnType<typeof emptyForm> = {
      ...emptyForm(["2026-08-05"]),
      repeat: { on: true, freq: "weekly", until: "", interval: 1 },
    };
    renderPanel(form);
    expect(screen.getByLabelText("频率")).toHaveValue("weekly");
    expect(screen.getByLabelText("重复开始")).toHaveValue("2026-08-05");
    expect(screen.getByLabelText("重复至")).toHaveValue("");
    // 频率选项含全部五种
    const select = screen.getByLabelText("频率");
    for (const label of ["每天", "每周", "每月", "工作日（周一至周五）", "周末（周六、周日）"]) {
      expect(select.textContent).toContain(label);
    }
  });

  it("多日期显示同时添加提示", () => {
    renderPanel(emptyForm(["2026-08-05", "2026-08-06"]));
    expect(screen.getByText(/将同时添加到 2 天/)).toBeInTheDocument();
  });

  it("色盘：8 色 + 默认，点击色点与默认格写入 color", () => {
    const onChange = vi.fn();
    renderPanel(emptyForm(["2026-08-05"]), { onChange });
    fireEvent.click(screen.getByRole("button", { name: "颜色 #ef4444" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: "#ef4444" })
    );
    fireEvent.click(screen.getByRole("button", { name: "颜色 默认" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: "" })
    );
  });

  it("时长联动：改开始 → 结束 = 开始 + 当前时长", () => {
    const onChange = vi.fn();
    const form = { ...emptyForm(["2026-08-05"]), time: "09:00", endTime: "10:30" };
    renderPanel(form, { onChange });
    fireEvent.change(screen.getByLabelText(/开始时间/), { target: { value: "11:00" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ time: "11:00", endTime: "12:30" })
    );
  });

  it("时长联动：改结束 → 时长自动为差值，开始不动", () => {
    const onChange = vi.fn();
    const form = { ...emptyForm(["2026-08-05"]), time: "09:00", endTime: "10:30" };
    renderPanel(form, { onChange });
    fireEvent.change(screen.getByLabelText(/结束时间/), { target: { value: "10:00" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ time: "09:00", endTime: "10:00" })
    );
  });

  it("时长联动：改时长 → 结束 = 开始 + 时长（结束钳制 23:59）", () => {
    const onChange = vi.fn();
    const form = { ...emptyForm(["2026-08-05"]), time: "23:00", endTime: "23:30" };
    renderPanel(form, { onChange });
    fireEvent.change(screen.getByLabelText("时长"), { target: { value: "02:00" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ time: "23:00", endTime: "23:59" })
    );
  });

  it("面板容器带毛玻璃效果", () => {
    renderPanel();
    expect(screen.getByRole("dialog", { name: "添加日程" }).className).toContain("backdrop-blur");
  });

  it("无开始时时长输入保持可用且不崩溃", () => {
    const onChange = vi.fn();
    renderPanel(emptyForm(["2026-08-05"]), { onChange });
    expect(screen.getByLabelText("时长")).toHaveValue("01:00"); // 缺省 60 分钟
    fireEvent.change(screen.getByLabelText("时长"), { target: { value: "02:00" } });
    // 无开始：时长直接作为结束时间，不崩溃
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ endTime: "02:00" })
    );
  });
});
