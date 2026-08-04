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
    tokens: THEME_TOKENS,
    dates,
    eventsByDay,
    anchorKey: "2026-08-03",
    today: new Date(2026, 7, 3),
    onJumpToMonth: vi.fn(),
    onAddDay: vi.fn(),
    onEdit: vi.fn(),
    onToggleDone: vi.fn(),
    onDelete: vi.fn(),
    onMoveAll: vi.fn(),
    ...overrides,
  };
  return render(<WeekTimeline {...props} />);
}

function expandFold() {
  fireEvent.click(screen.getByRole("button", { name: /展开凌晨时段/ }));
}

describe("WeekTimeline", () => {
  it("滚动条压缩内部列时，表头行同步留白保持列对齐", () => {
    renderTimeline(emptyWeek);
    const scroller = screen.getByTestId("timeline-scroll") as HTMLElement;
    // 模拟右侧滚动条占 30px：内部可见宽度比外框窄
    Object.defineProperty(scroller, "offsetWidth", { value: 700, configurable: true });
    Object.defineProperty(scroller, "clientWidth", { value: 670, configurable: true });
    // 折叠状态变化触发 useLayoutEffect 重新测量（deps: dates/folded）
    fireEvent.click(screen.getByRole("button", { name: /展开凌晨时段/ }));
    fireEvent.click(screen.getByRole("button", { name: /收起凌晨时段/ }));
    expect(screen.getByTestId("header-scrollbar-gap")).toHaveStyle({ width: "30px" });
  });

  it("重复日程（多实例同 id）拖边缘只拉伸被拖的那一个实例", () => {
    renderTimeline([
      [ev("r", "重复日程", "09:00", "10:00", 0)],
      [ev("r", "重复日程", "09:00", "10:00", 1)],
      [ev("r", "重复日程", "09:00", "10:00", 2)],
      [ev("r", "重复日程", "09:00", "10:00", 3)],
      [ev("r", "重复日程", "09:00", "10:00", 4)],
      [ev("r", "重复日程", "09:00", "10:00", 5)],
      [ev("r", "重复日程", "09:00", "10:00", 6)],
    ]);
    let blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    fireEvent.click(blocks[0]);
    const handles = screen.getAllByTestId("resize-handle-end");
    expect(handles.length).toBe(7); // 同 id → 全部实例选中并显示手柄
    // 拖第一个实例的结束手柄：y 130 = 10:00，y 150 = 10:40
    fireEvent.pointerDown(handles[0], { pointerId: 1, clientX: 50, clientY: 130 });
    fireEvent.pointerMove(handles[0], { pointerId: 1, clientX: 50, clientY: 150 });
    blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    // 只有被拖的实例拉伸（9:00–10:40 = 100min → 50px），其余实例保持原时长 30px
    expect(blocks[0].style.height).toBe("50px");
    for (let i = 1; i < 7; i++) {
      expect(blocks[i].style.height).toBe("30px");
    }
  });

  it("重复日程整体拖动：拖入与其它事件重叠的列，仅被拖实例让位并排", () => {
    renderTimeline([
      [ev("r", "重复日程", "09:00", "10:00", 0)],
      [ev("r", "重复日程", "09:00", "10:00", 1), ev("b", "站会", "09:30", "10:30", 1)],
      [ev("r", "重复日程", "09:00", "10:00", 2)],
      [ev("r", "重复日程", "09:00", "10:00", 3)],
      [ev("r", "重复日程", "09:00", "10:00", 4)],
      [ev("r", "重复日程", "09:00", "10:00", 5)],
      [ev("r", "重复日程", "09:00", "10:00", 6)],
    ]);
    let blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    // 拖周一实例向右一列（dx=1）：与周二列的站会重叠 → 预览让位 2 轨
    fireEvent.pointerDown(blocks[0], { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerMove(blocks[0], { pointerId: 1, clientX: 150, clientY: 100 });
    blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    expect(blocks.length).toBe(7); // 同 id 实例与站会同列不冲突，全部正常渲染
    expect(blocks[0].style.width).toBe("calc(50% - 2px)"); // 周一实例预览在周二列占一轨
    fireEvent.pointerUp(blocks[0], { pointerId: 1 });
  });

  it("渲染小时刻度（默认折叠凌晨时段）", () => {
    renderTimeline(emptyWeek);
    expect(screen.getByText("7:00")).toBeInTheDocument();
    expect(screen.getByText("8:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
    expect(screen.queryByText("0:00")).toBeNull();
  });

  it("带时间的事件按起止时间定位成块", () => {
    renderTimeline([[ev("a", "晨会", "09:30", "11:00")], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    // 折叠凌晨后 9:30 位于 40(条带下沿) + 150min*0.5 = 115px；1.5h * 30px/h = 45px
    expect(block.style.top).toBe("115px");
    expect(block.style.height).toBe("45px");
    expect(block.textContent).toContain("09:30–11:00");
  });

  it("无结束时间的事件默认按 1 小时显示", () => {
    renderTimeline([[ev("b", "阅读", "21:00")], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 阅读/ });
    expect(block.style.top).toBe("460px"); // 40 + (1260-420)min * 0.5px/min
    expect(block.style.height).toBe("30px"); // 默认 1 小时
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
    // 60px → 2:00，90px → 3:00（列顶视口坐标 0，jsdom rect 全 0）
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 90 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).toHaveBeenCalledWith(["2026-08-03"], "02:00", "03:00");
  });

  it("向上拖选时起止时间取最小最大", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 90 }); // 3:00
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).toHaveBeenCalledWith(["2026-08-03"], "02:00", "03:00");
  });

  it("拖选过程中显示高亮块，松开后消失", () => {
    renderTimeline(emptyWeek);
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 90 });
    const hl = col.querySelector('[data-testid="drag-select"]');
    expect(hl).not.toBeNull();
    expect((hl as HTMLElement).style.top).toBe("60px"); // 2:00 * 0.5px/min
    expect((hl as HTMLElement).style.height).toBe("30px"); // 60 分钟
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(col.querySelector('[data-testid="drag-select"]')).toBeNull();
  });

  it("原地单击不触发创建，仅清除高亮", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    expect(col.querySelector('[data-testid="drag-select"]')).not.toBeNull();
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).not.toHaveBeenCalled();
    expect(col.querySelector('[data-testid="drag-select"]')).toBeNull();
  });

  it("拖动 15 分钟按精确时间新建（不再吸附整半点）", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 67.5 }); // 2:15
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).toHaveBeenCalledWith(["2026-08-03"], "02:00", "02:15");
  });

  it("拖选时间吸附到 5 分钟刻度提交", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 69 }); // 2:18 → 吸附 2:20
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).toHaveBeenCalledWith(["2026-08-03"], "02:00", "02:20");
  });

  it("拖动不足 5 分钟视为单击不新建", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 60.5 }); // 2:01，仅 1 分钟
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).not.toHaveBeenCalled();
  });

  it("点击事件块直接触发编辑回调并上报选中", () => {
    const onEdit = vi.fn();
    const onSelectionChange = vi.fn();
    const a = ev("d", "评审", "14:00", "15:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onEdit, onSelectionChange });
    fireEvent.click(screen.getByRole("button", { name: /日程 评审/ }));
    expect(onEdit).toHaveBeenCalledWith(a);
    expect(onSelectionChange).toHaveBeenCalledWith(["d"]);
  });

  it("双击列头跳月视图，单击列头选中该天，＋ 添加", () => {
    const onJumpToMonth = vi.fn();
    const onAddDay = vi.fn();
    const onSelectDate = vi.fn();
    renderTimeline(emptyWeek, { onJumpToMonth, onAddDay, onSelectDate });
    fireEvent.doubleClick(screen.getByRole("button", { name: "选择8月3日" }));
    expect(onJumpToMonth).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "选择8月4日" }));
    expect(onSelectDate).toHaveBeenCalledWith("2026-08-04");
    fireEvent.click(screen.getByRole("button", { name: "在8月3日添加日程" }));
    expect(onAddDay).toHaveBeenCalledWith(["2026-08-03"]);
  });

  it("空白单击选中该列日期", () => {
    const onSelectDate = vi.fn();
    renderTimeline(emptyWeek, { onSelectDate });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onSelectDate).toHaveBeenCalledWith("2026-08-03");
  });

  it("选中日列为高亮（anchor）", () => {
    const { container } = renderTimeline(emptyWeek);
    const col = container.querySelector('[data-date="2026-08-03"]')!;
    expect(col.className).toContain("border-blue-200");
  });

  it("列头“今”标记：今天在本周时显示在当天列", () => {
    renderTimeline(emptyWeek, { today: new Date(2026, 7, 4) }); // 8/4 在本周 8/3–8/9
    expect(screen.getByRole("button", { name: "选择8月4日" }).textContent).toContain("今");
    expect(screen.getByRole("button", { name: "选择8月3日" }).textContent).not.toContain("今");
  });

  it("列头“今”标记：今天不在本周时全部隐藏", () => {
    renderTimeline(emptyWeek, { today: new Date(2026, 7, 10) }); // 8/10 在下一周
    expect(screen.queryByText(/今/)).toBeNull();
  });
});

describe("WeekTimeline (凌晨折叠)", () => {
  it("默认折叠：0:00–6:00 刻度隐藏，显示折叠条", () => {
    renderTimeline(emptyWeek);
    expect(screen.queryByText("0:00")).toBeNull();
    expect(screen.queryByText("1:00")).toBeNull();
    expect(screen.queryByText("5:00")).toBeNull();
    expect(screen.getByText("7:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /展开凌晨时段/ })).toBeInTheDocument();
  });

  it("点击折叠条展开，凌晨刻度恢复", () => {
    renderTimeline(emptyWeek);
    expandFold();
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("1:00")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /收起凌晨时段/ })).toBeInTheDocument();
  });

  it("展开后可再收起", () => {
    renderTimeline(emptyWeek);
    expandFold();
    fireEvent.click(screen.getByRole("button", { name: /收起凌晨时段/ }));
    expect(screen.queryByText("0:00")).toBeNull();
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
    // 20px 位于顶部折叠条内（0–40px）
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 20 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 120 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).not.toHaveBeenCalled();
  });
});

describe("WeekTimeline (选择与框选)", () => {
  it("单击选中并上报，再点另一事件替换，点空白清除", () => {
    const onSelectionChange = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    const b = ev("b", "评审", "11:00", "12:00");
    renderTimeline([[a, b], ...emptyWeek.slice(1)], { onSelectionChange });
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a"]);
    fireEvent.click(screen.getByRole("button", { name: /日程 评审/ }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["b"]);
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 70 }); // 8:00 空白处
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it("框选覆盖多事件：松开变为选中而非新建", () => {
    const onAddDay = vi.fn();
    const onSelectionChange = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    const b = ev("b", "评审", "11:00", "12:00");
    renderTimeline([[a, b], ...emptyWeek.slice(1)], { onAddDay, onSelectionChange });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 70 }); // 8:00
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 205 }); // 12:30
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).not.toHaveBeenCalled();
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a", "b"]);
  });

  it("横向框选跨列选中两列事件", () => {
    const onSelectionChange = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00", 0);
    const b = ev("b", "评审", "11:00", "12:00", 1);
    const days = [...emptyWeek];
    days[0] = [a];
    days[1] = [b];
    renderTimeline(days, { onSelectionChange });
    fireEvent.pointerDown(document.querySelector('[data-date="2026-08-03"]')!, {
      pointerId: 1,
      clientX: 50,
      clientY: 70,
    });
    fireEvent.pointerMove(document.querySelector('[data-date="2026-08-04"]')!, {
      pointerId: 1,
      clientX: 150,
      clientY: 205,
    });
    fireEvent.pointerUp(document.querySelector('[data-date="2026-08-04"]')!, { pointerId: 1 });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a", "b"]);
  });

  it("横向拖拽空白区批量创建（同时间段多天）", () => {
    const onAddDay = vi.fn();
    renderTimeline(emptyWeek, { onAddDay });
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 250, clientY: 90 }); // 拖到第 3 列 → 3:00
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).toHaveBeenCalledWith(
      ["2026-08-03", "2026-08-04", "2026-08-05"],
      "02:00",
      "03:00"
    );
  });

  it("点击事件块直接触发编辑，再点另一事件替换编辑目标", () => {
    const onEdit = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    const b = ev("b", "评审", "11:00", "12:00");
    renderTimeline([[a, b], ...emptyWeek.slice(1)], { onEdit });
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }));
    expect(onEdit).toHaveBeenLastCalledWith(a);
    fireEvent.click(screen.getByRole("button", { name: /日程 评审/ }));
    expect(onEdit).toHaveBeenLastCalledWith(b);
  });

  it("拖选空白新建后清除残留选中", () => {
    const onAddDay = vi.fn();
    const onSelectionChange = vi.fn();
    const a = ev("a", "夜跑", "23:00", "23:30");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onAddDay, onSelectionChange });
    fireEvent.click(screen.getByRole("button", { name: /日程 夜跑/ }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a"]);
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 70 }); // 8:00 空白（夜跑在 23:00，矩形外）
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 205 }); // 12:30
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).toHaveBeenCalled();
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it("选中事件块标题展开显示完整标题，点空白后恢复截断", () => {
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    const title = block.querySelector("span")!;
    expect(title.className).toContain("truncate");
    expect(title.className).not.toContain("max-h-16");
    fireEvent.click(block);
    expect(title.className).toContain("max-h-16");
    expect(title.className).not.toContain("truncate");
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 70 }); // 8:00 空白处
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(title.className).toContain("truncate");
  });

  it("拖动事件松手后不触发编辑（抑制随后的 click）", () => {
    const onEdit = vi.fn();
    const onMoveAll = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onEdit, onMoveAll });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 150, clientY: 140 });
    fireEvent.pointerUp(block, { pointerId: 1 });
    fireEvent.click(block); // 模拟拖拽后浏览器仍派发 click
    expect(onMoveAll).toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });
});

describe("WeekTimeline (整体挪动)", () => {
  it("拖动单个事件跨天平移，松手提交，预览使用 transform", () => {
    const onMoveAll = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onMoveAll });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 }); // 9:00
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 150, clientY: 140 }); // 620min → 10:20，+80 分钟、+1 天（精确分钟不吸附）
    expect(block.style.transform).toBe("translate(100px, 40px)");
    fireEvent.pointerUp(block, { pointerId: 1 });
    expect(block.style.transform).toBe("");
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-04", time: "10:20", endTime: "11:20" },
    ]);
  });

  it("整体挪动选中组：全部事件同时平移", () => {
    const onMoveAll = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    const b = ev("b", "评审", "11:00", "12:00");
    renderTimeline([[a, b], ...emptyWeek.slice(1)], { onMoveAll });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 70 }); // 框选
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 205 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 }); // 9:00
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 150, clientY: 140 }); // +80 分钟（精确）、+1 天
    fireEvent.pointerUp(block, { pointerId: 1 });
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-04", time: "10:20", endTime: "11:20" },
      { id: "b", date: "2026-08-04", time: "12:20", endTime: "13:20" },
    ]);
  });

  it("整体挪动落点吸附到 5 分钟（偏移非 5 倍数时取整）", () => {
    const onMoveAll = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onMoveAll });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 }); // 9:00
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 150, clientY: 141.5 }); // 10:23，偏移 83 分钟
    fireEvent.pointerUp(block, { pointerId: 1 });
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-04", time: "10:25", endTime: "11:25" }, // 83 → 85（吸附 5 分钟）
    ]);
  });

  it("挪动落点绝对对齐：事件时间本身以 5 为倍数（不再对相对偏移取整产生 1/6/11 结尾）", () => {
    const onMoveAll = vi.fn();
    // 起点 9:03（非 5 倍数）：拖 1 分钟后落点应为 9:05 而不是 9:04
    const a = ev("a", "晨会", "09:03", "10:03");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onMoveAll });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 }); // 按下处 9:00
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 50, clientY: 100.5 }); // +1 分钟
    fireEvent.pointerUp(block, { pointerId: 1 });
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-03", time: "09:05", endTime: "10:05" },
    ]);
  });

  it("纵向拖拽钳制在当天内（不越过午夜）", () => {
    const onMoveAll = vi.fn();
    const a = ev("a", "夜跑", "23:00", "23:30");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onMoveAll });
    const block = screen.getByRole("button", { name: /日程 夜跑/ });
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 522.5 }); // 23:00（块位于 520–535）
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 50, clientY: 734 }); // 拖到可见区底部以下
    fireEvent.pointerUp(block, { pointerId: 1 });
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-03", time: "23:29", endTime: "23:59" },
    ]);
  });
});

describe("WeekTimeline (悬停高亮)", () => {
  // 列 0 是 anchor 列（拿 columnHighlight 而非 columnHover），悬停断言用 col1/col2
  const col1 = () => document.querySelector('[data-date="2026-08-04"]')!;
  const col2 = () => document.querySelector('[data-date="2026-08-05"]')!;
  const timelineContainer = () => screen.getByRole("button", { name: /展开凌晨时段/ }).parentElement!;

  it("悬停列高亮对应日期列与小时刻度", () => {
    renderTimeline(emptyWeek);
    fireEvent.mouseMove(col1(), { clientX: 150, clientY: 70 }); // 8:00
    expect(col1().className).toContain("bg-neutral-100/70");
    expect(screen.getByText("8:00").className).toContain("text-blue-600");
  });

  it("移动到另一列另一时刻，高亮随之切换", () => {
    renderTimeline(emptyWeek);
    fireEvent.mouseMove(col1(), { clientX: 150, clientY: 70 }); // 8:00
    fireEvent.mouseMove(col2(), { clientX: 250, clientY: 140 }); // 原始分钟 620 → 10:20，高亮 10:00
    expect(col1().className).not.toContain("bg-neutral-100/70");
    expect(col2().className).toContain("bg-neutral-100/70");
    expect(screen.getByText("10:00").className).toContain("text-blue-600");
    expect(screen.getByText("8:00").className).not.toContain("text-blue-600");
  });

  it("鼠标离开时间轴后高亮清除", () => {
    renderTimeline(emptyWeek);
    fireEvent.mouseMove(col2(), { clientX: 250, clientY: 140 });
    // React onMouseLeave 基于 mouseout/relatedTarget 实现
    fireEvent.mouseOut(timelineContainer(), { relatedTarget: document.body });
    expect(col2().className).not.toContain("bg-neutral-100/70");
    expect(screen.getByText("10:00").className).not.toContain("text-blue-600");
  });

  it("悬停不干扰事件块拖拽", () => {
    const onMoveAll = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onMoveAll });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.mouseMove(block, { clientX: 50, clientY: 140 }); // 悬停 10:20 → 10:00 刻度高亮
    expect(screen.getByText("10:00").className).toContain("text-blue-600");
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 }); // 9:00
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 150, clientY: 140 }); // +80 分钟（精确）、+1 天
    expect(onMoveAll).not.toHaveBeenCalled(); // 拖拽期间悬停高亮已清除
    expect(screen.getByText("10:00").className).not.toContain("text-blue-600");
    fireEvent.pointerUp(block, { pointerId: 1 });
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-04", time: "10:20", endTime: "11:20" },
    ]);
  });
});

describe("WeekTimeline (光标横线与时刻标签)", () => {
  const col1 = () => document.querySelector('[data-date="2026-08-04"]')!;
  const timelineContainer = () => screen.getByRole("button", { name: /展开凌晨时段/ }).parentElement!;

  it("悬停显示横向光标线，时刻标签吸附到 5 分钟刻度", () => {
    renderTimeline(emptyWeek);
    fireEvent.mouseMove(col1(), { clientX: 150, clientY: 138 }); // 原始分钟 616 → 吸附 615 = 10:15
    const line = document.querySelector('[data-testid="cursor-line"]');
    expect(line).not.toBeNull();
    // 折叠后 (615-420)*0.5+40 = 137.5px
    expect((line as HTMLElement).style.top).toBe("137.5px");
    expect(screen.getByTestId("cursor-label").textContent).toBe("10:15");
    expect(screen.queryByText("10:16")).toBeNull();
  });

  it("鼠标离开时间轴后横线与标签消失", () => {
    renderTimeline(emptyWeek);
    fireEvent.mouseMove(col1(), { clientX: 150, clientY: 140 });
    fireEvent.mouseOut(timelineContainer(), { relatedTarget: document.body });
    expect(document.querySelector('[data-testid="cursor-line"]')).toBeNull();
    expect(screen.queryByTestId("cursor-label")).toBeNull();
  });

  it("折叠条上悬停不显示横线", () => {
    renderTimeline(emptyWeek);
    fireEvent.mouseMove(col1(), { clientX: 150, clientY: 20 }); // 条带内 0–40px
    expect(document.querySelector('[data-testid="cursor-line"]')).toBeNull();
  });

  it("单击事件块（指针序列，不派发 click）也选中并打开编辑面板", () => {
    const onEdit = vi.fn();
    const onSelectionChange = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onEdit, onSelectionChange });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    // 真实浏览器中 pointer capture 把 click 重派发到列而非事件块，onClick 收不到：
    // 单击路径改由 pointerup 处理（dx=0 且 dy=0）
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 }); // 9:00
    fireEvent.pointerUp(block, { pointerId: 1, clientX: 50, clientY: 100 });
    expect(onEdit).toHaveBeenCalledWith(a);
    expect(onSelectionChange).toHaveBeenCalledWith(["a"]);
  });

  it("松手提交渲染时 transform 参与过渡，块从松手位置平滑落到落点", () => {
    renderTimeline([[ev("a", "晨会", "09:00", "10:00")], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    expect(block.style.transitionProperty).toBe("");
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 }); // 9:00
    // 拖动中只过渡轨道（left/width），transform 由指针驱动不参与过渡
    expect(block.style.transitionProperty).toBe("left,width");
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 150, clientY: 140 }); // +80 分钟、+1 天
    fireEvent.pointerUp(block, { pointerId: 1 });
    // 提交渲染：transform 与 top 一起过渡，视觉上直接落到吸附落点而非跳回起点
    expect(block.style.transitionProperty).toBe("top,left,width,height,transform");
    // 新一次拖拽按下：落位过渡结束，恢复拖动中的轨道过渡
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 150, clientY: 140 });
    expect(block.style.transitionProperty).toBe("left,width");
    fireEvent.pointerUp(block, { pointerId: 1 });
  });

  it("拖动中出现重叠立即重排：其他块实时让位（不松手也播放收缩动画）", () => {
    const onMoveAll = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    const b = ev("b", "评审", "09:30", "10:30");
    const c = ev("c", "健身", "11:00", "12:00");
    renderTimeline([[a, b, c], ...emptyWeek.slice(1)], { onMoveAll });
    const blockA = screen.getByRole("button", { name: /日程 晨会/ });
    const blockB = screen.getByRole("button", { name: /日程 评审/ });
    const blockC = screen.getByRole("button", { name: /日程 健身/ });
    // 初始：a 与 b 重叠并排（各 50%），c 独占整行
    expect(blockB.style.width).toBe("calc(50% - 2px)");
    expect(blockC.style.width).toBe("calc(100% - 2px)");
    fireEvent.pointerDown(blockA, { pointerId: 1, clientX: 50, clientY: 100 }); // 9:00
    fireEvent.pointerMove(blockA, { pointerId: 1, clientX: 50, clientY: 160 }); // 11:00，+120 分钟
    // 不松手：a 挪到 11:00 与 c 重叠 → b 立即补满整行、c 让出半边、a 预览目标轨道（右轨）
    expect(blockB.style.width).toBe("calc(100% - 2px)");
    expect(blockC.style.width).toBe("calc(50% - 2px)");
    expect(blockC.style.left).toBe("0%");
    expect(blockA.style.left).toBe("50%");
    expect(blockA.style.width).toBe("calc(50% - 2px)");
    expect(blockA.style.transform).toBe("translate(0px, 60px)");
    fireEvent.pointerUp(blockA, { pointerId: 1 });
    // 松手提交后恢复真实排布（mock 未真的移动日程）
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-03", time: "11:00", endTime: "12:00" },
    ]);
    expect(blockB.style.width).toBe("calc(50% - 2px)");
    expect(blockC.style.width).toBe("calc(100% - 2px)");
  });

  it("拖动跨天时目标列的日程实时收缩让位", () => {
    const onMoveAll = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    const c = ev("c", "健身", "11:00", "12:00", 1); // 第 2 天
    renderTimeline([[a], [c], ...emptyWeek.slice(2)], { onMoveAll });
    const blockA = screen.getByRole("button", { name: /日程 晨会/ });
    const blockC = screen.getByRole("button", { name: /日程 健身/ });
    fireEvent.pointerDown(blockA, { pointerId: 1, clientX: 50, clientY: 100 }); // 9:00
    fireEvent.pointerMove(blockA, { pointerId: 1, clientX: 150, clientY: 160 }); // 第 2 天 11:00
    // 不松手：c 让出半边，a 预览占右轨
    expect(blockC.style.width).toBe("calc(50% - 2px)");
    expect(blockA.style.left).toBe("50%");
    expect(blockA.style.transform).toBe("translate(100px, 60px)");
    fireEvent.pointerUp(blockA, { pointerId: 1 });
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-04", time: "11:00", endTime: "12:00" },
    ]);
  });

  it("现在线高亮当前时刻，进行中日程蓝色描边", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 10, 30)); // 周一 10:30
    renderTimeline([
      [
        ev("a", "晨会", "10:00", "11:00"), // 进行中
        ev("b", "评审", "09:00", "10:00"), // 已结束
        ev("c", "健身", "09:00", "11:30"), // 进行中
      ],
      ...emptyWeek.slice(1),
    ]);
    const line = screen.getByTestId("now-line");
    // 折叠凌晨后 10:30 = 40 + (630-420)*0.5 = 145px
    expect(line.style.top).toBe("145px");
    const blockA = screen.getByRole("button", { name: /日程 晨会/ });
    const blockB = screen.getByRole("button", { name: /日程 评审/ });
    const blockC = screen.getByRole("button", { name: /日程 健身/ });
    expect(blockA.style.boxShadow).toContain("rgb(59 130 246");
    expect(blockC.style.boxShadow).toContain("rgb(59 130 246");
    expect(blockB.style.boxShadow).toBe("");
    vi.useRealTimers();
  });

  it("现在线在凌晨折叠区内（此刻早于 7:00）不显示", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 3, 0));
    renderTimeline(emptyWeek);
    expect(screen.queryByTestId("now-line")).toBeNull();
    vi.useRealTimers();
  });

  it("可视范围不含今天（其他周）时不显示现在线、不高亮日程", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 10, 30));
    const otherWeek = getWeekDates(new Date(2026, 6, 27)); // 上一周
    const a = ev("a", "晨会", "10:00", "11:00");
    render(
      <WeekTimeline
        tokens={THEME_TOKENS}
        dates={otherWeek}
        eventsByDay={[[{ ...a, date: toDateKey(otherWeek[0]) }], ...Array.from({ length: 6 }, () => [])]}
        anchorKey="2026-07-27"
        today={new Date(2026, 7, 3)}
        onJumpToMonth={vi.fn()}
        onAddDay={vi.fn()}
        onEdit={vi.fn()}
        onToggleDone={vi.fn()}
        onDelete={vi.fn()}
        onMoveAll={vi.fn()}
      />
    );
    expect(screen.queryByTestId("now-line")).toBeNull();
    expect(screen.getByRole("button", { name: /日程 晨会/ }).style.boxShadow).toBe("");
    vi.useRealTimers();
  });

  it("拖边缘调整时块内时间标签实时跟随、气泡显示调整后区间，松手提交", () => {
    const onMoveAll = vi.fn();
    renderTimeline([[ev("a", "晨会", "09:00", "10:00")], ...emptyWeek.slice(1)], { onMoveAll });
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }));
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    const handle = screen.getByTestId("resize-handle-end");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 50, clientY: 130 }); // 10:00
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 150 }); // (150-40)*2+420=640 → 10:40
    expect(block.textContent).toContain("09:00–10:40"); // 块内实时写时间
    // 拖拽气泡与块内标签同时显示同一区间
    expect(screen.getAllByText("09:00–10:40").length).toBeGreaterThanOrEqual(2);
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(screen.queryByText("09:00–10:40")).toBeNull();
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-03", time: "09:00", endTime: "10:40" },
    ]);
  });

  it("拖拽期间不显示横线", () => {
    renderTimeline(emptyWeek);
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.mouseMove(col, { clientX: 50, clientY: 60 });
    expect(document.querySelector('[data-testid="cursor-line"]')).not.toBeNull();
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 });
    expect(document.querySelector('[data-testid="cursor-line"]')).toBeNull();
    fireEvent.pointerUp(col, { pointerId: 1 });
  });
});

describe("WeekTimeline (拖拽时间气泡)", () => {
  it("拖选时跟随显示起止时间，松手后消失", () => {
    renderTimeline(emptyWeek);
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 90 }); // 3:00
    expect(screen.getByText("02:00–03:00")).toBeInTheDocument();
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(screen.queryByText("02:00–03:00")).toBeNull();
  });

  it("横向跨列拖选显示日期范围", () => {
    renderTimeline(emptyWeek);
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 250, clientY: 90 }); // 拖到第 3 列
    expect(screen.getByText("8月3日–8月5日 02:00–03:00")).toBeInTheDocument();
  });

  it("挪动事件时显示目标日期与时间，提交后消失", () => {
    const onMoveAll = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onMoveAll });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 }); // 9:00
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 150, clientY: 140 }); // +80 分钟（精确）、+1 天
    expect(screen.getByText("8月4日 10:20–11:20")).toBeInTheDocument();
    fireEvent.pointerUp(block, { pointerId: 1 });
    expect(screen.queryByText("8月4日 10:20–11:20")).toBeNull();
  });
});

describe("WeekTimeline (重叠事件并排)", () => {
  it("同一时段重叠事件按轨道并排，宽度均分", () => {
    const a = ev("a", "会议", "09:00", "10:30");
    const b = ev("b", "访谈", "09:30", "10:00");
    renderTimeline([[a, b], ...emptyWeek.slice(1)]);
    const ba = screen.getByRole("button", { name: /日程 会议/ });
    const bb = screen.getByRole("button", { name: /日程 访谈/ });
    // 起点早的占左轨道，宽各 50%
    expect(ba.style.left).toBe("0%");
    expect(ba.style.width).toBe("calc(50% - 2px)");
    expect(bb.style.left).toBe("50%");
    expect(bb.style.width).toBe("calc(50% - 2px)");
  });

  it("链式重叠归入同一簇：A 结束后 C 复用其轨道（簇内最大并发 2）", () => {
    const a = ev("a", "A", "09:00", "10:00");
    const b = ev("b", "B", "09:30", "10:30");
    const c = ev("c", "C", "10:00", "11:00");
    renderTimeline([[a, b, c], ...emptyWeek.slice(1)]);
    const ba = screen.getByRole("button", { name: /日程 A/ });
    const bb = screen.getByRole("button", { name: /日程 B/ });
    const bc = screen.getByRole("button", { name: /日程 C/ });
    // 簇内最大并发 2：A、C 在左轨，B 在右轨，各宽 50%
    expect(ba.style.left).toBe("0%");
    expect(bb.style.left).toBe("50%");
    expect(bb.style.width).toBe("calc(50% - 2px)");
    expect(bc.style.left).toBe("0%");
    expect(bc.style.width).toBe("calc(50% - 2px)");
  });

  it("不重叠事件占满整列宽度", () => {
    const a = ev("a", "晨会", "09:00", "10:00");
    const b = ev("b", "评审", "11:00", "12:00");
    renderTimeline([[a, b], ...emptyWeek.slice(1)]);
    const ba = screen.getByRole("button", { name: /日程 晨会/ });
    expect(ba.style.left).toBe("0%");
    expect(ba.style.width).toBe("calc(100% - 2px)");
  });

  it("事件块带平滑过渡类，拖动/调整中禁过渡", () => {
    renderTimeline([[ev("a", "晨会", "09:30", "11:00")], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    expect(block.className).toContain(
      "transition-[top,left,width,height,background-color,opacity,filter,scale]"
    );
    expect(block.className).not.toContain("anim-fold");
  });

  it("选中事件块出现上下调整手柄", () => {
    renderTimeline([[ev("a", "晨会", "09:30", "11:00")], ...emptyWeek.slice(1)]);
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }));
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    expect(block.querySelector('[data-testid="resize-handle-start"]')).not.toBeNull();
    expect(block.querySelector('[data-testid="resize-handle-end"]')).not.toBeNull();
  });

  it("未选中时无调整手柄", () => {
    renderTimeline([[ev("a", "晨会", "09:30", "11:00")], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    expect(block.querySelector('[data-testid="resize-handle-start"]')).toBeNull();
  });

  it("拖下边缘调整结束时间：松手提交新 endTime", () => {
    const onMoveAll = vi.fn();
    renderTimeline([[ev("a", "晨会", "09:00", "10:00")], ...emptyWeek.slice(1)], { onMoveAll });
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }));
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    const handle = screen.getByTestId("resize-handle-end");
    // 折叠态 rawMinAtY = (y-40)*2+420：块底端 130px = 10:00，拖到 190px = 12:00
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 50, clientY: 130 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 190 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-03", time: "09:00", endTime: "12:00" },
    ]);
  });

  it("拖上边缘调整开始时间：松手提交新 time，结束不变", () => {
    const onMoveAll = vi.fn();
    renderTimeline([[ev("a", "晨会", "09:00", "10:00")], ...emptyWeek.slice(1)], { onMoveAll });
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }));
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    const handle = screen.getByTestId("resize-handle-start");
    // 块顶 100px = 09:00，拖到 115px = 09:30
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 115 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-03", time: "09:30", endTime: "10:00" },
    ]);
  });

  it("调整时长不小于 5 分钟：拖过开始时刻被钳制", () => {
    const onMoveAll = vi.fn();
    renderTimeline([[ev("a", "晨会", "09:00", "10:00")], ...emptyWeek.slice(1)], { onMoveAll });
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }));
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    const handle = screen.getByTestId("resize-handle-end");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 50, clientY: 130 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 102 }); // 09:02 → 钳制 09:05
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-03", time: "09:00", endTime: "09:05" },
    ]);
  });

  it("选中事件块后出现批量颜色工具条", () => {
    renderTimeline([[ev("a", "晨会", "09:30", "11:00")], ...emptyWeek.slice(1)]);
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }));
    expect(screen.getByTestId("batch-color-bar")).toBeInTheDocument();
    expect(screen.getByText("已选 1")).toBeInTheDocument();
  });

  it("工具条点色点批量回调全部选中", () => {
    const onBatchColor = vi.fn();
    renderTimeline(
      [[ev("a", "晨会", "09:30", "11:00"), ev("b", "评审", "10:00", "11:00")], ...emptyWeek.slice(1)],
      { onBatchColor }
    );
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    // 展开态 1px = 2 分钟：150px=05:00、400px=13:20，框选覆盖两块
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 150 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 400 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(screen.getByText("已选 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "批量颜色 #ef4444" }));
    expect(onBatchColor).toHaveBeenCalledWith(["a", "b"], "#ef4444");
  });

  it("自定义颜色的日程块半透明底色＋左侧色条，未设色不覆盖主题色", () => {
    const colored = { ...ev("a", "晨会", "09:30", "11:00"), color: "#ef4444" };
    renderTimeline([[colored, ev("b", "评审", "09:00", "10:00")], ...emptyWeek.slice(1)]);
    const coloredBlock = screen.getByRole("button", { name: /日程 晨会/ });
    expect(coloredBlock.style.backgroundColor).toBe("rgba(239, 68, 68, 0.35)"); // 色值 + 35% 透明度
    expect(coloredBlock.style.borderLeft).toBe("3px solid rgb(239, 68, 68)");
    expect(coloredBlock.className).toContain("glass-hover"); // 毛玻璃
    const plainBlock = screen.getByRole("button", { name: /日程 评审/ });
    expect(plainBlock.style.backgroundColor).toBe("");
  });

  it("自定义颜色的全天条目毛玻璃半透明底＋色条", () => {
    const colored = { ...ev("c", "全天事项", ""), color: "#22c55e" };
    renderTimeline([[colored], ...emptyWeek.slice(1)]);
    const item = screen.getByRole("button", { name: /编辑 全天事项/ });
    expect(item.style.backgroundColor).toBe("rgba(34, 197, 94, 0.35)");
    expect(item.style.borderLeft).toBe("3px solid rgb(34, 197, 94)");
    expect(item.className).toContain("glass-hover");
    expect(item.className).not.toContain("text-white!");
  });
});
