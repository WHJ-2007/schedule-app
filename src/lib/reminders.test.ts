import { describe, expect, it } from "vitest";
import type { ScheduleEvent } from "./events";
import { eventOccursOnDate, getDueReminders } from "./reminders";

const event = (patch: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id: "event-1",
  title: "晨会",
  date: "2026-08-05",
  time: "09:00",
  endTime: "10:00",
  description: "",
  done: false,
  ...patch,
});

const at = (date: string, time: string, seconds = 0): number => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, seconds).getTime();
};

describe("getDueReminders", () => {
  it("在日程开始与结束时各生成一次提醒", () => {
    const start = getDueReminders(
      [event()],
      at("2026-08-05", "08:59", 58),
      at("2026-08-05", "09:00", 2)
    );
    expect(start).toEqual([
      expect.objectContaining({ moment: "start", time: "09:00" }),
    ]);

    const end = getDueReminders(
      [event()],
      at("2026-08-05", "09:59", 58),
      at("2026-08-05", "10:00", 2)
    );
    expect(end).toEqual([
      expect.objectContaining({ moment: "end", time: "10:00" }),
    ]);
    expect(start[0]).not.toHaveProperty("ring");
  });

  it("无结束时间按一小时后提醒，并支持跨到次日", () => {
    const due = getDueReminders(
      [event({ time: "23:30", endTime: undefined })],
      at("2026-08-06", "00:29", 58),
      at("2026-08-06", "00:30", 2)
    );
    expect(due).toEqual([
      expect.objectContaining({ moment: "end", instanceDate: "2026-08-05", time: "00:30" }),
    ]);
  });

  it("全天日程、已完成日程与已完成重复实例不提醒", () => {
    const from = at("2026-08-05", "08:59", 58);
    const to = at("2026-08-05", "09:00", 2);
    expect(getDueReminders([event({ time: "" })], from, to)).toEqual([]);
    expect(getDueReminders([event({ done: true })], from, to)).toEqual([]);
    expect(
      getDueReminders(
        [event({ repeat: { freq: "daily" }, doneDates: ["2026-08-05"] })],
        from,
        to
      )
    ).toEqual([]);
  });

  it("重复日程只在符合规则的实例日期提醒", () => {
    const repeating = event({ date: "2026-08-03", repeat: { freq: "daily", interval: 2 } });
    expect(eventOccursOnDate(repeating, "2026-08-05")).toBe(true);
    expect(eventOccursOnDate(repeating, "2026-08-06")).toBe(false);
    expect(
      getDueReminders(
        [repeating],
        at("2026-08-05", "08:59", 58),
        at("2026-08-05", "09:00", 2)
      )
    ).toHaveLength(1);
  });

  it("每月 31 日在短月份按月末提醒", () => {
    const monthly = event({ date: "2026-01-31", repeat: { freq: "monthly" } });
    expect(eventOccursOnDate(monthly, "2026-02-28")).toBe(true);
    expect(eventOccursOnDate(monthly, "2026-02-27")).toBe(false);
  });
});
