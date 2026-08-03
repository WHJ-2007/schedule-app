import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import WeekTimeline from "./week-timeline";
import { THEME_TOKENS } from "./theme-tokens";
import { getWeekDates, toDateKey } from "@/lib/date";
import type { ScheduleEvent } from "@/lib/events";

// jsdom 不计算布局：模拟 7 列矩形（每列 100px 宽、top 0），非列元素全零
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
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
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// 2026-08-03 是周一，整周固定日期便于断言（列 0..6 = 8/3..8/9）
const dates = getWeekDates(new Date(2026, 7, 3));
const emptyWeek: ScheduleEvent[][] = Array.from({ length: 7 }, () => []);

function ev(id: string, title: string, time: string, endTime?: string, col = 0): ScheduleEvent {
  return { id, title, date: toDateKey(dates[col]), time, endTime, description: "", done: false };
}

function renderTimeline(eventsByDay: ScheduleEvent[][], overrides: Partial<Parameters<typeof WeekTimeline>[0]> = {}) {
  const props = {
    tokens: THEME_TOKENS[1],
    dates,
    eventsByDay,
    anchorKey: "2026-08-03",
    today: new Date(2026, 7, 3),
    onJumpToMonth: vi.fn(),
    onAddDay: vi.fn(),
    onEdit: vi.fn(),
    onToggleDone: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    ...overrides,
  };
  return render(<WeekTimeline {...props} />);
}

function expandFold() {
  fireEvent.click(screen.getByRole("button", { name: /展开凌晨时段/ }));
}

describe("WeekTimeline", () => {
  it("渲染小时刻度（默认折叠凌晨时段）", () => {
    renderTimeline(emptyWeek);
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("8:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
  });

  it("带时间的事件按起止时间定位成块", () => {
    renderTimeline([[ev("a", "晨会", "09:30", "11:00")], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    // 折叠凌晨后 9:30 位于 88(条带下沿) + 150min*0.8 = 208px；1.5h * 48px/h = 72px
    expect(block.style.top).toBe("208px");
    expect(block.style.height).toBe("72px");
    expect(block.textContent).toContain("09:30–11:00");
  });

  it("无结束时间的事件默认按 1 小时显示", () => {
    renderTimeline([[ev("b", "阅读", "21:00")], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 阅读/ });
    expect(block.style.top).toBe("760px"); // 88 + (1260-420)min * 0.8px/min
    expect(block.style.height).toBe("48px"); // 默认 1 小时
  });

  it("全天事件显示在顶部全天区而非时间轴", () => {
    renderTimeline([[ev("c", "全天事项", "")], ...emptyWeek.slice(1)]);
    expect(screen.getByRole("button", { name: /编辑 全天事项/ })).toBeInTheDocument();
    // 时间轴中不出现该事件的定位块：同一按钮仅渲染一次
    expect(screen.getAllByRole("button", { name: /编辑 全天事项/ })).toHaveLength(1);
  });

  it("拖选时间段后回调带上日期与起止时间", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    // 96px → 2:00，144px → 3:00（列顶视口坐标 0，jsdom rect 全 0）
    fireEvent.mouseDown(col, { clientX: 50, clientY: 96 });
    fireEvent.mouseMove(col, { clientX: 50, clientY: 144 });
    fireEvent.mouseUp(col);
    expect(onAddDay).toHaveBeenCalledWith(["2026-08-03"], "02:00", "03:00");
  });

  it("向上拖选时起止时间取最小最大", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientX: 50, clientY: 144 }); // 3:00
    fireEvent.mouseMove(col, { clientX: 50, clientY: 96 }); // 2:00
    fireEvent.mouseUp(col);
    expect(onAddDay).toHaveBeenCalledWith(["2026-08-03"], "02:00", "03:00");
  });

  it("拖选过程中显示高亮块，松开后消失", () => {
    renderTimeline(emptyWeek);
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientX: 50, clientY: 96 });
    fireEvent.mouseMove(col, { clientX: 50, clientY: 144 });
    const hl = col.querySelector('[data-testid="drag-select"]');
    expect(hl).not.toBeNull();
    expect((hl as HTMLElement).style.top).toBe("96px"); // 2:00 * 0.8px/min
    expect((hl as HTMLElement).style.height).toBe("48px"); // 60 分钟
    fireEvent.mouseUp(col);
    expect(col.querySelector('[data-testid="drag-select"]')).toBeNull();
  });

  it("原地单击不触发创建，仅清除高亮", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientX: 50, clientY: 96 }); // 2:00
    expect(col.querySelector('[data-testid="drag-select"]')).not.toBeNull();
    fireEvent.mouseUp(col);
    expect(onAddDay).not.toHaveBeenCalled();
    expect(col.querySelector('[data-testid="drag-select"]')).toBeNull();
  });

  it("拖动不足一个槽位不触发（移动 15 分钟仍吸附回起点）", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientX: 50, clientY: 96 }); // 2:00
    fireEvent.mouseMove(col, { clientX: 50, clientY: 108 }); // 2:15，仍吸附 2:00
    fireEvent.mouseUp(col);
    expect(onAddDay).not.toHaveBeenCalled();
  });

  it("点击事件块选中后出现编辑按钮，点击编辑触发回调", () => {
    const onEdit = vi.fn();
    const a = ev("d", "评审", "14:00", "15:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onEdit });
    fireEvent.click(screen.getByRole("button", { name: /日程 评审/ }));
    fireEvent.click(screen.getByRole("button", { name: /编辑 评审/ }));
    expect(onEdit).toHaveBeenCalledWith(a);
  });

  it("列头跳月视图与 ＋ 添加", () => {
    const onJumpToMonth = vi.fn();
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onJumpToMonth, onAddDay });
    fireEvent.click(screen.getByRole("button", { name: "跳转到8月3日" }));
    expect(onJumpToMonth).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "在8月3日添加日程" }));
    expect(onAddDay).toHaveBeenCalledWith(["2026-08-03"]);
  });

  it("选中日列为高亮（anchor）", () => {
    const { container } = renderTimeline(emptyWeek);
    const col = container.querySelector('[data-date="2026-08-03"]')!;
    expect(col.className).toContain("border-blue-200");
  });
});

describe("WeekTimeline (凌晨折叠)", () => {
  it("默认折叠：1:00–6:00 刻度隐藏，显示折叠条", () => {
    renderTimeline(emptyWeek);
    expect(screen.queryByText("1:00")).toBeNull();
    expect(screen.queryByText("5:00")).toBeNull();
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("7:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /展开凌晨时段/ })).toBeInTheDocument();
  });

  it("点击折叠条展开，凌晨刻度恢复", () => {
    renderTimeline(emptyWeek);
    expandFold();
    expect(screen.getByText("1:00")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /收起凌晨时段/ })).toBeInTheDocument();
  });

  it("展开后可再收起", () => {
    renderTimeline(emptyWeek);
    expandFold();
    fireEvent.click(screen.getByRole("button", { name: /收起凌晨时段/ }));
    expect(screen.queryByText("1:00")).toBeNull();
    expect(screen.getByRole("button", { name: /展开凌晨时段/ })).toBeInTheDocument();
  });

  it("折叠区事件隐藏并计入折叠条数量", () => {
    renderTimeline([[ev("e", "夜班", "02:00", "03:00")], ...emptyWeek.slice(1)]);
    expect(screen.queryByRole("button", { name: /日程 夜班/ })).toBeNull();
    const band = screen.getByRole("button", { name: /展开凌晨时段/ });
    expect(band.textContent).toContain("1 项日程");
    // 展开后事件可见
    expandFold();
    expect(screen.getByRole("button", { name: /日程 夜班/ })).toBeInTheDocument();
  });

  it("折叠时在折叠条上按下不开始拖选", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    // 60px 位于折叠条内（48–88px）
    fireEvent.mouseDown(col, { clientX: 50, clientY: 60 });
    fireEvent.mouseMove(col, { clientX: 50, clientY: 120 });
    fireEvent.mouseUp(col);
    expect(onAddDay).not.toHaveBeenCalled();
  });

  it("折叠条上方 0:00 区仍可拖选（不越过凌晨区）", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientX: 50, clientY: 4 }); // 0:00（吸附）
    fireEvent.mouseMove(col, { clientX: 50, clientY: 44 }); // 1:00（吸附，再往下就进入折叠条）
    fireEvent.mouseUp(col);
    expect(onAddDay).toHaveBeenCalledWith(["2026-08-03"], "00:00", "01:00");
  });
});

describe("WeekTimeline (选择与框选)", () => {
  it("单击选中出现编辑按钮，再点另一事件替换，点空白清除", () => {
    const a = ev("a", "晨会", "09:00", "10:00");
    const b = ev("b", "评审", "11:00", "12:00");
    renderTimeline([[a, b], ...emptyWeek.slice(1)]);
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }));
    expect(screen.getByRole("button", { name: /编辑 晨会/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /日程 评审/ }));
    expect(screen.getByRole("button", { name: /编辑 评审/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /编辑 晨会/ })).toBeNull();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientX: 50, clientY: 136 }); // 8:00 空白处
    fireEvent.mouseUp(col);
    expect(screen.queryByRole("button", { name: /编辑 评审/ })).toBeNull();
  });

  it("框选覆盖多事件：松开变为选中而非新建", () => {
    const onAddDay = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    const b = ev("b", "评审", "11:00", "12:00");
    renderTimeline([[a, b], ...emptyWeek.slice(1)], { onAddDay });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientX: 50, clientY: 136 }); // 8:00
    fireEvent.mouseMove(col, { clientX: 50, clientY: 352 }); // 12:30
    fireEvent.mouseUp(col);
    expect(onAddDay).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /编辑 晨会/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /编辑 评审/ })).toBeInTheDocument();
  });

  it("横向框选跨列选中两列事件", () => {
    const a = ev("a", "晨会", "09:00", "10:00", 0);
    const b = ev("b", "评审", "11:00", "12:00", 1);
    const days = [...emptyWeek];
    days[0] = [a];
    days[1] = [b];
    renderTimeline(days);
    fireEvent.mouseDown(document.querySelector('[data-date="2026-08-03"]')!, {
      clientX: 50,
      clientY: 136,
    });
    fireEvent.mouseMove(document.querySelector('[data-date="2026-08-04"]')!, {
      clientX: 150,
      clientY: 352,
    });
    fireEvent.mouseUp(document.querySelector('[data-date="2026-08-04"]')!);
    expect(screen.getByRole("button", { name: /编辑 晨会/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /编辑 评审/ })).toBeInTheDocument();
  });

  it("横向拖拽空白区批量创建（同时间段多天）", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientX: 50, clientY: 96 }); // 2:00
    fireEvent.mouseMove(col, { clientX: 250, clientY: 144 }); // 拖到第 3 列 → 3:00
    fireEvent.mouseUp(col);
    expect(onAddDay).toHaveBeenCalledWith(
      ["2026-08-03", "2026-08-04", "2026-08-05"],
      "02:00",
      "03:00"
    );
  });
});

describe("WeekTimeline (整体挪动)", () => {
  it("拖动单个事件跨天平移，松手提交，预览使用 transform", () => {
    const onMove = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onMove });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.mouseDown(block, { clientX: 50, clientY: 190 }); // 9:00
    fireEvent.mouseMove(block, { clientX: 150, clientY: 264 }); // +90 分钟、+1 天
    expect(block.style.transform).toBe("translate(100px, 72px)");
    fireEvent.mouseUp(block);
    expect(block.style.transform).toBe("");
    expect(onMove).toHaveBeenCalledWith("a", {
      date: "2026-08-04",
      time: "10:30",
      endTime: "11:30",
    });
  });

  it("整体挪动选中组：全部事件同时平移", () => {
    const onMove = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    const b = ev("b", "评审", "11:00", "12:00");
    renderTimeline([[a, b], ...emptyWeek.slice(1)], { onMove });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientX: 50, clientY: 136 }); // 框选
    fireEvent.mouseMove(col, { clientX: 50, clientY: 352 });
    fireEvent.mouseUp(col);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.mouseDown(block, { clientX: 50, clientY: 190 }); // 9:00
    fireEvent.mouseMove(block, { clientX: 150, clientY: 264 }); // +90 分钟、+1 天
    fireEvent.mouseUp(block);
    expect(onMove).toHaveBeenCalledWith("a", {
      date: "2026-08-04",
      time: "10:30",
      endTime: "11:30",
    });
    expect(onMove).toHaveBeenCalledWith("b", {
      date: "2026-08-04",
      time: "12:30",
      endTime: "13:30",
    });
  });

  it("纵向拖拽钳制在当天内（不越过午夜）", () => {
    const onMove = vi.fn();
    const a = ev("a", "夜跑", "23:00", "23:30");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onMove });
    const block = screen.getByRole("button", { name: /日程 夜跑/ });
    fireEvent.mouseDown(block, { clientX: 50, clientY: 860 }); // 23:00
    fireEvent.mouseMove(block, { clientX: 50, clientY: 1150 }); // 拖到可见区底部以下
    fireEvent.mouseUp(block);
    expect(onMove).toHaveBeenCalledWith("a", {
      date: "2026-08-03",
      time: "23:29",
      endTime: "23:59",
    });
  });
});
