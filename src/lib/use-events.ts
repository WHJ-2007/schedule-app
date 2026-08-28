"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScheduleEvent,
  EventInput,
  updateEventInList,
  deleteEventFromList,
  toggleEventDone,
  loadEvents,
  saveEvents,
  createId,
  sanitizeImportedEvents,
} from "./events";
import { loadHistoryFile, loadHistoryFileSync, saveHistoryFile } from "./history-storage";

// 历史栈条目：events 是操作完成后的状态快照（引用零拷贝），at 为操作时间戳
export type HistoryEntry = { events: ScheduleEvent[]; at: number };

function sanitizeHistoryEntries(entries: unknown[]): HistoryEntry[] {
  return entries.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const candidate = entry as { events?: unknown; at?: unknown };
    if (!Array.isArray(candidate.events)) return [];
    return [{
      events: sanitizeImportedEvents(candidate.events),
      at: typeof candidate.at === "number" ? candidate.at : Date.now(),
    }];
  });
}

// 事件整体挪动（周视图拖拽）/全天跨天拉伸的批量补丁：一次提交多条，撤销时一条记录。
// time 缺省 = 全天事件横向拉伸（只改 date/endDate，不动时间字段）
export type EventMovePatch = {
  id: string;
  date: string;
  time?: string;
  endTime?: string;
  until?: string; // 重复日程整组平移：截止日随 date 同步移动（保持重复跨度不变）
  endDate?: string;
};

export function useEvents() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 历史栈：history[0] = 初始状态；index 指向当前版本；index 之后的是 future（可重做）
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [index, setIndex] = useState(0);
  const historyRef = useRef<HistoryEntry[]>([]);
  const indexRef = useRef(0);
  const eventsRef = useRef<ScheduleEvent[]>([]);
  eventsRef.current = events;
  // 恢复阶段不写回文件；用户第一次操作后才开始持久化
  const touchedRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initial = loadEvents();
    let restored: HistoryEntry[] | null = null;
    let savedIndex = 0;
    let initialEvents = initial;
    const finish = () => {
      if (cancelled) return;
      historyRef.current = restored ?? [{ events: initialEvents, at: Date.now() }];
      indexRef.current = restored
        ? Math.min(Math.max(savedIndex, 0), historyRef.current.length - 1)
        : 0;
      setHistory(historyRef.current);
      setIndex(indexRef.current);
      eventsRef.current = initialEvents;
      setEvents(initialEvents);
      setLoaded(true);
    };
    // 版本历史存文件（桌面端 AppData/versions.json，浏览器回退 localStorage）：
    // 刷新后撤销栈仍在。无 Tauri 运行时（浏览器/测试）→ 同步读 localStorage 回退，避免竞态
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) {
      const data = loadHistoryFileSync();
      if (data && Array.isArray(data.entries) && data.entries.length > 0) {
        const cleaned = sanitizeHistoryEntries(data.entries);
        if (cleaned.length > 0) {
          restored = cleaned;
          savedIndex = typeof data.index === "number" ? data.index : cleaned.length - 1;
          initialEvents = restored[savedIndex]?.events ?? initial;
        }
      }
      finish();
      return;
    }
    (async () => {
      try {
        const data = await loadHistoryFile();
        if (data && Array.isArray(data.entries) && data.entries.length > 0) {
          const cleaned = sanitizeHistoryEntries(data.entries);
          if (cleaned.length > 0) {
            restored = cleaned;
            savedIndex = typeof data.index === "number" ? data.index : cleaned.length - 1;
            initialEvents = restored[savedIndex]?.events ?? initial;
          }
        }
      } catch {
        // 恢复失败（离线）→ 用 localStorage
      }
      finish();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loaded) {
      saveEvents(events);
    }
  }, [events, loaded]);

  // 防抖写回版本历史到文件（600ms）；index 变化 = 有操作或撤销/重做/跳转
  useEffect(() => {
    if (!loaded || !touchedRef.current) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      saveHistoryFile(historyRef.current, indexRef.current).catch(() => {});
    }, 600);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [index, loaded]);

  // 所有变更走这里：同步算出新状态，压入历史栈（截断 future），再交给 React。
  // 栈里存的是变更后的状态：history[i].events 即 undo/redo 到 i 时可见的状态。
  // 同步计算（而非 setEvents(prev => ...)）保证同一批连续操作各自正确入栈
  const commit = useCallback((fn: (prev: ScheduleEvent[]) => ScheduleEvent[]) => {
    const prev = eventsRef.current;
    const next = fn(prev);
    if (next === prev) return;
    touchedRef.current = true;
    const h = historyRef.current;
    const newHistory = [...h.slice(0, indexRef.current + 1), { events: next, at: Date.now() }];
    historyRef.current = newHistory;
    indexRef.current = newHistory.length - 1;
    setHistory(newHistory);
    setIndex(newHistory.length - 1);
    eventsRef.current = next;
    setEvents(next);
  }, []);

  const addEvent = useCallback(
    (input: EventInput): ScheduleEvent => {
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
      commit((prev) => [...prev, event]);
      return event;
    },
    [commit]
  );

  const updateEvent = useCallback(
    (id: string, patch: Partial<Omit<ScheduleEvent, "id">>) => {
      commit((prev) => updateEventInList(prev, id, patch));
    },
    [commit]
  );

  const deleteEvent = useCallback(
    (id: string) => {
      commit((prev) => deleteEventFromList(prev, id));
    },
    [commit]
  );

  const deleteEvents = useCallback(
    (ids: string[]) => {
      commit((prev) => prev.filter((e) => !ids.includes(e.id)));
    },
    [commit]
  );

  const toggleDone = useCallback(
    (id: string) => {
      commit((prev) => toggleEventDone(prev, id));
    },
    [commit]
  );

  // 批量更新（多选菜单批量标记完成/未完成）：按 id 一次操作一条历史记录
  const updateEvents = useCallback(
    (ids: string[], patch: Partial<Omit<ScheduleEvent, "id">>) => {
      if (ids.length === 0) return;
      commit((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, ...patch } : e)));
    },
    [commit]
  );

  // 批量移动（周视图整体挪动选中组）/全天跨天拉伸：一次操作一条历史记录
  const applyMoveAll = useCallback(
    (patches: EventMovePatch[]) => {
      if (patches.length === 0) return;
      commit((prev) =>
        patches.reduce((list, p) => {
          // 全天横向拉伸只改 date/endDate：time 等字段缺省时不覆盖（避免清空全天 time）
          const patch: Partial<Omit<ScheduleEvent, "id">> = { date: p.date };
          if (p.time !== undefined) patch.time = p.time;
          if (p.endTime !== undefined) patch.endTime = p.endTime;
          if (p.until !== undefined) {
            // 重复日程整组平移：只改截止日，频率等其余规则保留
            const src = list.find((x) => x.id === p.id);
            patch.repeat = src?.repeat ? { ...src.repeat, until: p.until } : undefined;
          }
          if (p.endDate !== undefined) patch.endDate = p.endDate;
          return updateEventInList(list, p.id, patch);
        }, prev)
      );
    },
    [commit]
  );

  // 导入：整体替换全部日程（已校验清洗）
  const replaceEvents = useCallback(
    (list: ScheduleEvent[]) => {
      commit(() => list);
    },
    [commit]
  );

  const undo = useCallback(() => {
    if (indexRef.current <= 0) return;
    touchedRef.current = true;
    const i = indexRef.current - 1;
    indexRef.current = i;
    setIndex(i);
    eventsRef.current = historyRef.current[i].events;
    setEvents(eventsRef.current);
  }, []);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    touchedRef.current = true;
    const i = indexRef.current + 1;
    indexRef.current = i;
    setIndex(i);
    eventsRef.current = historyRef.current[i].events;
    setEvents(eventsRef.current);
  }, []);

  const jumpToIndex = useCallback((i: number) => {
    if (i < 0 || i >= historyRef.current.length) return;
    touchedRef.current = true;
    indexRef.current = i;
    setIndex(i);
    eventsRef.current = historyRef.current[i].events;
    setEvents(eventsRef.current);
  }, []);

  return {
    events,
    addEvent,
    updateEvent,
    updateEvents,
    deleteEvent,
    deleteEvents,
    toggleDone,
    replaceEvents,
    applyMoveAll,
    undo,
    redo,
    jumpToIndex,
    history,
    index,
    canUndo: index > 0,
    canRedo: index < history.length - 1,
  };
}
