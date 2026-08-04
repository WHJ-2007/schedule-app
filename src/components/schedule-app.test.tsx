import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import ScheduleApp from "./schedule-app";
import { THEME_TOKENS } from "./theme-tokens";
import {
  getMonthGrid,
  isSameMonth,
  formatDayLabel,
  getWeekDates,
  addDays,
  formatMonthTitle,
  formatYearTitle,
  addMonths,
  toDateKey,
  formatWeekTitle,
  isSameDay,
} from "@/lib/date";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ScheduleApp (month view)", () => {
  it("渲染月视图与标题", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    expect(screen.getByRole("heading", { name: /极简日程/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /今天/ })).toBeInTheDocument();
    // 月视图大按钮已删除，改用当日时间轴列头的 ＋
    expect(screen.queryByRole("button", { name: "＋ 添加日程" })).toBeNull();
  });

  it("月视图当日时间轴拖选位置与鼠标一致（不受月历格子干扰）", () => {
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        // 月历格子（BUTTON 带 data-date）top 200 模拟真实布局；时间轴列（DIV data-date）top 0
        const col = this.closest("[data-date]") as HTMLElement | null;
        if (col && this.tagName === "BUTTON") {
          const r = { left: 0, top: 200, width: 100, height: 40 };
          return { ...r, right: r.left + r.width, bottom: r.top + r.height } as DOMRect;
        }
        if (col) {
          const r = { left: 0, top: 0, width: 100, height: 500 };
          return { ...r, right: r.left + r.width, bottom: r.top + r.height } as DOMRect;
        }
        return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 } as DOMRect;
      }
    );
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: /展开凌晨时段/ }));
    const col = document.querySelector("div[data-date]")!; // 时间轴列是 DIV，月历格是 BUTTON
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 90 }); // 3:00
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/开始时间/)).toHaveValue("02:00");
    expect(screen.getByLabelText(/结束时间/)).toHaveValue("03:00");
    spy.mockRestore();
  });

  it("点日期格显示当日标题", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    const grid = getMonthGrid(now.getFullYear(), now.getMonth());
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

  it("添加日程到选中日（当日时间轴列头 ＋）", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(
      screen.getByRole("button", { name: `在${now.getMonth() + 1}月${now.getDate()}日添加日程` })
    );
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "测试日程" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(screen.getAllByText("测试日程").length).toBeGreaterThan(0);
  });

  it("撤销/重做按钮：添加后撤销消失、重做恢复", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(
      screen.getByRole("button", { name: `在${now.getMonth() + 1}月${now.getDate()}日添加日程` })
    );
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "撤销测试" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(screen.getAllByText("撤销测试").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(screen.queryByText("撤销测试")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重做" }));
    expect(screen.getAllByText("撤销测试").length).toBeGreaterThan(0);
  });

  it("版本播放条：拖动时间轴实时回看任意历史版本", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    const addBtn = `在${now.getMonth() + 1}月${now.getDate()}日添加日程`;
    for (const title of ["事件A", "事件B"]) {
      fireEvent.click(screen.getByRole("button", { name: addBtn }));
      fireEvent.change(screen.getByLabelText(/标题/), { target: { value: title } });
      fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    }
    expect(screen.getAllByText("事件A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("事件B").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "版本播放" }));
    const slider = screen.getByLabelText("版本时间轴") as HTMLInputElement;
    expect(slider).toHaveValue("2");
    expect(slider.max).toBe("2");
    expect(screen.getByText(/第 3 \/ 3 版/)).toBeInTheDocument();
    // 拖到初始版本：两条日程消失
    fireEvent.change(slider, { target: { value: "0" } });
    expect(screen.getByText(/第 1 \/ 3 版/)).toBeInTheDocument();
    expect(screen.queryByText("事件A")).toBeNull();
    expect(screen.queryByText("事件B")).toBeNull();
    // 关闭版本播放
    fireEvent.click(screen.getByRole("button", { name: "关闭版本播放" }));
    expect(screen.queryByLabelText("版本时间轴")).toBeNull();
  });

  it("版本播放条在版本按钮上方弹出，滑条与关闭按钮不重叠", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    const addBtn = `在${now.getMonth() + 1}月${now.getDate()}日添加日程`;
    fireEvent.click(screen.getByRole("button", { name: addBtn }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "布局测试" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "版本播放" }));
    const player = screen.getByRole("dialog", { name: "版本播放" });
    expect(player.className).toContain("bottom-full");
    expect(player.className).toContain("backdrop-blur");
    // 关闭按钮（右上 absolute）不压滑条：滑条包一层右侧内边距
    const sliderWrap = screen.getByLabelText("版本时间轴").closest("div")!;
    expect(sliderWrap.className).toContain("pr-8");
  });

  it("无操作时打开版本播放显示暂无历史操作", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "版本播放" }));
    expect(screen.getByText("暂无历史操作")).toBeInTheDocument();
    expect(screen.queryByLabelText("版本时间轴")).toBeNull();
  });
});

describe("ScheduleApp (switcher & week view)", () => {
  // jsdom 不计算布局：模拟周视图 7 列矩形（每列 100px 宽、top 0）
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
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
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("渲染 周/月/年 切换器", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    expect(screen.getByRole("button", { name: "周" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "月" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "年" })).toBeInTheDocument();
  });

  it("点周页签显示 7 天列并持久化", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const now = new Date();
    const week = getWeekDates(now);
    for (const d of week) {
      expect(
        screen.getByRole("button", { name: `选择${d.getMonth() + 1}月${d.getDate()}日` })
      ).toBeInTheDocument();
    }
    expect(localStorage.getItem("schedule-view")).toBe("week");
  });

  it("周视图翻周：上一周/下一周日期变化", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: /上一周/ }));
    const prevWeek = getWeekDates(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
    expect(
      screen.getByRole("button", { name: `选择${prevWeek[0].getMonth() + 1}月${prevWeek[0].getDate()}日` })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /下一周/ }));
    const nextWeek = getWeekDates(now);
    expect(
      screen.getByRole("button", { name: `选择${nextWeek[0].getMonth() + 1}月${nextWeek[0].getDate()}日` })
    ).toBeInTheDocument();
  });

  it("周视图列头单击选中该天（浅蓝竖条跟随）、双击切到月视图", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const now = new Date();
    const week = getWeekDates(now);
    const target = week[2];
    const targetKey = toDateKey(target);
    const btn = screen.getByRole("button", {
      name: `选择${target.getMonth() + 1}月${target.getDate()}日`,
    });
    // 单击：选中该天，仍在周视图（该列出现浅蓝竖条高亮）
    fireEvent.click(btn);
    const col = document.querySelector(`[data-date="${targetKey}"]`)!;
    expect(col.className).toContain("border-blue-200");
    expect(screen.getByRole("button", { name: "月" })).toHaveAttribute("aria-pressed", "false");
    // 双击：切到月视图并选中那天
    fireEvent.doubleClick(btn);
    expect(screen.getByRole("button", { name: "月" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(formatDayLabel(target))).toBeInTheDocument();
  });

  it("周视图点事件直接打开编辑弹窗", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(
      screen.getByRole("button", { name: `在${now.getMonth() + 1}月${now.getDate()}日添加日程` })
    );
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "周视图事件" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /编辑 周视图事件/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/标题/)).toHaveValue("周视图事件");
  });

  it("周视图全天条目编辑按钮直接打开编辑面板", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(
      screen.getByRole("button", { name: `在${now.getMonth() + 1}月${now.getDate()}日添加日程` })
    );
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "全天条目" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /编辑 全天条目/ }));
    expect(screen.getByRole("dialog", { name: "编辑日程" })).toBeInTheDocument();
    expect(screen.getByLabelText(/标题/)).toHaveValue("全天条目");
  });

  it("周视图列头＋按钮添加到该日", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const now = new Date();
    const week = getWeekDates(now);
    const target = week[3];
    fireEvent.click(
      screen.getByRole("button", { name: `在${target.getMonth() + 1}月${target.getDate()}日添加日程` })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "该日新增" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.doubleClick(screen.getByRole("button", { name: `选择${target.getMonth() + 1}月${target.getDate()}日` }));
    // 残影层克隆了旧周视图（aria-hidden 被 getByRole 忽略），用 role 查询当日日程条目
    expect(screen.getByRole("button", { name: /编辑 该日新增/ })).toBeInTheDocument();
  });

  it("周视图连续翻周跨月后切回月视图显示对应月份", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole("button", { name: /上一周/ }));
    }
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    const now = new Date();
    const target = addDays(now.getFullYear(), now.getMonth(), now.getDate(), -42);
    expect(
      screen.getByText(formatMonthTitle(target.getFullYear(), target.getMonth()))
    ).toBeInTheDocument();
  });

  it("周视图拖选时间段：弹窗预填起止时间，保存后时间轴出现事件块", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /展开凌晨时段/ }));
    const col = document.querySelector(`[data-date="${toDateKey(getWeekDates(new Date())[0])}"]`)!;
    // 60px → 2:00，90px → 3:00
    fireEvent.pointerDown(col, { pointerId: 1, clientX: 50, clientY: 60 });
    fireEvent.pointerMove(col, { pointerId: 1, clientX: 50, clientY: 90 });
    fireEvent.pointerUp(col, { pointerId: 1 });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/开始时间/)).toHaveValue("02:00");
    expect(screen.getByLabelText(/结束时间/)).toHaveValue("03:00");
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "拖选新建" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(screen.getByRole("button", { name: /日程 拖选新建/ })).toBeInTheDocument();
  });

  it("横向拖拽跨多天批量创建日程", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /展开凌晨时段/ }));
    const week = getWeekDates(new Date());
    const col0 = document.querySelector(`[data-date="${toDateKey(week[0])}"]`)!;
    fireEvent.pointerDown(col0, { pointerId: 1, clientX: 50, clientY: 60 }); // 2:00
    fireEvent.pointerMove(col0, { pointerId: 1, clientX: 250, clientY: 90 }); // 拖到第 3 列 → 3:00
    fireEvent.pointerUp(col0, { pointerId: 1 });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/将同时添加到 3 天：/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "晚间练习" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(screen.getAllByRole("button", { name: "日程 晚间练习" })).toHaveLength(3);
  });

  it("批量设色：框选多个 → 工具条点色点 → 全部变", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    const addBtn = `在${now.getMonth() + 1}月${now.getDate()}日添加日程`;
    for (const title of ["批量A", "批量B"]) {
      fireEvent.click(screen.getByRole("button", { name: addBtn }));
      fireEvent.change(screen.getByLabelText(/标题/), { target: { value: title } });
      fireEvent.change(screen.getByLabelText(/开始时间/), { target: { value: "09:00" } });
      fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    }
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /展开凌晨时段/ }));
    // 从真实事件块反查所在列（残影 ghost 里的月历格会干扰 document 级查询）
    const todayCol = screen
      .getByRole("button", { name: /日程 批量A/ })
      .closest("[data-date]")!;
    // 展开态 1px = 2 分钟：250px=07:28、380px=11:48（避开 210–236px 条带，覆盖 09:00–11:00 两块）
    fireEvent.pointerDown(todayCol, { pointerId: 1, clientX: 150, clientY: 250 });
    fireEvent.pointerMove(todayCol, { pointerId: 1, clientX: 150, clientY: 380 });
    fireEvent.pointerUp(todayCol, { pointerId: 1 });
    expect(screen.getByText("已选 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "批量颜色 #ef4444" }));
    const a = screen.getByRole("button", { name: /日程 批量A/ });
    const b = screen.getByRole("button", { name: /日程 批量B/ });
    expect(a.style.backgroundColor).toMatch(/239, 68, 68/);
    expect(b.style.backgroundColor).toMatch(/239, 68, 68/);
  });

  it("周视图时间轴事件块点击直接打开编辑面板并回填结束时间", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(
      screen.getByRole("button", { name: `在${now.getMonth() + 1}月${now.getDate()}日添加日程` })
    );
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "时间段事件" } });
    fireEvent.change(screen.getByLabelText(/开始时间/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/结束时间/), { target: { value: "11:30" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /日程 时间段事件/ }));
    expect(screen.getByRole("dialog", { name: "编辑日程" })).toBeInTheDocument();
    expect(screen.getByLabelText(/开始时间/)).toHaveValue("10:00");
    expect(screen.getByLabelText(/结束时间/)).toHaveValue("11:30");
  });

  it("选中事件块按 Delete 删除并弹出撤销条，点撤销恢复", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(
      screen.getByRole("button", { name: `在${now.getMonth() + 1}月${now.getDate()}日添加日程` })
    );
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "待删除事件" } });
    fireEvent.change(screen.getByLabelText(/开始时间/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/结束时间/), { target: { value: "11:00" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const block = screen.getByRole("button", { name: /日程 待删除事件/ });
    fireEvent.click(block);
    // 面板打开，此时按 Delete
    expect(screen.getByRole("dialog", { name: "编辑日程" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(screen.queryByRole("button", { name: /日程 待删除事件/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("已删除 1 条日程");
    // 删除后面板自动关闭
    expect(screen.queryByRole("dialog")).toBeNull();
    // 点撤销恢复
    fireEvent.click(screen.getByRole("button", { name: "撤销删除" }));
    expect(screen.getByRole("button", { name: /日程 待删除事件/ })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("输入框聚焦时按 Delete 不删除日程", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(
      screen.getByRole("button", { name: `在${now.getMonth() + 1}月${now.getDate()}日添加日程` })
    );
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "不可删事件" } });
    fireEvent.change(screen.getByLabelText(/开始时间/), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/结束时间/), { target: { value: "11:00" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getByRole("button", { name: /日程 不可删事件/ }));
    const title = screen.getByLabelText(/标题/);
    fireEvent.keyDown(title, { key: "Delete" });
    expect(screen.getByRole("button", { name: /日程 不可删事件/ })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ScheduleApp (year view)", () => {
  it("点年页签显示 12 个月卡片", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    const year = new Date().getFullYear();
    for (let m = 1; m <= 12; m++) {
      expect(screen.getByRole("button", { name: `查看${year}年${m}月` })).toBeInTheDocument();
    }
  });

  it("年视图上一年/下一年切换", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    const year = new Date().getFullYear();
    fireEvent.click(screen.getByRole("button", { name: /上一年/ }));
    expect(screen.getByRole("button", { name: `查看${year - 1}年1月` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /下一年/ }));
    expect(screen.getByRole("button", { name: `查看${year}年1月` })).toBeInTheDocument();
  });

  it("点月名切到月视图并定位该月", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    const year = new Date().getFullYear();
    fireEvent.click(screen.getByRole("button", { name: "上一年" }));
    fireEvent.click(screen.getByRole("button", { name: `查看${year - 1}年6月` }));
    expect(screen.getByText(formatMonthTitle(year - 1, 5))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "月" })).toHaveAttribute("aria-pressed", "true");
  });

  it("点迷你网格日期切到月视图并选中那天", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    const year = new Date().getFullYear();
    // 当前月迷你网格里的 15 日
    const d = new Date(year, new Date().getMonth(), 15);
    const label = `${d.getMonth() + 1}月${d.getDate()}日`;
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByText(formatDayLabel(d))).toBeInTheDocument();
  });
});

describe("ScheduleApp (selection bubble)", () => {
  let rectSpy: ReturnType<typeof vi.spyOn>;

  // jsdom 不计算布局：按 aria-label 中的日期号模拟坐标（第 N 日 → left=N*10, top=40, 28x28）
  beforeEach(() => {
    rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const label = this.closest("[aria-label]")?.getAttribute("aria-label") ?? "";
        const m = /^(\d+)月(\d+)日/.exec(label);
        if (!m) return { left: 0, top: 0, width: 0, height: 0 } as DOMRect;
        return { left: Number(m[2]) * 10, top: 40, width: 28, height: 28 } as DOMRect;
      }
    );
  });

  afterEach(() => {
    rectSpy.mockRestore();
  });

  it("切换日期时选中泡泡滑到新位置", async () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const bubble = screen.getByTestId("selection-bubble");
    const now = new Date();
    await waitFor(() =>
      expect(bubble.style.transform).toBe(`translate(${now.getDate() * 10}px, 40px)`)
    );
    const grid = getMonthGrid(now.getFullYear(), now.getMonth());
    const counts = new Map<number, number>();
    for (const d of grid) counts.set(d.getDate(), (counts.get(d.getDate()) ?? 0) + 1);
    const target = grid.find(
      (d) =>
        isSameMonth(d, now.getFullYear(), now.getMonth()) &&
        d.getDate() !== now.getDate() &&
        counts.get(d.getDate()) === 1
    )!;
    fireEvent.click(
      screen.getByRole("button", { name: `${target.getMonth() + 1}月${target.getDate()}日` })
    );
    await waitFor(() =>
      expect(bubble.style.transform).toBe(`translate(${target.getDate() * 10}px, 40px)`)
    );
  });

  it("选中日期不在当月网格时泡泡隐藏，回当月后恢复", async () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    await waitFor(() =>
      expect(screen.getByTestId("selection-bubble").style.visibility).toBe("visible")
    );
    // 连翻两个月，让选中的今天彻底离开网格（相邻月补格仍包含它，需翻两个月）
    fireEvent.click(screen.getByRole("button", { name: /上月/ }));
    fireEvent.click(screen.getByRole("button", { name: /上月/ }));
    await waitFor(() =>
      expect(screen.getByTestId("selection-bubble").style.visibility).toBe("hidden")
    );
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    await waitFor(() =>
      expect(screen.getByTestId("selection-bubble").style.transform).toBe(
        `translate(${now.getDate() * 10}px, 40px)`
      )
    );
  });
});

describe("ScheduleApp (view zoom transition)", () => {
  const wrap = () => screen.getByTestId("view-zoom-wrap");

  it("月→年缩小进入、年→月放大进入、月→周放大进入、周→月缩小进入", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    expect(wrap().className).toContain("view-zoom-out");
    fireEvent.animationEnd(wrap());
    expect(wrap().className).not.toContain("view-zoom");
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(wrap().className).toContain("view-zoom-in");
    fireEvent.animationEnd(wrap());
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    expect(wrap().className).toContain("view-zoom-in");
    fireEvent.animationEnd(wrap());
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(wrap().className).toContain("view-zoom-out");
  });

  it("jsdom 下锚点测不到时回退中心（transform-origin 0px 0px）", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.animationEnd(wrap());
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(wrap().style.transformOrigin).toBe("0px 0px");
  });

  it("月视图日期格带 data-date，年视图卡片带 data-ym", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    const todayBtn = screen.getByRole("button", { name: `${now.getMonth() + 1}月${now.getDate()}日` });
    expect(todayBtn).toHaveAttribute("data-date", toDateKey(now));
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    expect(document.querySelector(`[data-ym="${now.getFullYear()}-${now.getMonth()}"]`)).not.toBeNull();
  });

  it("月→周切换出现旧视图残影，内容为旧月视图，动画结束后移除", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const ghost = screen.getByTestId("view-ghost");
    expect(ghost).toBeInTheDocument();
    // 残影克隆了旧月视图：含月历日期格（jsdom rect 全 0 → 原位 0,0）
    expect(ghost.querySelector(`[data-date="${toDateKey(now)}"]`)).not.toBeNull();
    expect(ghost.style.left).toBe("0px");
    expect(ghost.style.top).toBe("0px");
    fireEvent.animationEnd(ghost);
    expect(screen.queryByTestId("view-ghost")).toBeNull();
  });

  it("周→月切换残影为旧周视图（7 列时间轴）", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const week = getWeekDates(new Date());
    fireEvent.doubleClick(
      screen.getByRole("button", { name: `选择${week[0].getMonth() + 1}月${week[0].getDate()}日` })
    );
    expect(screen.getByTestId("view-ghost").querySelectorAll("[data-date]")).toHaveLength(7);
  });

  it("仅视图切换产生残影：翻月/翻周等导航不产生", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    expect(screen.queryByTestId("view-ghost")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.animationEnd(screen.getByTestId("view-ghost"));
    fireEvent.click(screen.getByRole("button", { name: /下一周/ }));
    expect(screen.queryByTestId("view-ghost")).toBeNull();
  });

  it("残影缩小移动到锚点元素：月→周缩向日期格、月→年缩向月卡", () => {
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        // 锚点元素（日期格/月卡）有对应 data 属性 → 小矩形；其余（视图容器等）→ 大矩形
        if (this.getAttribute("data-date") || this.getAttribute("data-ym")) {
          return { left: 300, top: 200, width: 28, height: 28 } as DOMRect;
        }
        return { left: 0, top: 0, width: 800, height: 600 } as DOMRect;
      }
    );
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const ghost = screen.getByTestId("view-ghost");
    // 残影中心 (400,300) → 锚点中心 (314,214)：平移 -86/-86，缩放 28/800
    // 月→周/周→月均使用快速淡出变体（突出飞行的 7 个数字）
    expect(ghost.className).toContain("anim-ghost-morph-fast");
    expect(ghost.style.getPropertyValue("--g-tx")).toBe("-86px");
    expect(ghost.style.getPropertyValue("--g-ty")).toBe("-86px");
    expect(ghost.style.getPropertyValue("--g-s")).toBe("0.035");
    spy.mockRestore();
  });

  it("年→月残影缩向源视图月卡（年历里那张卡的坐标）", () => {
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        // 月卡 → (300,200,200,120)；其余（视图容器等）→ 大矩形
        if (this.getAttribute("data-ym")) {
          const r = { left: 300, top: 200, width: 200, height: 120 };
          return { ...r, right: r.left + r.width, bottom: r.top + r.height } as DOMRect;
        }
        const r = { left: 0, top: 0, width: 800, height: 600 };
        return { ...r, right: r.left + r.width, bottom: r.top + r.height } as DOMRect;
      }
    );
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    fireEvent.animationEnd(wrap());
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    const ghost = screen.getByTestId("view-ghost");
    // 残影中心 (400,300) → 月卡中心 (400,260)：仅纵移 -40，缩到 200/800
    expect(ghost.style.getPropertyValue("--g-tx")).toBe("0px");
    expect(ghost.style.getPropertyValue("--g-ty")).toBe("-40px");
    expect(ghost.style.getPropertyValue("--g-s")).toBe("0.25");
    // 新月视图从月卡位置展开（像素 origin）
    expect(wrap().style.transformOrigin).toBe("400px 260px");
    spy.mockRestore();
  });

  it("月→周残影缩向本周 7 格合并区域中心", () => {
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        if (this.getAttribute("data-date")) {
          // 本周 7 格分布在同一行：left 300–528，top 200（各 28 宽，间隔错开）
          return { left: 300, top: 200, width: 28, height: 28 } as DOMRect;
        }
        return { left: 0, top: 0, width: 800, height: 600 } as DOMRect;
      }
    );
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const ghost = screen.getByTestId("view-ghost");
    // 合并区域 (300,200,28,28) → 中心 (314,214)：与单日锚点结果一致（mock 下 7 格同点）
    expect(ghost.style.getPropertyValue("--g-tx")).toBe("-86px");
    expect(ghost.style.getPropertyValue("--g-ty")).toBe("-86px");
    expect(ghost.style.getPropertyValue("--g-s")).toBe("0.035");
    spy.mockRestore();
  });

  it("周→月残影缩向本周 7 列合并区域中心（与月→周对称）", () => {
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        if (this.getAttribute("data-date")) {
          // 本周 7 列同位置（mock 下并集退化为单矩形）
          return { left: 300, top: 200, width: 28, height: 28 } as DOMRect;
        }
        return { left: 0, top: 0, width: 800, height: 600 } as DOMRect;
      }
    );
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.animationEnd(wrap());
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    const ghost = screen.getByTestId("view-ghost");
    // 月→周/周→月均使用快速淡出变体（突出飞行的 7 个数字）
    expect(ghost.className).toContain("anim-ghost-morph-fast");
    // 残影中心 (400,300) → 本周 7 列合并区域中心 (314,214)：平移 -86/-86，缩放 28/800
    expect(ghost.style.getPropertyValue("--g-tx")).toBe("-86px");
    expect(ghost.style.getPropertyValue("--g-ty")).toBe("-86px");
    expect(ghost.style.getPropertyValue("--g-s")).toBe("0.035");
    // 新月视图从周区域展开（像素 origin），方向为缩小退出
    expect(wrap().style.transformOrigin).toBe("314px 214px");
    expect(wrap().className).toContain("view-zoom-out");
    fireEvent.animationEnd(ghost);
    expect(screen.queryByTestId("view-ghost")).toBeNull();
    spy.mockRestore();
  });

  it("视图切换动画期间选中高亮泡泡隐藏，动画结束后恢复", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    expect(screen.getByTestId("selection-bubble")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    expect(screen.queryByTestId("selection-bubble")).toBeNull(); // 动画期间不渲染
    fireEvent.animationEnd(wrap());
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(screen.queryByTestId("selection-bubble")).toBeNull();
    fireEvent.animationEnd(wrap());
    expect(screen.getByTestId("selection-bubble")).toBeInTheDocument();
  });

  it("月→周切换：7 个日期数字飞行轨道覆盖本周全部日期，动画结束移除", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const fly = screen.getByTestId("week-num-fly");
    // 月→周使用快速淡出残影变体（与周→月镜像）
    expect(screen.getByTestId("view-ghost").className).toContain("anim-ghost-morph-fast");
    const week = getWeekDates(new Date());
    expect(fly.querySelectorAll('[data-testid="week-num-fly-item"]')).toHaveLength(7);
    for (const d of week) {
      expect(fly.querySelector(`[data-day-num="${toDateKey(d)}"]`)).not.toBeNull();
    }
    // 动画结束后移除
    for (const el of Array.from(fly.querySelectorAll('[data-testid="week-num-fly-item"]'))) {
      fireEvent.animationEnd(el);
    }
    expect(screen.queryByTestId("week-num-fly")).toBeNull();
  });

  it("周→月切换数字飞行镜像：周列头 7 个数字飞回月历对应日期格", () => {
    localStorage.setItem("schedule-view", "week");
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const week = getWeekDates(new Date());
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    const fly = screen.getByTestId("week-num-fly");
    // 源 = 周列头 7 个数字；目标 = 月历对应日期格（42 格网格必含本周全部日期）
    expect(fly.querySelectorAll('[data-testid="week-num-fly-item"]')).toHaveLength(7);
    for (const d of week) {
      const item = fly.querySelector(`[data-day-num="${toDateKey(d)}"]`);
      if (item) expect(item.className).toContain("anim-num-fly");
    }
    // 周→月同样走快速淡出残影
    expect(screen.getByTestId("view-ghost").className).toContain("anim-ghost-morph-fast");
    for (const el of Array.from(fly.querySelectorAll('[data-testid="week-num-fly-item"]'))) {
      fireEvent.animationEnd(el);
    }
    expect(screen.queryByTestId("week-num-fly")).toBeNull();
  });
});

describe("ScheduleApp (page-turn animation)", () => {
  // 动画只作用于日期区域容器（data-testid="view-anim"），标题与导航按钮不参与
  const animArea = () => screen.getByTestId("view-anim");

  it("月视图：下月从右滑入、上月从左滑入（仅日期区域）", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    const next = addMonths(now.getFullYear(), now.getMonth(), 1);
    expect(screen.getByText(formatMonthTitle(next.year, next.monthIndex))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-right");
    fireEvent.click(screen.getByRole("button", { name: /上月/ }));
    expect(screen.getByText(formatMonthTitle(now.getFullYear(), now.getMonth()))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-left");
  });

  it("年视图：下一年从右滑入、上一年从左滑入（与月视图一致）", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    const year = new Date().getFullYear();
    fireEvent.click(screen.getByRole("button", { name: /下一年/ }));
    expect(screen.getByText(formatYearTitle(year + 1))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-right");
    fireEvent.click(screen.getByRole("button", { name: /上一年/ }));
    expect(screen.getByText(formatYearTitle(year))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-left");
  });

  it("周视图：下一周从右滑入、上一周从左滑入", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: /下一周/ }));
    const nextWeek = getWeekDates(
      addDays(now.getFullYear(), now.getMonth(), now.getDate(), 7)
    );
    expect(screen.getByText(formatWeekTitle(nextWeek))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-right");
    fireEvent.click(screen.getByRole("button", { name: /上一周/ }));
    expect(screen.getByText(formatWeekTitle(getWeekDates(now)))).toBeInTheDocument();
    expect(animArea().className).toContain("anim-slide-in-left");
  });

  it("翻月动画与功能一致", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: /下月/ }));
    const next = addMonths(now.getFullYear(), now.getMonth(), 1);
    expect(animArea().className).toContain("anim-slide-in-right");
    // 功能一致：翻月后日期可点选
    const grid = getMonthGrid(next.year, next.monthIndex);
    const counts = new Map<number, number>();
    for (const d of grid) counts.set(d.getDate(), (counts.get(d.getDate()) ?? 0) + 1);
    const target = grid.find(
      (d) =>
        isSameMonth(d, next.year, next.monthIndex) && counts.get(d.getDate()) === 1
    )!;
    fireEvent.click(
      screen.getByRole("button", { name: `${target.getMonth() + 1}月${target.getDate()}日` })
    );
    expect(screen.getByText(formatDayLabel(target))).toBeInTheDocument();
  });
});

describe("ScheduleApp (recurring & day timeline)", () => {
  it("创建每天重复日程：周视图多天出现，编辑弹窗回填重复字段", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(
      screen.getByRole("button", { name: `在${now.getMonth() + 1}月${now.getDate()}日添加日程` })
    );
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "每日冥想" } });
    fireEvent.click(screen.getByLabelText("重复")); // 重复开关：勾选后展开频率/重复开始/重复至
    const until = toDateKey(addDays(now.getFullYear(), now.getMonth(), now.getDate(), 5));
    fireEvent.change(screen.getByLabelText(/重复至/), { target: { value: until } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    // 展开后本周内至少出现 2 个实例（含今天）
    expect(screen.getAllByRole("button", { name: /编辑 每日冥想/ }).length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getAllByRole("button", { name: /编辑 每日冥想/ })[0]);
    // 面板打开后重复开关已勾选，频率默认每天、重复至回填
    expect(screen.getByLabelText("重复")).toBeChecked();
    expect(screen.getByLabelText("频率")).toHaveValue("daily");
    expect(screen.getByLabelText("重复至")).toHaveValue(until);
  });

  it("编辑弹窗删除按钮删除整组重复日程", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(
      screen.getByRole("button", { name: `在${now.getMonth() + 1}月${now.getDate()}日添加日程` })
    );
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "待删除" } });
    fireEvent.click(screen.getByLabelText("重复")); // 打开重复开关
    fireEvent.change(screen.getByLabelText("频率"), { target: { value: "weekly" } });
    const until = toDateKey(addDays(now.getFullYear(), now.getMonth(), now.getDate(), 14));
    fireEvent.change(screen.getByLabelText(/重复至/), { target: { value: until } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    fireEvent.click(screen.getAllByRole("button", { name: /编辑 待删除/ })[0]);
    // 面板内的删除按钮（时间轴全天条目也有 aria-label="删除" 的 ✕ 按钮，需限定在面板内）
    fireEvent.click(within(screen.getByRole("dialog", { name: "编辑日程" })).getByRole("button", { name: "删除" }));
    expect(screen.queryByRole("button", { name: /编辑 待删除/ })).toBeNull();
  });

  it("月视图小卡片显示当日日程标题（仅标题，超出 +N）", () => {
    localStorage.setItem("schedule-demo-events", JSON.stringify([
      { id: "a", title: "晨会", date: toDateKey(new Date()), time: "09:30", description: "", done: false },
      { id: "b", title: "评审", date: toDateKey(new Date()), time: "14:00", description: "", done: false },
      { id: "c", title: "健身", date: toDateKey(new Date()), time: "19:00", description: "", done: false },
      { id: "d", title: "读书", date: toDateKey(new Date()), time: "21:00", description: "", done: false },
    ]));
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const chips = screen.getAllByText("晨会");
    expect(chips.length).toBeGreaterThan(0); // 月历格子小卡片
    expect(screen.getByText("+1")).toBeInTheDocument(); // 超出 3 条上限
  });

  it("年视图翻年后点月标签：月视图定位到正在查看的月", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "年" }));
    fireEvent.click(screen.getByRole("button", { name: /上一年/ }));
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    const now = new Date();
    // 打开年视图里正在浏览的那一月（2025 年当前月），而不是跳到选中日期所在月
    expect(
      screen.getByText(formatMonthTitle(now.getFullYear() - 1, now.getMonth()))
    ).toBeInTheDocument();
  });

  it("无限重复（重复至留空）在周视图每天显示、月视图有小卡片", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const now = new Date();
    fireEvent.click(
      screen.getByRole("button", { name: `在${now.getMonth() + 1}月${now.getDate()}日添加日程` })
    );
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "无限重复" } });
    fireEvent.click(screen.getByLabelText("重复")); // 勾选重复：默认频率每天
    fireEvent.change(screen.getByLabelText(/开始时间/), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    // 本周从今天到周日每天一个实例
    const week = getWeekDates(now);
    const remaining = week.filter((d) => toDateKey(d) >= toDateKey(now)).length;
    expect(screen.getAllByRole("button", { name: /日程 无限重复/ })).toHaveLength(remaining);
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(screen.getAllByText("无限重复").length).toBeGreaterThan(0);
  });

  it("工作日/周末重复只在对应日子显示（本周各 5/2 个实例）", () => {
    const now = new Date();
    const week = getWeekDates(now);
    const monday = toDateKey(week[0]);
    const saturday = toDateKey(week[5]);
    localStorage.setItem(
      "schedule-demo-events",
      JSON.stringify([
        { id: "wd", title: "工作日事件", date: monday, time: "09:00", description: "", done: false, repeat: { freq: "weekday" } },
        { id: "we", title: "周末事件", date: saturday, time: "09:00", description: "", done: false, repeat: { freq: "weekend" } },
      ])
    );
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    expect(screen.getAllByRole("button", { name: /日程 工作日事件/ })).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: /日程 周末事件/ })).toHaveLength(2);
  });
});

describe("ScheduleApp (设置导出/导入)", () => {
  it("设置中一键导出：生成 JSON 下载", () => {
    const urlAny = URL as unknown as Record<string, unknown>;
    const origCreate = urlAny.createObjectURL;
    const origRevoke = urlAny.revokeObjectURL;
    urlAny.createObjectURL = vi.fn(() => "blob:mock");
    urlAny.revokeObjectURL = vi.fn();
    try {
      render(<ScheduleApp tokens={THEME_TOKENS} />);
      fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
      fireEvent.click(screen.getByRole("button", { name: "数据" }));
      expect(screen.getByRole("button", { name: /导出全部日程/ }).textContent).toContain("条日程");
      fireEvent.click(screen.getByRole("button", { name: /导出全部日程/ }));
      expect(urlAny.createObjectURL as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    } finally {
      urlAny.createObjectURL = origCreate;
      urlAny.revokeObjectURL = origRevoke;
    }
  });

  it("设置中一键导入：JSON 文件恢复日程并覆盖当前", async () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: "数据" }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(
      [
        JSON.stringify([
          { id: "imp-1", title: "导入日程", date: toDateKey(new Date()), time: "10:00", description: "", done: false },
        ]),
      ],
      "events.json",
      { type: "application/json" }
    );
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/已导入 1 条日程/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    expect(screen.getAllByText("导入日程").length).toBeGreaterThan(0);
  });

  it("导入非法 JSON 提示失败", async () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
    fireEvent.click(screen.getByRole("button", { name: "数据" }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["{{{not json"], "bad.json", { type: "application/json" })] },
    });
    await waitFor(() => expect(screen.getByText(/导入失败/)).toBeInTheDocument());
  });
});

describe("ScheduleApp (月视图双击跳周)", () => {
  // 找一个当前月网格里不在本周的日期：双击后周视图必须翻到包含该日的那一周
  const pickOutsideWeekDay = () => {
    const now = new Date();
    const grid = getMonthGrid(now.getFullYear(), now.getMonth());
    const currentWeek = getWeekDates(now);
    return grid.find((d) => !currentWeek.some((w) => isSameDay(w, d)))!;
  };

  it("双击日期跳到该日所在周：周视图列头为目标周的 7 天", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const target = pickOutsideWeekDay();
    fireEvent.doubleClick(
      screen.getByRole("button", { name: `${target.getMonth() + 1}月${target.getDate()}日` })
    );
    const targetWeek = getWeekDates(target);
    for (const d of targetWeek) {
      expect(
        screen.getByRole("button", { name: `在${d.getMonth() + 1}月${d.getDate()}日添加日程` })
      ).toBeInTheDocument();
    }
    // 验证不是简单挪用本周动画：原周里不在目标周的日期不应出现
    const currentWeek = getWeekDates(new Date());
    for (const d of currentWeek) {
      if (targetWeek.some((w) => isSameDay(w, d))) continue;
      expect(
        screen.queryByRole("button", { name: `在${d.getMonth() + 1}月${d.getDate()}日添加日程` })
      ).toBeNull();
    }
  });

  it("双击跳周播放月→周动画：数字飞行轨道出现并包含目标日期", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const target = pickOutsideWeekDay();
    fireEvent.doubleClick(
      screen.getByRole("button", { name: `${target.getMonth() + 1}月${target.getDate()}日` })
    );
    const fly = screen.getByTestId("week-num-fly");
    expect(fly.querySelectorAll('[data-testid="week-num-fly-item"]').length).toBeGreaterThan(0);
    const targetKey = toDateKey(target);
    expect(fly.querySelector(`[data-day-num="${targetKey}"]`)).toBeTruthy();
  });

  it("双击后从周视图切回月视图显示目标日期所在月", () => {
    render(<ScheduleApp tokens={THEME_TOKENS} />);
    const target = pickOutsideWeekDay();
    fireEvent.doubleClick(
      screen.getByRole("button", { name: `${target.getMonth() + 1}月${target.getDate()}日` })
    );
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(
      screen.getByRole("heading", {
        name: new RegExp(formatMonthTitle(target.getFullYear(), target.getMonth())),
      })
    ).toBeInTheDocument();
  });
});
