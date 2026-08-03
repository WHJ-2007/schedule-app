import { describe, it, expect } from "vitest";
import {
  toDateKey,
  parseDateKey,
  isSameDay,
  isSameMonth,
  addMonths,
  getMonthGrid,
  formatMonthTitle,
  formatDayLabel,
  WEEKDAY_NAMES,
} from "./date";

describe("toDateKey / parseDateKey", () => {
  it("formats date to YYYY-MM-DD with zero padding", () => {
    expect(toDateKey(new Date(2026, 7, 3))).toBe("2026-08-03");
    expect(toDateKey(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("parses key back to a local date at midnight", () => {
    const d = parseDateKey("2026-08-03");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(3);
  });

  it("round-trips", () => {
    const key = "2026-12-31";
    expect(toDateKey(parseDateKey(key))).toBe(key);
  });
});

describe("isSameDay / isSameMonth", () => {
  it("compares by calendar day", () => {
    expect(isSameDay(new Date(2026, 7, 3, 23, 59), new Date(2026, 7, 3, 0, 0))).toBe(true);
    expect(isSameDay(new Date(2026, 7, 3), new Date(2026, 7, 4))).toBe(false);
  });

  it("compares month", () => {
    expect(isSameMonth(new Date(2026, 7, 15), 2026, 7)).toBe(true);
    expect(isSameMonth(new Date(2026, 6, 31), 2026, 7)).toBe(false);
  });
});

describe("addMonths", () => {
  it("wraps across year boundaries", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, monthIndex: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, monthIndex: 11 });
    expect(addMonths(2026, 7, 2)).toEqual({ year: 2026, monthIndex: 9 });
  });
});

describe("getMonthGrid", () => {
  it("returns 42 cells starting on Monday", () => {
    const grid = getMonthGrid(2026, 7); // 2026-08-01 是周六
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1); // 周一
    expect(grid[41].getDay()).toBe(0); // 周日
  });

  it("covers previous/next month edges and all days of the month", () => {
    const grid = getMonthGrid(2026, 7);
    const daySet = new Set(grid.map((d) => d.getDate()));
    expect(grid.some((d) => d.getMonth() === 6)).toBe(true); // 含 7 月补格
    expect(grid.some((d) => d.getMonth() === 8)).toBe(true); // 含 9 月补格
    for (let day = 1; day <= 31; day++) {
      expect(daySet.has(day)).toBe(true); // 8 月 31 天全在
    }
  });
});

describe("formatting", () => {
  it("formats month title", () => {
    expect(formatMonthTitle(2026, 7)).toBe("2026年8月");
  });

  it("formats day label with weekday", () => {
    // 2026-08-03 是周一
    expect(formatDayLabel(new Date(2026, 7, 3))).toBe("8月3日 · 周一");
  });

  it("weekday names start from Monday", () => {
    expect(WEEKDAY_NAMES).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
  });
});
