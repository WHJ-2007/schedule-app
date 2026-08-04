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
} from "./events";

// 历史栈条目：events 是操作完成后的状态快照（引用零拷贝），at 为操作时间戳
export type HistoryEntry = { events: ScheduleEvent[]; at: number };

// 事件整体挪动（周视图拖拽）的批量补丁：一次提交多条，撤销时一条记录
export type EventMovePatch = { id: string; date: string; time: string; endTime?: string };

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

  useEffect(() => {
    const initial = loadEvents();
    setEvents(initial);
    historyRef.current = [{ events: initial, at: Date.now() }];
    setHistory(historyRef.current);
    setIndex(0);
    indexRef.current = 0;
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      saveEvents(events);
    }
  }, [events, loaded]);

  // 所有变更走这里：同步算出新状态，压入历史栈（截断 future），再交给 React。
  // 栈里存的是变更后的状态：history[i].events 即 undo/redo 到 i 时可见的状态。
  // 同步计算（而非 setEvents(prev => ...)）保证同一批连续操作各自正确入栈
  const commit = useCallback((fn: (prev: ScheduleEvent[]) => ScheduleEvent[]) => {
    const prev = eventsRef.current;
    const next = fn(prev);
    if (next === prev) return;
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

  // 批量移动（周视图整体挪动选中组）：一次操作一条历史记录
  const applyMoveAll = useCallback(
    (patches: EventMovePatch[]) => {
      if (patches.length === 0) return;
      commit((prev) =>
        patches.reduce(
          (list, p) => updateEventInList(list, p.id, { date: p.date, time: p.time, endTime: p.endTime }),
          prev
        )
      );
    },
    [commit]
  );

  // 批量设色（选中组一次变色）：一次操作一条历史记录；color 空串 = 清除为默认
  const setEventColors = useCallback(
    (ids: string[], color: string) => {
      commit((prev) =>
        prev.map((e) => (ids.includes(e.id) ? { ...e, color: color || undefined } : e))
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
    const i = indexRef.current - 1;
    indexRef.current = i;
    setIndex(i);
    eventsRef.current = historyRef.current[i].events;
    setEvents(eventsRef.current);
  }, []);

  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    const i = indexRef.current + 1;
    indexRef.current = i;
    setIndex(i);
    eventsRef.current = historyRef.current[i].events;
    setEvents(eventsRef.current);
  }, []);

  const jumpToIndex = useCallback((i: number) => {
    if (i < 0 || i >= historyRef.current.length) return;
    indexRef.current = i;
    setIndex(i);
    eventsRef.current = historyRef.current[i].events;
    setEvents(eventsRef.current);
  }, []);

  return {
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    deleteEvents,
    toggleDone,
    replaceEvents,
    applyMoveAll,
    setEventColors,
    undo,
    redo,
    jumpToIndex,
    history,
    index,
    canUndo: index > 0,
    canRedo: index < history.length - 1,
  };
}
