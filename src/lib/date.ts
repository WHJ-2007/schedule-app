export const WEEKDAY_NAMES = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_NAMES_FULL = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

export function isSameMonth(d: Date, year: number, monthIndex: number): boolean {
  return d.getFullYear() === year && d.getMonth() === monthIndex;
}

export function addMonths(
  year: number,
  monthIndex: number,
  delta: number
): { year: number; monthIndex: number } {
  const t = new Date(year, monthIndex + delta, 1);
  return { year: t.getFullYear(), monthIndex: t.getMonth() };
}

export function getMonthGrid(year: number, monthIndex: number): Date[] {
  const first = new Date(year, monthIndex, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return d;
  });
}

export function formatMonthTitle(year: number, monthIndex: number): string {
  return `${year}年${monthIndex + 1}月`;
}

export function formatDayLabel(date: Date): string {
  const idx = (date.getDay() + 6) % 7;
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAY_NAMES_FULL[idx]}`;
}

export function formatEventTime(time: string): string {
  return time || "全天";
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function addDays(year: number, monthIndex: number, day: number, delta: number): Date {
  return new Date(year, monthIndex, day + delta);
}

export function getWeekDates(anchor: Date): Date[] {
  const mondayOffset = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return d;
  });
}

export function formatWeekTitle(week: Date[]): string {
  // 以周一所在年月为准，周序号为该周在月份内的周次
  const monday = week[0];
  const weekOfMonth = Math.ceil(monday.getDate() / 7);
  return `${monday.getFullYear()}年${monday.getMonth() + 1}月 第${weekOfMonth}周`;
}

export function getYearMonths(year: number): Date[] {
  return Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
}

export function formatYearTitle(year: number): string {
  return `${year}年`;
}

export function addYears(year: number, delta: number): number {
  return new Date(year + delta, 0, 1).getFullYear();
}

export function getMonthDayCells(year: number, monthIndex: number): (Date | null)[] {
  const first = new Date(year, monthIndex, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: mondayOffset }, () => null);
  for (let i = 1; i <= days; i++) cells.push(new Date(year, monthIndex, i));
  return cells;
}
