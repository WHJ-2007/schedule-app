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
  addDays,
  getWeekDates,
  formatWeekTitle,
  getYearMonths,
  addYears,
  getMonthDayCells,
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

describe("week/year helpers", () => {
  it("addDays 跨月", () => {
    const d = addDays(2026, 7, 31, 1); // 8月31日 + 1 天 = 9月1日
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(1);
  });

  it("addDays 跨年", () => {
    const d = addDays(2026, 11, 31, 1);
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("getWeekDates 周一开头且 7 天", () => {
    const week = getWeekDates(new Date(2026, 7, 15)); // 2026-08-15 周六
    expect(week.length).toBe(7);
    expect(week[0].getDay()).toBe(1);
    expect(week[0].getDate()).toBe(10);
    expect(week[6].getDate()).toBe(16);
  });

  it("getWeekDates 跨月周", () => {
    const week = getWeekDates(new Date(2026, 7, 1)); // 2026-08-01 周六
    expect(week[0].getMonth()).toBe(6); // 7月27日
    expect(week[0].getDate()).toBe(27);
  });

  it("formatWeekTitle 同月", () => {
    expect(formatWeekTitle(getWeekDates(new Date(2026, 7, 15)))).toBe("8月10日 – 8月16日");
  });

  it("formatWeekTitle 跨月", () => {
    expect(formatWeekTitle(getWeekDates(new Date(2026, 7, 1)))).toBe("7月27日 – 8月2日");
  });

  it("getYearMonths 恰 12 个月首日", () => {
    const months = getYearMonths(2026);
    expect(months.length).toBe(12);
    expect(months[0]).toEqual(new Date(2026, 0, 1));
    expect(months[11]).toEqual(new Date(2026, 11, 1));
  });

  it("addYears", () => {
    expect(addYears(2026, 1)).toBe(2027);
    expect(addYears(2026, -1)).toBe(2025);
  });

  it("getMonthDayCells 前置偏移且无尾随", () => {
    const cells = getMonthDayCells(2026, 7); // 8月：周六开头 → 5 个 null
    expect(cells.length).toBe(5 + 31);
    expect(cells[0]).toBeNull();
    const days = cells.filter((c) => c !== null) as Date[];
    expect(days.length).toBe(31);
    expect(days.every((d) => d.getMonth() === 7)).toBe(true);
  });

  it("getMonthDayCells 非周一开头的月份有偏移", () => {
    const cells = getMonthDayCells(2026, 0); // 2026-01-01 是周四 → 3 个 null
    expect(cells.length).toBe(3 + 31);
  });
});
