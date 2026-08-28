import { parseDateKey, parseTimeToMinutes, toDateKey } from "./date";
import { isInstanceDone, type ScheduleEvent } from "./events";

export type ReminderMoment = "start" | "end";

export type ScheduleReminder = {
  key: string;
  eventId: string;
  instanceDate: string;
  title: string;
  time: string;
  moment: ReminderMoment;
  at: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function eventOccursOnDate(event: ScheduleEvent, dateKey: string): boolean {
  if (dateKey < event.date) return false;
  if (!event.repeat) return dateKey === event.date;
  if (event.repeat.until && dateKey > event.repeat.until) return false;

  const start = parseDateKey(event.date);
  const target = parseDateKey(dateKey);
  const difference = utcDayNumber(dateKey) - utcDayNumber(event.date);

  if (event.repeat.freq === "daily") {
    const interval = Math.max(1, Math.floor(event.repeat.interval ?? 1));
    return difference % interval === 0;
  }
  if (event.repeat.freq === "weekly") return difference % 7 === 0;
  if (event.repeat.freq === "weekday") {
    return target.getDay() !== 0 && target.getDay() !== 6;
  }
  if (event.repeat.freq === "weekend") {
    return target.getDay() === 0 || target.getDay() === 6;
  }

  const months =
    (target.getFullYear() - start.getFullYear()) * 12 +
    target.getMonth() -
    start.getMonth();
  if (months < 0) return false;
  const expectedDay = Math.min(
    start.getDate(),
    new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  );
  return target.getDate() === expectedDay;
}

function reminderAt(dateKey: string, minutes: number): number {
  const date = parseDateKey(dateKey);
  date.setMinutes(minutes);
  return date.getTime();
}

function candidateDateKeys(from: number, to: number): string[] {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  // 结束时间缺省为开始后一小时，23 点后的日程可能在次日结束。
  start.setDate(start.getDate() - 1);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  const out: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    out.push(toDateKey(cursor));
  }
  return out;
}

export function getDueReminders(
  events: ScheduleEvent[],
  fromExclusive: number,
  toInclusive: number
): ScheduleReminder[] {
  if (toInclusive <= fromExclusive) return [];
  const dates = candidateDateKeys(fromExclusive, toInclusive);
  const reminders: ScheduleReminder[] = [];

  for (const event of events) {
    if (!event.time) continue;
    const startMinutes = parseTimeToMinutes(event.time);
    const requestedEnd = event.endTime
      ? parseTimeToMinutes(event.endTime)
      : startMinutes + 60;
    const endMinutes = requestedEnd > startMinutes ? requestedEnd : startMinutes + 60;

    for (const instanceDate of dates) {
      if (!eventOccursOnDate(event, instanceDate) || isInstanceDone(event, instanceDate)) continue;
      const moments: Array<{ moment: ReminderMoment; time: string; at: number }> = [
        { moment: "start", time: event.time, at: reminderAt(instanceDate, startMinutes) },
        {
          moment: "end",
          time: event.endTime || `${String(Math.floor((endMinutes % 1440) / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
          at: reminderAt(instanceDate, endMinutes),
        },
      ];
      for (const item of moments) {
        if (item.at <= fromExclusive || item.at > toInclusive) continue;
        reminders.push({
          key: `${event.id}:${instanceDate}:${item.moment}:${item.at}`,
          eventId: event.id,
          instanceDate,
          title: event.title,
          time: item.time,
          moment: item.moment,
          at: item.at,
        });
      }
    }
  }

  return reminders.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}
