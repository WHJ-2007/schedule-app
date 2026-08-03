import { beforeEach, describe, it, expect } from "vitest";
import {
  ScheduleEvent,
  buildSampleEvents,
  addEventToList,
  updateEventInList,
  deleteEventFromList,
  toggleEventDone,
  saveEvents,
  loadEvents,
  STORAGE_KEY,
} from "./events";

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
