import { minutesToTime, parseTimeToMinutes, toDateKey } from "./date";

export type RepeatFreq = "daily" | "weekly" | "monthly" | "weekday" | "weekend";

// 重复规则：until 为重复截止日期（含），缺省 = 无限重复（展开时由视图范围兜底）；
// interval 仅对 daily 有效 = 每 N 天（缺省 1 = 每天）
export type RepeatRule = { freq: RepeatFreq; until?: string; interval?: number };

export type ScheduleEvent = {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm" 或 "" 表示全天
  endTime?: string; // "HH:mm"，缺省时按 1 小时显示
  endDate?: string; // 全天事件跨至日期（含，缺省 = 仅当天）
  description: string;
  done: boolean;
  doneDates?: string[]; // 重复日程已完成的具体实例日期（单次日程用 done）
  repeat?: RepeatRule;
  color?: string; // 自定义颜色（十六进制），缺省跟随主题
};

export type EventInput = {
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  endDate?: string;
  description?: string;
  repeat?: RepeatRule;
  color?: string;
};

export const STORAGE_KEY = "schedule-demo-events";

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 事件展开为全部实例日期（含起点；until 缺省 = 无限，展开到 horizon 兜底；
// 两者都不存在时仅自身日期）。工作日 = 周一至周五，周末 = 周六、周日。
// 全天跨天事件（endDate 存在，非重复）展开 date..endDate 每天。
export function expandEventDates(e: ScheduleEvent, horizon?: string): string[] {
  if (e.endDate && !e.repeat) {
    const [y0, m0, d0] = e.date.split("-").map(Number);
    const [y1, m1, d1] = e.endDate.split("-").map(Number);
    const end = new Date(y1, m1 - 1, d1);
    let lim = end;
    if (horizon) {
      const [hy, hm, hd] = horizon.split("-").map(Number);
      lim = end < new Date(hy, hm - 1, hd) ? end : new Date(hy, hm - 1, hd);
    }
    const out: string[] = [];
    const cur = new Date(y0, m0 - 1, d0);
    while (cur <= lim) {
      out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }
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
    if (repeat.freq === "daily") {
      const gap = Math.max(1, Math.floor(repeat.interval ?? 1)); // 每 N 天
      return new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + gap);
    }
    if (repeat.freq === "weekday" || repeat.freq === "weekend") {
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
    endDate: input.endDate || undefined,
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

// 实例是否已完成：重复日程按 doneDates 记实例日，单次日程看 done（全局完成 = 所有实例完成）
export function isInstanceDone(e: ScheduleEvent, dayKey: string): boolean {
  return e.done || (!!e.repeat && !!dayKey && !!e.doneDates?.includes(dayKey));
}

// 实例级标记完成：单次日程置 done；重复日程只记该实例日
export function markInstanceDone(e: ScheduleEvent, dayKey: string): ScheduleEvent {
  if (!e.repeat) return { ...e, done: true };
  const dd = e.doneDates ?? [];
  return { ...e, doneDates: dd.includes(dayKey) ? dd : [...dd, dayKey] };
}

// 实例级取消完成：重复日程从完成集移除该实例；全局完成（done）时先吸收为实例级再移除
export function unmarkInstanceDone(e: ScheduleEvent, dayKey: string): ScheduleEvent {
  if (!e.repeat) return { ...e, done: false };
  const dd = e.doneDates ?? [];
  if (!e.done) return { ...e, doneDates: dd.filter((d) => d !== dayKey) };
  // 全局完成吸收成实例级：展开全部实例（无限重复兜底到起点 +1 年），再减去被取消的实例
  const [y, m, d] = e.date.split("-").map(Number);
  const horizon = e.repeat.until ?? toDateKey(new Date(y, m - 1, d + 366));
  const all = expandEventDates(e, horizon);
  return { ...e, done: false, doneDates: all.filter((d) => d !== dayKey) };
}

// 实例是否已结束：按实例所在日 + 结束时间与 now 比较（重复实例共享 e.date，必须传入实例日）
export function isInstanceExpired(e: ScheduleEvent, dayKey: string, now: Date): boolean {
  if (isInstanceDone(e, dayKey) || !dayKey) return false;
  const todayKey = toDateKey(now);
  if (dayKey < todayKey) return true; // 过去日期：已过（全天事件按当天结束同样成立）
  if (dayKey > todayKey) return false; // 未来日期：未到，即使时刻早于现在也不结束
  if (!e.time) return false; // 今天的全天事件：当天 24:00 才结束
  const endMin = e.endTime ? parseTimeToMinutes(e.endTime) : parseTimeToMinutes(e.time) + 60;
  return now.getHours() * 60 + now.getMinutes() >= endMin;
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
        ? {
            freq,
            until: typeof r.until === "string" && r.until ? r.until : undefined,
            interval:
              freq === "daily" && typeof r.interval === "number" && r.interval >= 1
                ? Math.floor(r.interval)
                : undefined,
          }
        : undefined;
    out.push({
      id: o.id as string,
      title: o.title as string,
      date: o.date as string,
      time: typeof o.time === "string" ? o.time : "",
      endTime: typeof o.endTime === "string" && o.endTime ? o.endTime : undefined,
      endDate: typeof o.endDate === "string" && o.endDate ? o.endDate : undefined,
      description: typeof o.description === "string" ? o.description : "",
      done: Boolean(o.done),
      doneDates: Array.isArray(o.doneDates)
        ? o.doneDates.filter((d): d is string => typeof d === "string" && d.length === 10)
        : undefined,
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
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidEvent) : [];
  } catch {
    return [];
  }
}
