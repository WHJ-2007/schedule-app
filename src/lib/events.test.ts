import { beforeEach, describe, it, expect } from "vitest";
import {
  ScheduleEvent,
  buildSampleEvents,
  addEventToList,
  updateEventInList,
  deleteEventFromList,
  toggleEventDone,
  buildPostponedClone,
  saveEvents,
  loadEvents,
  expandEventDates,
  sanitizeImportedEvents,
  isInstanceExpired,
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

describe("buildSampleEvents", () => {
  it("creates events only on valid days of the month", () => {
    const events = buildSampleEvents(new Date(2026, 1, 1)); // 2 月只有 28 天
    for (const e of events) {
      expect(Number(e.date.slice(8, 10))).toBeLessThanOrEqual(28);
    }
  });

  it("creates events for the given month", () => {
    const events = buildSampleEvents(new Date(2026, 7, 15));
    expect(events.length).toBeGreaterThan(5);
    for (const e of events) {
      expect(e.date.startsWith("2026-08")).toBe(true);
    }
  });

  it("every event has unique id and required fields", () => {
    const events = buildSampleEvents(new Date());
    const ids = new Set(events.map((e) => e.id));
    expect(ids.size).toBe(events.length);
    for (const e of events) {
      expect(typeof e.title).toBe("string");
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.done).toBe(false);
    }
  });
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

  it("顺延副本：内容一模一样、时长一样、从现在开始、不带重复规则", () => {
    const clone = buildPostponedClone(
      { ...base, endTime: "10:30", description: "重点同步", color: "#f87171", repeat: { freq: "daily" } },
      new Date(2026, 7, 5, 14, 2)
    );
    expect(clone).toEqual({
      title: "晨会",
      date: "2026-08-05",
      time: "14:02",
      endTime: "15:02",
      description: "重点同步",
      color: "#f87171",
    });
  });

  it("顺延副本：无结束时间按 1 小时；超午夜钳制到 23:59", () => {
    expect(buildPostponedClone({ ...base }, new Date(2026, 7, 5, 9, 0))).toMatchObject({
      time: "09:00",
      endTime: "10:00",
    });
    expect(
      buildPostponedClone({ ...base, endTime: "23:59" }, new Date(2026, 7, 5, 23, 30)).endTime
    ).toBe("23:59");
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
  it("seeds sample events when storage is empty", () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    const events = loadEvents();
    expect(events.length).toBeGreaterThan(5);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull(); // 已写入种子
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
});
