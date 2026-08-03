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
