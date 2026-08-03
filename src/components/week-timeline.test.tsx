import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import WeekTimeline from "./week-timeline";
import { THEME_TOKENS } from "./theme-tokens";
import { getWeekDates } from "@/lib/date";
import type { ScheduleEvent } from "@/lib/events";

afterEach(() => {
  cleanup();
});

// 2026-08-03 是周一，整周固定日期便于断言
const dates = getWeekDates(new Date(2026, 7, 3));
const emptyWeek: ScheduleEvent[][] = Array.from({ length: 7 }, () => []);

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
    const events: ScheduleEvent[][] = [
      [
        {
          id: "a",
          title: "晨会",
          date: "2026-08-03",
          time: "09:30",
          endTime: "11:00",
          description: "",
          done: false,
        },
      ],
      ...Array.from({ length: 6 }, () => []),
    ];
    renderTimeline(events);
    const block = screen.getByRole("button", { name: /编辑 晨会/ });
    // 折叠凌晨后 9:30 位于 88(条带下沿) + 150min*0.8 = 208px；1.5h * 48px/h = 72px
    expect(block.style.top).toBe("208px");
    expect(block.style.height).toBe("72px");
    expect(block.textContent).toContain("09:30–11:00");
  });

  it("无结束时间的事件默认按 1 小时显示", () => {
    const events: ScheduleEvent[][] = [
      [
        {
          id: "b",
          title: "阅读",
          date: "2026-08-03",
          time: "21:00",
          description: "",
          done: false,
        },
      ],
      ...Array.from({ length: 6 }, () => []),
    ];
    renderTimeline(events);
    const block = screen.getByRole("button", { name: /编辑 阅读/ });
    expect(block.style.top).toBe("760px"); // 88 + (1260-420)min * 0.8px/min
    expect(block.style.height).toBe("48px"); // 默认 1 小时
  });

  it("全天事件显示在顶部全天区而非时间轴", () => {
    const events: ScheduleEvent[][] = [
      [
        {
          id: "c",
          title: "全天事项",
          date: "2026-08-03",
          time: "",
          description: "",
          done: false,
        },
      ],
      ...Array.from({ length: 6 }, () => []),
    ];
    renderTimeline(events);
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
    fireEvent.mouseDown(col, { clientY: 96 });
    fireEvent.mouseMove(col, { clientY: 144 });
    fireEvent.mouseUp(col);
    expect(onAddDay).toHaveBeenCalledWith("2026-08-03", "02:00", "03:00");
  });

  it("向上拖选时起止时间取最小最大", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientY: 144 }); // 3:00
    fireEvent.mouseMove(col, { clientY: 96 }); // 2:00
    fireEvent.mouseUp(col);
    expect(onAddDay).toHaveBeenCalledWith("2026-08-03", "02:00", "03:00");
  });

  it("拖选过程中显示高亮块，松开后消失", () => {
    renderTimeline(emptyWeek);
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientY: 96 });
    fireEvent.mouseMove(col, { clientY: 144 });
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
    fireEvent.mouseDown(col, { clientY: 96 }); // 2:00
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
    fireEvent.mouseDown(col, { clientY: 96 }); // 2:00
    fireEvent.mouseMove(col, { clientY: 108 }); // 2:15，仍吸附 2:00
    fireEvent.mouseUp(col);
    expect(onAddDay).not.toHaveBeenCalled();
  });

  it("点击事件块触发编辑", () => {
    const onEdit = vi.fn();
    const ev: ScheduleEvent = {
      id: "d",
      title: "评审",
      date: "2026-08-03",
      time: "14:00",
      endTime: "15:00",
      description: "",
      done: false,
    };
    renderTimeline([[ev], ...Array.from({ length: 6 }, () => [])], { onEdit });
    fireEvent.click(screen.getByRole("button", { name: /编辑 评审/ }));
    expect(onEdit).toHaveBeenCalledWith(ev);
  });

  it("列头跳月视图与 ＋ 添加", () => {
    const onJumpToMonth = vi.fn();
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onJumpToMonth, onAddDay });
    fireEvent.click(screen.getByRole("button", { name: "跳转到8月3日" }));
    expect(onJumpToMonth).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "在8月3日添加日程" }));
    expect(onAddDay).toHaveBeenCalledWith("2026-08-03");
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
    const events: ScheduleEvent[][] = [
      [
        {
          id: "e",
          title: "夜班",
          date: "2026-08-03",
          time: "02:00",
          endTime: "03:00",
          description: "",
          done: false,
        },
      ],
      ...Array.from({ length: 6 }, () => []),
    ];
    renderTimeline(events);
    expect(screen.queryByRole("button", { name: /编辑 夜班/ })).toBeNull();
    const band = screen.getByRole("button", { name: /展开凌晨时段/ });
    expect(band.textContent).toContain("1 项日程");
    // 展开后事件可见
    expandFold();
    expect(screen.getByRole("button", { name: /编辑 夜班/ })).toBeInTheDocument();
  });

  it("折叠时在折叠条上按下不开始拖选", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    // 60px 位于折叠条内（48–88px）
    fireEvent.mouseDown(col, { clientY: 60 });
    fireEvent.mouseMove(col, { clientY: 120 });
    fireEvent.mouseUp(col);
    expect(onAddDay).not.toHaveBeenCalled();
  });

  it("折叠条上方 0:00 区仍可拖选（不越过凌晨区）", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientY: 4 }); // 0:00（吸附）
    fireEvent.mouseMove(col, { clientY: 44 }); // 1:00（吸附，再往下就进入折叠条）
    fireEvent.mouseUp(col);
    expect(onAddDay).toHaveBeenCalledWith("2026-08-03", "00:00", "01:00");
  });
});
