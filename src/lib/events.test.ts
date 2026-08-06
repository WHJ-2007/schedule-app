import { beforeEach, describe, it, expect } from "vitest";
import {
  ScheduleEvent,
  addEventToList,
  updateEventInList,
  deleteEventFromList,
  toggleEventDone,
  saveEvents,
  loadEvents,
  expandEventDates,
  sanitizeImportedEvents,
  isInstanceExpired,
  isInstanceDone,
  markInstanceDone,
  unmarkInstanceDone,
  STORAGE_KEY,
} from "./events";

const baseEvent = (partial: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id: "x",
  title: "",
  date: "2026-08-05",
  time: "09:00",
  endTime: "10:00",
  description: "",
  done: false,
  ...partial,
});

beforeEach(() => {
  localStorage.clear();
});

describe("list operations", () => {
  const base: ScheduleEvent = {
    id: "a",
    title: "晨会",
    date: "2026-08-03",
    time: "09:30",
    description: "",
    done: false,
  };

  it("adds an event at the end", () => {
    const list = addEventToList([], { title: "新日程", date: "2026-08-05" });
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("新日程");
    expect(list[0].time).toBe("");
    expect(list[0].description).toBe("");
    expect(list[0].done).toBe(false);
    expect(list[0].id.length).toBeGreaterThan(0);
  });

  it("updates only the matching event", () => {
    const list = updateEventInList([base, { ...base, id: "b", title: "其他" }], "a", {
      title: "改名",
    });
    expect(list.find((e) => e.id === "a")?.title).toBe("改名");
    expect(list.find((e) => e.id === "b")?.title).toBe("其他");
  });

  it("deletes only the matching event", () => {
    const list = deleteEventFromList([base, { ...base, id: "b" }], "a");
    expect(list.map((e) => e.id)).toEqual(["b"]);
  });

  it("toggles done flag", () => {
    expect(toggleEventDone([base], "a")[0].done).toBe(true);
    expect(toggleEventDone([{ ...base, done: true }], "a")[0].done).toBe(false);
  });
});

describe("expandEventDates", () => {
  const base = (repeat?: ScheduleEvent["repeat"]): ScheduleEvent => ({
    id: "a",
    title: "晨会",
    date: "2026-08-03",
    time: "09:30",
    description: "",
    done: false,
    repeat,
  });

  it("无 repeat 只返回自身日期", () => {
    expect(expandEventDates(base())).toEqual(["2026-08-03"]);
  });

  it("daily 展开到截止日期（含）", () => {
    expect(expandEventDates(base({ freq: "daily", until: "2026-08-06" }))).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
    ]);
  });

  it("weekly 每 7 天一次", () => {
    expect(expandEventDates(base({ freq: "weekly", until: "2026-08-24" }))).toEqual([
      "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24",
    ]);
  });

  it("monthly 每月同日，跨年正常", () => {
    const e = { ...base({ freq: "monthly", until: "2026-12-03" }), date: "2026-08-03" };
    expect(expandEventDates(e)).toEqual([
      "2026-08-03", "2026-09-03", "2026-10-03", "2026-11-03", "2026-12-03",
    ]);
  });

  it("monthly 目标月无该日（31 日）取月末", () => {
    const e = { ...base({ freq: "monthly", until: "2026-04-30" }), date: "2026-01-31" };
    expect(expandEventDates(e)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("截止早于起点：仅起点", () => {
    expect(expandEventDates(base({ freq: "daily", until: "2026-08-02" }))).toEqual(["2026-08-03"]);
  });

  it("weekday 工作日重复只展开周一至周五（2026-08-03 是周一）", () => {
    expect(expandEventDates(base({ freq: "weekday", until: "2026-08-09" }))).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07",
    ]);
  });

  it("weekend 周末重复只展开周六、周日", () => {
    expect(expandEventDates(base({ freq: "weekend", until: "2026-08-09" }))).toEqual([
      "2026-08-08", "2026-08-09",
    ]);
  });

  it("无限重复（无 until）展开到 horizon 兜底", () => {
    expect(expandEventDates(base({ freq: "daily" }), "2026-08-05")).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05",
    ]);
  });

  it("无 until 且无 horizon 时仅自身日期", () => {
    expect(expandEventDates(base({ freq: "weekly" }))).toEqual(["2026-08-03"]);
  });

  it("daily + interval 每 N 天一次", () => {
    expect(expandEventDates(base({ freq: "daily", until: "2026-08-11", interval: 2 }))).toEqual([
      "2026-08-03", "2026-08-05", "2026-08-07", "2026-08-09", "2026-08-11",
    ]);
  });

  it("daily + interval 3 跨月", () => {
    const e = { ...base({ freq: "daily", until: "2026-09-05", interval: 3 }), date: "2026-08-30" };
    expect(expandEventDates(e)).toEqual(["2026-08-30", "2026-09-02", "2026-09-05"]);
  });

  it("daily + interval 非法值（0/负数/小数）按 1 处理", () => {
    expect(expandEventDates(base({ freq: "daily", until: "2026-08-05", interval: 0 }))).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05",
    ]);
    expect(expandEventDates(base({ freq: "daily", until: "2026-08-06", interval: 1.9 }))).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
    ]);
  });

  it("weekday/weekend 忽略 interval 仍逐日过滤", () => {
    expect(expandEventDates(base({ freq: "weekday", until: "2026-08-07", interval: 2 }))).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07",
    ]);
  });
});

describe("sanitizeImportedEvents", () => {
  it("清洗透传合法 color，丢弃非字符串 color", () => {
    expect(
      sanitizeImportedEvents([
        { id: "a", title: "带色", date: "2026-08-03", time: "09:00", color: "#ef4444" },
        { id: "b", title: "无色", date: "2026-08-03", time: "09:00" },
        { id: "c", title: "坏色", date: "2026-08-03", time: "09:00", color: 42 },
      ])
    ).toEqual([
      {
        id: "a", title: "带色", date: "2026-08-03", time: "09:00",
        endTime: undefined, description: "", done: false, repeat: undefined, color: "#ef4444",
      },
      {
        id: "b", title: "无色", date: "2026-08-03", time: "09:00",
        endTime: undefined, description: "", done: false, repeat: undefined,
      },
      {
        id: "c", title: "坏色", date: "2026-08-03", time: "09:00",
        endTime: undefined, description: "", done: false, repeat: undefined,
      },
    ]);
  });

  it("addEventToList 透传 color", () => {
    const list = addEventToList([], { title: "带色", date: "2026-08-05", color: "#22c55e" });
    expect(list[0].color).toBe("#22c55e");
    const plain = addEventToList([], { title: "无色", date: "2026-08-05" });
    expect(plain[0].color).toBeUndefined();
  });

  it("非数组返回空列表", () => {
    expect(sanitizeImportedEvents("nope")).toEqual([]);
    expect(sanitizeImportedEvents({ id: "a" })).toEqual([]);
  });

  it("接受导出 JSON 的 {version, exportedAt, events} 包装格式", () => {
    expect(
      sanitizeImportedEvents({
        version: 1,
        exportedAt: "2026-08-04T12:00:00.000Z",
        events: [
          { id: "a", title: "晨会", date: "2026-08-03", time: "09:00" },
          { id: 123, title: "坏数据", date: "2026-08-03" },
        ],
      })
    ).toEqual([
      {
        id: "a",
        title: "晨会",
        date: "2026-08-03",
        time: "09:00",
        endTime: undefined,
        description: "",
        done: false,
        repeat: undefined,
      },
    ]);
  });

  it("清洗为干净结构：丢弃缺字段与非法重复频率", () => {
    expect(
      sanitizeImportedEvents([
        { id: "a", title: "晨会", date: "2026-08-03", time: "09:00", description: "", done: false },
        { id: 123, title: "坏数据", date: "2026-08-03" },
        {
          id: "b",
          title: "重复项",
          date: "2026-08-04",
          time: "10:00",
          endTime: "11:00",
          description: "d",
          done: true,
          repeat: { freq: "nonsense", until: "2026-09-01" },
          extra: "未知字段被丢弃",
        },
        {
          id: "c",
          title: "无限重复",
          date: "2026-08-05",
          time: "",
          repeat: { freq: "weekday", until: "" },
        },
      ])
    ).toEqual([
      {
        id: "a",
        title: "晨会",
        date: "2026-08-03",
        time: "09:00",
        endTime: undefined,
        description: "",
        done: false,
        repeat: undefined,
      },
      {
        id: "b",
        title: "重复项",
        date: "2026-08-04",
        time: "10:00",
        endTime: "11:00",
        description: "d",
        done: true,
        repeat: undefined,
      },
      {
        id: "c",
        title: "无限重复",
        date: "2026-08-05",
        time: "",
        endTime: undefined,
        description: "",
        done: false,
        repeat: { freq: "weekday", until: undefined },
      },
    ]);
  });
});

describe("persistence", () => {
  it("returns empty list when storage is empty（不自动生成示例日程）", () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    const events = loadEvents();
    expect(events).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull(); // 不写回任何数据
  });

  it("returns stored events without re-seeding", () => {
    const stored: ScheduleEvent[] = [
      { id: "x", title: "唯一日程", date: "2026-08-03", time: "", description: "", done: false },
    ];
    saveEvents(stored);
    expect(loadEvents().map((e) => e.id)).toEqual(["x"]);
  });

  it("keeps an explicitly empty list empty", () => {
    saveEvents([]);
    expect(loadEvents()).toEqual([]);
  });

  it("survives corrupt json", () => {
    localStorage.setItem(STORAGE_KEY, "{{{not json");
    expect(() => loadEvents()).not.toThrow();
  });

  it("drops wrong-shape items instead of crashing", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ bad: true }, { id: "x", title: 42, date: "2026-08-03", time: "", description: "", done: false }]));
    const events = loadEvents();
    expect(events).toEqual([]);
  });
});

describe("isInstanceExpired", () => {
  const now = new Date(2026, 7, 5, 15, 0); // 周三 15:00

  it("未来日期的日程即使结束时刻早于现在也不算过期（明天 14:00 结束 vs 今天 15:00）", () => {
    expect(isInstanceExpired(baseEvent({ time: "14:00", endTime: "15:00" }), "2026-08-06", now)).toBe(false);
  });

  it("今天的日程已过结束时刻算过期", () => {
    expect(isInstanceExpired(baseEvent({ time: "09:00", endTime: "14:00" }), "2026-08-05", now)).toBe(true);
  });

  it("今天的日程未到结束时刻不算过期", () => {
    expect(isInstanceExpired(baseEvent({ time: "14:00", endTime: "16:00" }), "2026-08-05", now)).toBe(false);
  });

  it("过去日期的日程（含全天）算过期", () => {
    expect(isInstanceExpired(baseEvent({ time: "09:00", endTime: "10:00" }), "2026-08-04", now)).toBe(true);
    expect(isInstanceExpired(baseEvent({ time: "" }), "2026-08-04", now)).toBe(true);
  });

  it("今天的全天日程当天 24:00 才结束，不算过期", () => {
    expect(isInstanceExpired(baseEvent({ time: "" }), "2026-08-05", now)).toBe(false);
  });

  it("已完成不算过期", () => {
    expect(isInstanceExpired(baseEvent({ time: "09:00", endTime: "14:00", done: true }), "2026-08-05", now)).toBe(false);
  });

  it("重复日程实例级完成（doneDates）也不算过期", () => {
    expect(
      isInstanceExpired(
        { ...baseEvent({ time: "09:00", endTime: "14:00" }), repeat: { freq: "daily" }, doneDates: ["2026-08-05"] },
        "2026-08-05",
        now
      )
    ).toBe(false);
  });
});

describe("实例级完成（doneDates）", () => {
  const repeat = (doneDates?: string[]): ScheduleEvent =>
    baseEvent({ repeat: { freq: "daily" as const }, doneDates });

  it("isInstanceDone：单次日程看 done，重复日程看该日是否在 doneDates，全局 done 视为全部完成", () => {
    expect(isInstanceDone(baseEvent({ done: true }), "2026-08-05")).toBe(true);
    expect(isInstanceDone(baseEvent(), "2026-08-05")).toBe(false);
    expect(isInstanceDone(repeat(["2026-08-05"]), "2026-08-05")).toBe(true);
    expect(isInstanceDone(repeat(["2026-08-04"]), "2026-08-05")).toBe(false);
    expect(isInstanceDone({ ...repeat(), done: true }, "2026-08-06")).toBe(true);
    // 非重复日程的 doneDates 无意义：done 优先
    expect(isInstanceDone({ ...baseEvent(), doneDates: ["2026-08-05"] }, "2026-08-05")).toBe(false);
  });

  it("markInstanceDone：单次日程置 done；重复日程只记该实例日", () => {
    expect(markInstanceDone(baseEvent(), "2026-08-05").done).toBe(true);
    const e = repeat();
    const m = markInstanceDone(e, "2026-08-05");
    expect(m.doneDates).toEqual(["2026-08-05"]);
    // 重复标记同日不重复记
    expect(markInstanceDone(m, "2026-08-05").doneDates).toEqual(["2026-08-05"]);
    // 不同实例日追加
    expect(markInstanceDone(m, "2026-08-06").doneDates).toEqual(["2026-08-05", "2026-08-06"]);
  });

  it("unmarkInstanceDone：单次日程取消 done；重复日程只移除该实例日", () => {
    expect(unmarkInstanceDone(baseEvent({ done: true }), "2026-08-05").done).toBe(false);
    expect(unmarkInstanceDone(repeat(["2026-08-05", "2026-08-06"]), "2026-08-05").doneDates).toEqual(["2026-08-06"]);
  });

  it("unmarkInstanceDone：重复日程全局完成（done）时吸收为实例级再减去该实例", () => {
    const e = repeat(["2026-08-05"]);
    const u = unmarkInstanceDone({ ...e, done: true }, "2026-08-06");
    expect(u.done).toBe(false);
    expect(u.doneDates).toContain("2026-08-05");
    expect(u.doneDates).not.toContain("2026-08-06");
  });

  it("sanitizeImportedEvents 透传合法 doneDates，丢弃非法项", () => {
    const clean = sanitizeImportedEvents([
      {
        id: "r",
        title: "重复",
        date: "2026-08-05",
        time: "09:00",
        done: false,
        repeat: { freq: "daily" },
        doneDates: ["2026-08-05", "2026-08-06", 123, null],
      },
    ]);
    expect(clean[0].doneDates).toEqual(["2026-08-05", "2026-08-06"]);
    const none = sanitizeImportedEvents([
      { id: "r2", title: "重复2", date: "2026-08-05", doneDates: "bad" },
    ]);
    expect(none[0].doneDates).toBeUndefined();
  });
});
