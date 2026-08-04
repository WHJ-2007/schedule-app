export type RepeatFreq = "daily" | "weekly" | "monthly" | "weekday" | "weekend";

// 重复规则：until 为重复截止日期（含），缺省 = 无限重复（展开时由视图范围兜底）
export type RepeatRule = { freq: RepeatFreq; until?: string };

export type ScheduleEvent = {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm" 或 "" 表示全天
  endTime?: string; // "HH:mm"，缺省时按 1 小时显示
  description: string;
  done: boolean;
  repeat?: RepeatRule;
  color?: string; // 自定义颜色（十六进制），缺省跟随主题
};

export type EventInput = {
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  description?: string;
  repeat?: RepeatRule;
  color?: string;
};

export const STORAGE_KEY = "schedule-demo-events";

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const SAMPLE_POOL: Array<{ title: string; day: number; time: string; endTime?: string; description: string }> = [
  { title: "晨会", day: 1, time: "09:30", endTime: "10:30", description: "本周重点任务同步" },
  { title: "健身训练", day: 1, time: "19:00", endTime: "20:00", description: "胸背日 · 1 小时" },
  { title: "产品评审", day: 3, time: "14:00", endTime: "15:00", description: "新版本功能评审" },
  { title: "阅读《活着》", day: 4, time: "21:00", description: "" },
  { title: "学习 TypeScript", day: 6, time: "20:00", description: "泛型部分" },
  { title: "与朋友聚餐", day: 8, time: "18:30", endTime: "20:00", description: "川菜馆" },
  { title: "写周报", day: 10, time: "17:00", endTime: "17:30", description: "" },
  { title: "预约牙医", day: 12, time: "10:00", description: "复诊" },
  { title: "晨跑 5 公里", day: 14, time: "07:00", endTime: "07:45", description: "" },
  { title: "线上课程", day: 16, time: "20:30", endTime: "21:30", description: "React 高级模式" },
  { title: "家庭视频通话", day: 18, time: "20:00", description: "" },
  { title: "超市采购", day: 20, time: "15:00", description: "周末食材" },
  { title: "整理书桌", day: 22, time: "16:00", description: "" },
  { title: "冥想练习", day: 24, time: "21:30", description: "10 分钟" },
  { title: "月度复盘", day: 27, time: "15:30", endTime: "16:30", description: "上月目标完成情况" },
  { title: "电影之夜", day: 29, time: "19:30", endTime: "21:30", description: "" },
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
      endTime: item.endTime,
      description: item.description,
      done: false,
    });
  }
  return events;
}

// 重复事件展开为全部实例日期（含起点；until 缺省 = 无限，展开到 horizon 兜底；
// 两者都不存在时仅自身日期）。工作日 = 周一至周五，周末 = 周六、周日。
export function expandEventDates(e: ScheduleEvent, horizon?: string): string[] {
  if (!e.repeat) return [e.date];
  const repeat = e.repeat;
  // 工作日/周末重复只保留符合条件的日期（起点也参与过滤，保证输出全符合频率）
  const isAllowed = (d: Date) => {
    const dow = d.getDay();
    if (repeat.freq === "weekday") return dow !== 0 && dow !== 6;
    if (repeat.freq === "weekend") return dow === 0 || dow === 6;
    return true;
  };
  const [y0, m0, d0] = e.date.split("-").map(Number);
  const out = isAllowed(new Date(y0, m0 - 1, d0)) ? [e.date] : [];
  const until = repeat.until ?? horizon;
  if (!until || until < e.date) return out;
  const [y1, m1, d1] = until.split("-").map(Number);
  const limit = new Date(y1, m1 - 1, d1);
  let cur = new Date(y0, m0 - 1, d0);
  const step = () => {
    if (repeat.freq === "daily" || repeat.freq === "weekday" || repeat.freq === "weekend") {
      return new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
    if (repeat.freq === "weekly") return new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
    // 每月按起点同日；目标月没有该日（如 31 日在 2 月）则取月末，下月恢复起点日
    const daysInTarget = new Date(cur.getFullYear(), cur.getMonth() + 2, 0).getDate();
    return new Date(cur.getFullYear(), cur.getMonth() + 1, Math.min(d0, daysInTarget));
  };
  for (cur = step(); cur <= limit; cur = step()) {
    if (!isAllowed(cur)) continue;
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
  }
  return out;
}

export function addEventToList(list: ScheduleEvent[], input: EventInput): ScheduleEvent[] {
  const event: ScheduleEvent = {
    id: createId(),
    title: input.title.trim(),
    date: input.date,
    time: input.time ?? "",
    endTime: input.endTime || undefined,
    description: input.description ?? "",
    done: false,
    repeat: input.repeat,
    color: input.color || undefined,
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

// 导入校验：逐条清洗为结构合法的干净日程（未知字段丢弃，重复频率只认合法值）。
// 兼容两种格式：裸数组，或导出 JSON 的 { version, exportedAt, events } 包装对象
export function sanitizeImportedEvents(raw: unknown): ScheduleEvent[] {
  const payload: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === "object" &&
        raw !== null &&
        Array.isArray((raw as { events?: unknown }).events)
      ? (raw as { events: unknown[] }).events
      : [];
  const out: ScheduleEvent[] = [];
  for (const item of payload) {
    if (!isValidEvent(item)) continue;
    const o = item as Record<string, unknown>;
    const r = o.repeat as Record<string, unknown> | undefined;
    const freq = typeof r?.freq === "string" ? r.freq : "";
    const repeat: RepeatRule | undefined =
      r && (freq === "daily" || freq === "weekly" || freq === "monthly" || freq === "weekday" || freq === "weekend")
        ? { freq, until: typeof r.until === "string" && r.until ? r.until : undefined }
        : undefined;
    out.push({
      id: o.id as string,
      title: o.title as string,
      date: o.date as string,
      time: typeof o.time === "string" ? o.time : "",
      endTime: typeof o.endTime === "string" && o.endTime ? o.endTime : undefined,
      description: typeof o.description === "string" ? o.description : "",
      done: Boolean(o.done),
      repeat,
      color: typeof o.color === "string" && o.color ? o.color : undefined,
    });
  }
  return out;
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
