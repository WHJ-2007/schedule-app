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

describe("WeekTimeline", () => {
  it("渲染 24 个小时刻度", () => {
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
    // 9.5h * 48px/h = 456px；1.5h * 48px/h = 72px
    expect(block.style.top).toBe("456px");
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
    expect(block.style.top).toBe("1008px"); // 21h * 48px/h
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
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientY: 144 }); // 3:00
    fireEvent.mouseMove(col, { clientY: 96 }); // 2:00
    fireEvent.mouseUp(col);
    expect(onAddDay).toHaveBeenCalledWith("2026-08-03", "02:00", "03:00");
  });

  it("拖选过程中显示高亮块，松开后消失", () => {
    renderTimeline(emptyWeek);
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

  it("拖选最小时长 30 分钟（原地按下松开）", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseDown(col, { clientY: 96 }); // 2:00
    fireEvent.mouseUp(col);
    expect(onAddDay).toHaveBeenCalledWith("2026-08-03", "02:00", "02:30");
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
