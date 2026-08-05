import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
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
    onPostpone: vi.fn(),
    onEndEarly: vi.fn(),
    onStretch: vi.fn(),
    onStretchRepeat: vi.fn(),
    onCopy: vi.fn(),
    ...overrides,
  };
  return render(<WeekTimeline {...props} />);
}

function expandFold() {
  fireEvent.click(screen.getByRole("button", { name: /展开凌晨时段/ }));
}

describe("WeekTimeline", () => {
  it("滚动条出现/消失时占位宽度动态重测（表单开关、内容增减场景）", () => {
    const roCbs: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          roCbs.push(cb);
        }
        observe() {}
        disconnect() {}
      }
    );
    renderTimeline(emptyWeek);
    expect(screen.getByTestId("header-scrollbar-gap")).toHaveStyle({ width: "0px" });
    const scroller = screen.getByTestId("timeline-scroll") as HTMLElement;
    // 内容超高出现滚动条：clientWidth 变窄，ResizeObserver 回调触发重测
    Object.defineProperty(scroller, "offsetWidth", { value: 700, configurable: true });
    Object.defineProperty(scroller, "clientWidth", { value: 670, configurable: true });
    act(() => {
      roCbs[0]();
    });
    expect(screen.getByTestId("header-scrollbar-gap")).toHaveStyle({ width: "30px" });
    // 滚动条消失（如表单收起时间轴区变高）：回到 0
    Object.defineProperty(scroller, "clientWidth", { value: 700, configurable: true });
    act(() => {
      roCbs[0]();
    });
    expect(screen.getByTestId("header-scrollbar-gap")).toHaveStyle({ width: "0px" });
    vi.unstubAllGlobals();
  });

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

  it("重复日程整体拖动：提交只动被按的那个实例（其余实例留在原列）", () => {
    const onMoveAll = vi.fn();
    renderTimeline(
      [
        [ev("r", "重复日程", "09:00", "10:00", 0)],
        [ev("r", "重复日程", "09:00", "10:00", 1)],
        ...emptyWeek.slice(2),
      ],
      { onMoveAll }
    );
    let blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    fireEvent.pointerDown(blocks[0], { pointerId: 1, clientX: 50, clientY: 100 }); // 周一实例 9:00
    fireEvent.pointerMove(blocks[0], { pointerId: 1, clientX: 150, clientY: 100 }); // 横向 +1 天，纵向不动
    blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    // 预览：只有被按实例带位移，周二实例不动
    expect(blocks[0].style.transform).toBe("translate(100px, 0px)");
    expect(blocks[1].style.transform).toBe("");
    fireEvent.pointerUp(blocks[0], { pointerId: 1 });
    // 提交：单条 patch，只含被按实例（旧 bug：find 只找第一个实例 → 同 id 实例集体错动）
    expect(onMoveAll).toHaveBeenCalledTimes(1);
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "r", date: "2026-08-04", time: "09:00", endTime: "10:00" },
    ]);
  });

  it("多选拖动：重复日程共享起点日（byDay 真实形态）实例不自我重叠缩小", () => {
    // 真实 app 的 byDay 把同一事件对象推入每天数组：实例 date 字段全是起点日。
    // 旧 bug：预览把同 id 全部实例按起点日映射到同一列 → 自我重叠 → 最左实例缩成半宽
    const shared = ev("r", "重复日程", "09:00", "10:00", 0); // date = 2026-08-03（周一）
    const b = ev("b", "评审", "14:00", "15:00", 3);
    const days = [...emptyWeek];
    days[0] = [shared];
    days[1] = [shared];
    days[3] = [b];
    renderTimeline(days);
    // 框选 09:00–15:00 跨列：选中 r 与 b 两个 id
    fireEvent.pointerDown(document.querySelector('[data-date="2026-08-03"]')!, {
      pointerId: 1,
      clientX: 50,
      clientY: 100,
    });
    fireEvent.pointerMove(document.querySelector('[data-date="2026-08-06"]')!, {
      pointerId: 1,
      clientX: 350,
      clientY: 280,
    });
    fireEvent.pointerUp(document.querySelector('[data-date="2026-08-06"]')!, {
      pointerId: 1,
      clientX: 350,
      clientY: 280,
    });
    expect(screen.getByText("已选 2")).toBeInTheDocument(); // 多选生效
    let blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    fireEvent.pointerDown(blocks[0], { pointerId: 1, clientX: 50, clientY: 100 }); // 按周一实例
    fireEvent.pointerMove(blocks[0], { pointerId: 1, clientX: 150, clientY: 100 }); // 横向 +1 天
    blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    // 预览：实例之间没有真实重叠，两个实例都不缩小
    expect(blocks[0].style.width).toBe("calc(100% - 2px)");
    expect(blocks[1].style.width).toBe("calc(100% - 2px)");
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
    // 冻结在事件开始前：避免运行时段落入事件窗口使按钮出现、时间行被隐藏
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 8, 0));
    renderTimeline([[ev("a", "晨会", "09:30", "11:00")], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    // 折叠凌晨后 9:30 位于 40(条带下沿) + 150min*0.5 = 115px；1.5h * 30px/h = 45px
    expect(block.style.top).toBe("115px");
    expect(block.style.height).toBe("45px");
    expect(block.textContent).toContain("09:30–11:00");
    vi.useRealTimers();
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

  it("右键事件块上报选中并弹菜单，点「编辑」触发编辑回调", () => {
    const onEdit = vi.fn();
    const onSelectionChange = vi.fn();
    const a = ev("d", "评审", "14:00", "15:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onEdit, onSelectionChange });
    fireEvent.contextMenu(screen.getByRole("button", { name: /日程 评审/ }), { clientX: 120, clientY: 80 });
    expect(onEdit).not.toHaveBeenCalled(); // 不直接打开编辑
    expect(onSelectionChange).toHaveBeenCalledWith(["d"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑" }));
    expect(onEdit).toHaveBeenCalledWith(a);
  });

  it("右键菜单含「删除」，点删除触发删除回调并关闭菜单", () => {
    const onDelete = vi.fn();
    const a = ev("d", "评审", "14:00", "15:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onDelete });
    fireEvent.contextMenu(screen.getByRole("button", { name: /日程 评审/ }), { clientX: 120, clientY: 80 });
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));
    expect(onDelete).toHaveBeenCalledWith("d");
    expect(screen.queryByRole("menu")).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }), { detail: 1 });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a"]);
    fireEvent.click(screen.getByRole("button", { name: /日程 评审/ }), { detail: 1 });
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

  it("右键事件块弹菜单，再点另一事件菜单替换编辑目标", () => {
    const onEdit = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    const b = ev("b", "评审", "11:00", "12:00");
    renderTimeline([[a, b], ...emptyWeek.slice(1)], { onEdit });
    fireEvent.contextMenu(screen.getByRole("button", { name: /日程 晨会/ }), { clientX: 120, clientY: 80 });
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑" }));
    expect(onEdit).toHaveBeenLastCalledWith(a);
    fireEvent.contextMenu(screen.getByRole("button", { name: /日程 评审/ }), { clientX: 120, clientY: 80 });
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑" }));
    expect(onEdit).toHaveBeenLastCalledWith(b);
  });

  it("拖选空白新建：本地清空选中但不上报父层（表单保留不被误关）", () => {
    const onAddDay = vi.fn();
    const onSelectionChange = vi.fn();
    const a = ev("a", "夜跑", "23:00", "23:30");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onAddDay, onSelectionChange });
    fireEvent.click(screen.getByRole("button", { name: /日程 夜跑/ }), { detail: 1 });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a"]);
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 70 }); // 8:00 空白（夜跑在 23:00，矩形外）
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 205 }); // 12:30
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onAddDay).toHaveBeenCalled();
    // 本地选中清掉（块高亮消失），但父层选中保持：拖选新建的表单刚打开，上报空集会被父层误关
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a"]);
    expect(screen.getByRole("button", { name: /日程 夜跑/ }).className).not.toContain("ring-2");
  });

  it("选中事件块标题展开显示完整标题，点空白后恢复截断", () => {
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    const title = block.querySelector("span")!;
    expect(title.className).toContain("max-h-4"); // 未选中：一行截断（标题自然换行但被 max-h 裁切）
    expect(title.className).not.toContain("max-h-16");
    fireEvent.click(block, { detail: 1 });
    expect(title.className).toContain("max-h-16");
    expect(title.className).not.toContain("max-h-4");
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 70 }); // 8:00 空白处
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(title.className).toContain("max-h-4");
  });

  it("时间轴底部标 24:00（折叠与展开都显示）", () => {
    renderTimeline(emptyWeek);
    expect(screen.getByText("24:00")).toBeInTheDocument(); // 折叠时最后一行 23:00–24:00
    expect(screen.queryByText("0:00")).toBeNull(); // 折叠时凌晨区收进条带
    expandFold();
    expect(screen.getByText("24:00")).toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("短卡片悬停自动展开到完整标题高度，移走恢复", () => {
    // jsdom 不计算布局：模拟标题完整高度 48px（3 行）
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(48);
    const a = ev("a", "晨会", "09:00", "09:15"); // 15 分钟 = 7.5px，标题被裁
    renderTimeline([[a], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    expect(block.style.height).toBe("7.5px");
    fireEvent.pointerOver(block);
    expect(block.style.height).toBe("67px"); // 48(标题) + 19(时间行/留白)
    expect(block.style.zIndex).toBe("40"); // 展开块置顶，不被相邻事件/进行中高亮挡住
    fireEvent.pointerOut(block);
    expect(block.style.height).toBe("7.5px");
  });

  it("已完成日程时间块改为低饱和深绿亚克力（灰绿半透明底＋墨绿色条＋划线，文字保持深色清晰）", () => {
    const a = { ...ev("a", "晨会", "09:00", "10:00"), done: true };
    renderTimeline([[a], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    expect(block.style.backgroundColor).toBe("rgba(124, 162, 140, 0.45)");
    expect(block.style.borderLeft).toBe("3px solid rgb(44, 98, 70)");
    expect(block.className).not.toContain("opacity-40");
    expect(block.className).not.toContain("grayscale");
    const title = block.querySelector("span")!;
    expect(title.className).toContain("line-through");
  });

  it("已过期未完成（今天已过结束时刻）时间块改为暗红亚克力，文字保持深色无划线", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 15, 0)); // 周一 15:00
    const a = { ...ev("a", "早间例会", "09:00", "14:00") };
    renderTimeline([[a], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 早间例会/ });
    expect(block.style.backgroundColor).toBe("rgba(185, 96, 84, 0.4)");
    expect(block.style.borderLeft).toBe("3px solid rgb(150, 56, 48)");
    expect(block.style.boxShadow).toBe(""); // 已过结束：不再进行中蓝环
    const title = block.querySelector("span")!;
    expect(title.className).not.toContain("line-through");
    vi.useRealTimers();
  });

  it("未来日期的日程即使结束时刻早于现在也不标过期", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 15, 0)); // 周一 15:00
    const a = ev("a", "明日例会", "14:00", "15:00", 1); // 周二 8/4 14:00-15:00
    renderTimeline([emptyWeek[0], [a], ...emptyWeek.slice(2)]);
    const block = screen.getByRole("button", { name: /日程 明日例会/ });
    expect(block.style.backgroundColor).toBe("");
    expect(block.style.borderLeft).toBe("");
    vi.useRealTimers();
  });

  it("从未完成变完成瞬间播放绿色成就动画，1 秒后动画位清除", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 7, 3, 10, 30));
    const a = ev("a", "晨会", "09:00", "10:00");
    const base = {
      tokens: THEME_TOKENS,
      dates,
      anchorKey: "2026-08-03",
      today: new Date(2026, 7, 3),
      onJumpToMonth: vi.fn(),
      onAddDay: vi.fn(),
      onEdit: vi.fn(),
      onToggleDone: vi.fn(),
      onDelete: vi.fn(),
      onMoveAll: vi.fn(),
      onPostpone: vi.fn(),
      onEndEarly: vi.fn(),
      onStretch: vi.fn(),
      onStretchRepeat: vi.fn(),
      onCopy: vi.fn(),
    };
    const days = (done: boolean) => [[{ ...a, done }], ...emptyWeek.slice(1)];
    const { rerender } = render(<WeekTimeline {...base} eventsByDay={days(false)} />);
    const block = () => screen.getByRole("button", { name: /日程 晨会/ });
    expect(block().className).not.toContain("anim-done-pop");
    rerender(<WeekTimeline {...base} eventsByDay={days(true)} />);
    expect(block().className).toContain("anim-done-pop");
    act(() => {
      vi.advanceTimersByTime(500); // 动画中途：动画位仍在
    });
    expect(block().className).toContain("anim-done-pop");
    act(() => {
      vi.advanceTimersByTime(500); // 动画计时到点：动画位清除
    });
    expect(block().className).not.toContain("anim-done-pop");
    // 取消完成再完成：再次触发新一轮动画
    rerender(<WeekTimeline {...base} eventsByDay={days(false)} />);
    expect(block().className).not.toContain("anim-done-pop");
    rerender(<WeekTimeline {...base} eventsByDay={days(true)} />);
    expect(block().className).toContain("anim-done-pop");
    vi.useRealTimers();
  });

  it("拖动事件松手后不触发编辑/菜单（抑制随后的 click）", () => {
    const onEdit = vi.fn();
    const onMoveAll = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onEdit, onMoveAll });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 150, clientY: 140 });
    fireEvent.pointerUp(block, { pointerId: 1 });
    fireEvent.click(block, { detail: 1 }); // 模拟拖拽后浏览器仍派发 click
    expect(onMoveAll).toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
  });

  it("左键单击事件块（指针按下→松开）只选中不弹菜单，右键才弹", () => {
    const onEdit = vi.fn();
    const onSelectionChange = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onEdit, onSelectionChange });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    // 真实浏览器路径：指针捕获把 click 派发到列，块 onClick 收不到 → 选中在 pointerup 处理
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerUp(block, { pointerId: 1, clientX: 50, clientY: 100 });
    expect(onEdit).not.toHaveBeenCalled();
    expect(onSelectionChange).toHaveBeenLastCalledWith(["a"]);
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
    // pointerup 后浏览器向列派发 click：左键不弹菜单（也没有菜单可误关）
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.click(col);
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
    // 右键（pointerup button=2 + contextmenu）→ 弹菜单
    fireEvent.pointerDown(block, { pointerId: 2, button: 2, clientX: 50, clientY: 100 });
    fireEvent.pointerUp(block, { pointerId: 2, button: 2, clientX: 50, clientY: 100 });
    fireEvent.contextMenu(block, { clientX: 50, clientY: 100 });
    expect(screen.getByRole("menu", { name: "日程操作" })).toBeInTheDocument();
    // 之后再点外部空白 → 菜单正常关闭
    fireEvent.click(document.body);
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
  });

  it("键盘 Enter（detail=0）在事件块上等同右键呼出菜单，无鼠标坐标时居中显示在块上", () => {
    const onEdit = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onEdit });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.click(block); // detail 0 = 键盘激活（jsdom 默认）
    expect(screen.getByRole("menu", { name: "日程操作" })).toBeInTheDocument();
    expect(within(screen.getByRole("menu", { name: "日程操作" })).getByRole("menuitem", { name: "编辑" })).not.toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑" }));
    expect(onEdit).toHaveBeenCalledWith(a);
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

  it("左键单击事件块（指针序列，不派发 click）只选中；右键弹操作菜单（不直接编辑）", () => {
    const onEdit = vi.fn();
    const onSelectionChange = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onEdit, onSelectionChange });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    // 真实浏览器中 pointer capture 把 click 重派发到列而非事件块，onClick 收不到：
    // 左键单击 → 只选中；右键 contextmenu → 弹菜单
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 50, clientY: 100 }); // 9:00
    fireEvent.pointerUp(block, { pointerId: 1, clientX: 50, clientY: 100 });
    expect(onEdit).not.toHaveBeenCalled();
    expect(onSelectionChange).toHaveBeenCalledWith(["a"]);
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
    fireEvent.contextMenu(block, { clientX: 80, clientY: 90 });
    expect(screen.getByRole("menu", { name: "日程操作" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑" }));
    expect(onEdit).toHaveBeenCalledWith(a);
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

  it("重复日程实例（共享起点日）在今天重复日进行中也高亮", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 10, 30)); // 周一 10:30
    // byDay 真实形态：重复实例共享 e.date（原始开始日 8/1），实例所在列才是今天
    const r = { ...ev("r", "重复日程", "10:00", "11:00", 0), date: "2026-08-01" };
    renderTimeline([[r], ...emptyWeek.slice(1)]);
    const block = screen.getByRole("button", { name: /日程 重复日程/ });
    expect(block.style.boxShadow).toContain("rgb(59 130 246");
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
        onPostpone={vi.fn()}
        onEndEarly={vi.fn()}
        onStretch={vi.fn()}
        onStretchRepeat={vi.fn()}
        onCopy={vi.fn()}
      />
    );
    expect(screen.queryByTestId("now-line")).toBeNull();
    expect(screen.getByRole("button", { name: /日程 晨会/ }).style.boxShadow).toBe("");
    vi.useRealTimers();
  });

  it("右键已结束日程弹出菜单：编辑/标记为未完成；未点击时无菜单", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 10, 30)); // 10:00 结束，此刻 10:30
    const onPostpone = vi.fn();
    const onEdit = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onPostpone, onEdit });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    fireEvent.contextMenu(block, { clientX: 120, clientY: 80 });
    const menu = screen.getByRole("menu", { name: "日程操作" });
    expect(within(menu).getByRole("menuitem", { name: "编辑" })).not.toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "标记为未完成" })).not.toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "提前结束" })).toBeNull();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "标记为未完成" }));
    expect(onPostpone).toHaveBeenCalledWith(a);
    expect(onEdit).not.toHaveBeenCalled();
    // 菜单项点击后菜单关闭
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
    // 再右键块开菜单，点「编辑」打开编辑
    fireEvent.contextMenu(block, { clientX: 120, clientY: 80 });
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑" }));
    expect(onEdit).toHaveBeenCalledWith(a);
    // 未点击日程时不应有菜单
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
    vi.useRealTimers();
  });

  it("右键进行中日程：编辑/提前结束；已完成（提前结束）日程：编辑/标记为未完成", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 10, 30));
    const onEndEarly = vi.fn();
    const onEdit = vi.fn();
    const onPostpone = vi.fn();
    renderTimeline(
      [
        [
          ev("a", "进行中", "10:00", "11:00"),
          { ...ev("d", "已完成", "09:00", "10:00"), done: true },
        ],
        ...emptyWeek.slice(1),
      ],
      { onEndEarly, onEdit, onPostpone }
    );
    // 未点击：无任何菜单
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
    // 进行中：编辑/提前结束，无标记为未完成
    fireEvent.contextMenu(screen.getByRole("button", { name: /日程 进行中/ }), { clientX: 120, clientY: 80 });
    const menu = screen.getByRole("menu", { name: "日程操作" });
    expect(within(menu).getByRole("menuitem", { name: "提前结束" })).not.toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "标记为未完成" })).toBeNull();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "提前结束" }));
    expect(onEndEarly).toHaveBeenCalledWith("a");
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
    // 已完成（提前结束）：编辑/标记为未完成，点「标记为未完成」回调取消完成
    fireEvent.contextMenu(screen.getByRole("button", { name: /日程 已完成/ }), { clientX: 120, clientY: 80 });
    const doneMenu = screen.getByRole("menu", { name: "日程操作" });
    expect(within(doneMenu).getByRole("menuitem", { name: "标记为未完成" })).not.toBeNull();
    expect(within(doneMenu).queryByRole("menuitem", { name: "提前结束" })).toBeNull();
    fireEvent.click(within(doneMenu).getByRole("menuitem", { name: "标记为未完成" }));
    expect(onPostpone).toHaveBeenCalledWith({ ...ev("d", "已完成", "09:00", "10:00"), done: true });
    expect(onEdit).not.toHaveBeenCalled();
    // 菜单项点击后菜单关闭
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
    vi.useRealTimers();
  });

  it("右键菜单含「复制」，点复制回调被右击实例", () => {
    const onCopy = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onCopy });
    fireEvent.contextMenu(screen.getByRole("button", { name: /日程 晨会/ }), { clientX: 120, clientY: 80 });
    const menu = screen.getByRole("menu", { name: "日程操作" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "复制" }));
    expect(onCopy).toHaveBeenCalledWith(a);
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
  });

  it("横向拖宽：拖右把手跨 3 列，松手上报每天重复（起点/截止），预览副本覆盖各列", () => {
    const onStretch = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { onStretch });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    const handle = screen.getByTestId("hstretch-handle-end");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 60 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 250, clientY: 60 }); // 拖到第 3 列（8/5）
    // 范围内每列各一个半透明预览副本（含原列）
    expect(screen.getAllByTestId("hstretch-preview").length).toBe(3);
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(screen.queryByTestId("hstretch-preview")).toBeNull();
    expect(onStretch).toHaveBeenCalledWith("a", "2026-08-03", "2026-08-05");
  });

  it("横向拖宽未跨列（松手仍在原列）不修改日程", () => {
    const onStretch = vi.fn();
    renderTimeline([[ev("a", "晨会", "09:00", "10:00")], ...emptyWeek.slice(1)], { onStretch });
    const handle = screen.getByTestId("hstretch-handle-end");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 60 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 90, clientY: 60 }); // 仍在列 0
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onStretch).not.toHaveBeenCalled();
  });

  it("重复日程把手：首实例只有左把手、末实例只有右把手、中间实例无把手", () => {
    const r = { ...ev("r", "重复日程", "09:00", "10:00"), repeat: { freq: "daily" as const } };
    renderTimeline([
      [r],
      [r],
      [r],
      [r],
      [r],
      [r],
      [r],
    ]);
    // 每个块各自携带把手：7 个左把手只出现在首列实例、7 个右把手只出现在末列实例
    const blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    expect(blocks.length).toBe(7);
    // 首实例（列 0）有左把手：把手在块内
    const firstHandles = blocks[0].querySelectorAll('[data-testid="hstretch-handle-start"]');
    expect(firstHandles.length).toBe(1);
    expect(blocks[0].querySelectorAll('[data-testid="hstretch-handle-end"]').length).toBe(0);
    // 中间实例（列 1..5）无把手
    for (let i = 1; i < 6; i++) {
      expect(blocks[i].querySelectorAll('[data-testid^="hstretch-handle"]').length).toBe(0);
    }
    // 末实例（列 6）只有右把手
    expect(blocks[6].querySelectorAll('[data-testid="hstretch-handle-start"]').length).toBe(0);
    expect(blocks[6].querySelectorAll('[data-testid="hstretch-handle-end"]').length).toBe(1);
  });

  it("重复日程拖末实例右把手：上报截止日期（频率不变），预览覆盖新跨度", () => {
    const onStretchRepeat = vi.fn();
    const r = {
      ...ev("r", "重复日程", "09:00", "10:00"),
      repeat: { freq: "daily" as const, until: "2026-08-06" },
    };
    renderTimeline([[r], [r], [r], [r], ...emptyWeek.slice(4)], { onStretchRepeat });
    const blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    const handle = blocks[3].querySelector('[data-testid="hstretch-handle-end"]')!; // 末实例（until=8/6）
    const col = document.querySelector('[data-date="2026-08-03"]')!; // 把手激活后 unmount，move/up 派发到列
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 60 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 500, clientY: 60 }); // 拖到列 5（8/8）
    // 预览：起点（8/3 列 0）到新截止（列 5）每列一个副本
    expect(screen.getAllByTestId("hstretch-preview").length).toBe(6);
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onStretchRepeat).toHaveBeenCalledWith("r", "end", "2026-08-08");
  });

  it("重复日程拖首实例左把手：上报重复开始日期（频率不变），未跨列不上报", () => {
    const onStretchRepeat = vi.fn();
    const r = {
      ...ev("r", "重复日程", "09:00", "10:00"),
      repeat: { freq: "daily" as const, until: "2026-08-09" },
    };
    renderTimeline([[r], [r], [r], [r], ...emptyWeek.slice(4)], { onStretchRepeat });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    let blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    let handle = blocks[0].querySelector('[data-testid="hstretch-handle-start"]')!;
    // 未跨列（松手仍在原列）不上报
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 60 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 90, clientY: 60 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onStretchRepeat).not.toHaveBeenCalled();
    // 拖左到列 1（8/4）：重复开始改为 8/4（把手元素随状态重新挂载，需重新查询）
    blocks = screen.getAllByRole("button", { name: /日程 重复日程/ });
    handle = blocks[0].querySelector('[data-testid="hstretch-handle-start"]')!;
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 60 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 190, clientY: 60 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onStretchRepeat).toHaveBeenCalledWith("r", "start", "2026-08-04");
  });

  it("未来日程与非今天列的日程右键同样弹菜单；点外部空白处关闭菜单", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 10, 30));
    const otherDay = Array.from({ length: 7 }, (_, i) =>
      i === 1 ? [ev("y", "昨日", "09:00", "10:00", 1)] : []
    );
    const onEdit = vi.fn();
    renderTimeline(
      [[ev("f", "未来", "14:00", "15:00")], ...otherDay.slice(1)],
      { onEdit }
    );
    // 未来日程：未到结束时间 → 编辑/提前结束
    fireEvent.contextMenu(screen.getByRole("button", { name: /日程 未来/ }), { clientX: 120, clientY: 80 });
    expect(within(screen.getByRole("menu", { name: "日程操作" })).getByRole("menuitem", { name: "提前结束" })).not.toBeNull();
    fireEvent.click(document.body); // 点外部空白关闭
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
    // 非今天列的日程也弹菜单
    fireEvent.contextMenu(screen.getByRole("button", { name: /日程 昨日/ }), { clientX: 120, clientY: 80 });
    expect(screen.getByRole("menu", { name: "日程操作" })).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "日程操作" })).toBeNull();
    vi.useRealTimers();
  });

  it("拖边缘调整时块内时间标签实时跟随、气泡显示调整后区间，松手提交", () => {
    const onMoveAll = vi.fn();
    renderTimeline([[ev("a", "晨会", "09:00", "10:00")], ...emptyWeek.slice(1)], { onMoveAll });
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }), { detail: 1 });
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
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }), { detail: 1 });
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
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }), { detail: 1 });
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
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }), { detail: 1 });
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
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }), { detail: 1 });
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    const handle = screen.getByTestId("resize-handle-end");
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 50, clientY: 130 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 102 }); // 09:02 → 钳制 09:05
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(onMoveAll).toHaveBeenCalledWith([
      { id: "a", date: "2026-08-03", time: "09:00", endTime: "09:05" },
    ]);
  });

  it("缩放倍率作用于块高度；Ctrl+滚轮触发缩放回调，普通滚轮不触发", () => {
    const onZoomChange = vi.fn();
    const a = ev("a", "晨会", "09:00", "10:00");
    renderTimeline([[a], ...emptyWeek.slice(1)], { zoom: 2, onZoomChange });
    const block = screen.getByRole("button", { name: /日程 晨会/ });
    expect(block.style.height).toBe("60px"); // zoom=2：60 分钟 = 60px
    const scroller = document.querySelector('[data-testid="timeline-scroll"]')!;
    fireEvent.wheel(scroller, { deltaY: -100 });
    expect(onZoomChange).not.toHaveBeenCalled();
    fireEvent.wheel(scroller, { ctrlKey: true, deltaY: -100 });
    expect(onZoomChange).toHaveBeenLastCalledWith(2.25);
    fireEvent.wheel(scroller, { ctrlKey: true, deltaY: 100 });
    expect(onZoomChange).toHaveBeenLastCalledWith(1.75);
  });

  it("单选日程不出现批量颜色工具条（只编辑面板），多选才出现", () => {
    renderTimeline(
      [[ev("a", "晨会", "09:30", "11:00"), ev("b", "评审", "10:00", "11:00")], ...emptyWeek.slice(1)]
    );
    fireEvent.click(screen.getByRole("button", { name: /日程 晨会/ }), { detail: 1 });
    expect(screen.queryByTestId("batch-color-bar")).toBeNull();
    // 框选覆盖两个日程 → 工具条出现
    expandFold();
    const col = document.querySelector('[data-date="2026-08-03"]')!;
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 150 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 400 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(screen.getByText("已选 2")).toBeInTheDocument();
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
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 10, 0)); // 周一 10:00：事件进行中，避免过期标红干扰
    const colored = { ...ev("a", "晨会", "09:30", "11:00"), color: "#ef4444" };
    renderTimeline([[colored, ev("b", "评审", "09:00", "11:00")], ...emptyWeek.slice(1)]); // 10:00 仍在进行中
    const coloredBlock = screen.getByRole("button", { name: /日程 晨会/ });
    expect(coloredBlock.style.backgroundColor).toBe("rgba(239, 68, 68, 0.35)"); // 色值 + 35% 透明度
    expect(coloredBlock.style.borderLeft).toBe("3px solid rgb(239, 68, 68)");
    expect(coloredBlock.className).toContain("glass-hover"); // 毛玻璃
    const plainBlock = screen.getByRole("button", { name: /日程 评审/ });
    expect(plainBlock.style.backgroundColor).toBe("");
  });

  it("自定义颜色的全天条目毛玻璃半透明底＋色条", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 7, 3, 10, 0)); // 周一 10:00：当天全天事件未过期，不标暗红
    const colored = { ...ev("c", "全天事项", ""), color: "#22c55e" };
    renderTimeline([[colored], ...emptyWeek.slice(1)]);
    const item = screen.getByRole("button", { name: /编辑 全天事项/ });
    expect(item.style.backgroundColor).toBe("rgba(34, 197, 94, 0.35)");
    expect(item.style.borderLeft).toBe("3px solid rgb(34, 197, 94)");
    expect(item.className).toContain("glass-hover");
    expect(item.className).not.toContain("text-white!");
  });
});
