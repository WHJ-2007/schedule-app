export type ScheduleEvent = {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm" 或 "" 表示全天
  description: string;
  done: boolean;
};

export type EventInput = {
  title: string;
  date: string;
  time?: string;
  description?: string;
};

export const STORAGE_KEY = "schedule-demo-events";

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const SAMPLE_POOL: Array<{ title: string; day: number; time: string; description: string }> = [
  { title: "晨会", day: 1, time: "09:30", description: "本周重点任务同步" },
  { title: "健身训练", day: 1, time: "19:00", description: "胸背日 · 1 小时" },
  { title: "产品评审", day: 3, time: "14:00", description: "新版本功能评审" },
  { title: "阅读《活着》", day: 4, time: "21:00", description: "" },
  { title: "学习 TypeScript", day: 6, time: "20:00", description: "泛型部分" },
  { title: "与朋友聚餐", day: 8, time: "18:30", description: "川菜馆" },
  { title: "写周报", day: 10, time: "17:00", description: "" },
  { title: "预约牙医", day: 12, time: "10:00", description: "复诊" },
  { title: "晨跑 5 公里", day: 14, time: "07:00", description: "" },
  { title: "线上课程", day: 16, time: "20:30", description: "React 高级模式" },
  { title: "家庭视频通话", day: 18, time: "20:00", description: "" },
  { title: "超市采购", day: 20, time: "15:00", description: "周末食材" },
  { title: "整理书桌", day: 22, time: "16:00", description: "" },
  { title: "冥想练习", day: 24, time: "21:30", description: "10 分钟" },
  { title: "月度复盘", day: 27, time: "15:30", description: "上月目标完成情况" },
  { title: "电影之夜", day: 29, time: "19:30", description: "" },
];

export function buildSampleEvents(now: Date): ScheduleEvent[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const events: ScheduleEvent[] = [];
  for (const item of SAMPLE_POOL) {
    if (item.day > daysInMonth) continue;
    events.push({
      id: createId(),
      title: item.title,
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(item.day).padStart(2, "0")}`,
      time: item.time,
      description: item.description,
      done: false,
    });
  }
  return events;
}

export function addEventToList(list: ScheduleEvent[], input: EventInput): ScheduleEvent[] {
  const event: ScheduleEvent = {
    id: createId(),
    title: input.title.trim(),
    date: input.date,
    time: input.time ?? "",
    description: input.description ?? "",
    done: false,
  };
  return [...list, event];
}

export function updateEventInList(
  list: ScheduleEvent[],
  id: string,
  patch: Partial<Omit<ScheduleEvent, "id">>
): ScheduleEvent[] {
  return list.map((e) => (e.id === id ? { ...e, ...patch } : e));
}

export function deleteEventFromList(list: ScheduleEvent[], id: string): ScheduleEvent[] {
  return list.filter((e) => e.id !== id);
}

export function toggleEventDone(list: ScheduleEvent[], id: string): ScheduleEvent[] {
  return list.map((e) => (e.id === id ? { ...e, done: !e.done } : e));
}

export function isValidEvent(e: unknown): e is ScheduleEvent {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.title === "string" && typeof o.date === "string";
}

export function saveEvents(list: ScheduleEvent[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function loadEvents(): ScheduleEvent[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    const seeded = buildSampleEvents(new Date());
    saveEvents(seeded);
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidEvent) : [];
  } catch {
    return [];
  }
}
