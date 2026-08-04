import { beforeEach, describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEvents } from "./use-events";
import { STORAGE_KEY } from "./events";

beforeEach(() => {
  localStorage.clear();
});

describe("useEvents", () => {
  it("seeds sample events after mount", async () => {
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(5);
    });
  });

  it("adds an event", async () => {
    const { result } = renderHook(() => useEvents());
    act(() => {
      result.current.addEvent({ title: "新日程", date: "2026-08-05", time: "10:00" });
    });
    await waitFor(() => {
      const added = result.current.events.find((e) => e.title === "新日程");
      expect(added).toBeDefined();
      expect(added?.date).toBe("2026-08-05");
    });
  });

  it("updates and deletes an event", async () => {
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });
    const target = result.current.events[0];
    act(() => {
      result.current.updateEvent(target.id, { title: "改名了" });
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === target.id)?.title).toBe("改名了");
    });
    act(() => {
      result.current.deleteEvent(target.id);
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === target.id)).toBeUndefined();
    });
  });

  it("toggles done", async () => {
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });
    const target = result.current.events[0];
    act(() => {
      result.current.toggleDone(target.id);
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === target.id)?.done).toBe(true);
    });
  });

  it("undo/redo：添加后撤销消失、重做恢复", async () => {
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });
    const before = result.current.events.length;
    act(() => {
      result.current.addEvent({ title: "待撤销", date: "2026-08-05", time: "10:00" });
    });
    await waitFor(() => {
      expect(result.current.events.length).toBe(before + 1);
    });
    act(() => {
      result.current.undo();
    });
    await waitFor(() => {
      expect(result.current.events.some((e) => e.title === "待撤销")).toBe(false);
      expect(result.current.events.length).toBe(before);
    });
    act(() => {
      result.current.redo();
    });
    await waitFor(() => {
      expect(result.current.events.some((e) => e.title === "待撤销")).toBe(true);
    });
  });

  it("删除后 undo 恢复，撤销后再编辑截断 future", async () => {
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });
    const target = result.current.events[0];
    act(() => {
      result.current.deleteEvent(target.id);
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === target.id)).toBeUndefined();
    });
    act(() => {
      result.current.undo();
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === target.id)).toBeDefined();
    });
    // 撤销后新操作截断 future：重做不再可用
    act(() => {
      result.current.addEvent({ title: "截断测试", date: "2026-08-06" });
    });
    await waitFor(() => {
      expect(result.current.canRedo).toBe(false);
    });
  });

  it("replaceEvents（导入）可撤销，jumpToIndex 回到初始状态", async () => {
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });
    act(() => {
      result.current.replaceEvents([{ id: "x", title: "导入", date: "2026-08-05", time: "", description: "", done: false }]);
    });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });
    act(() => {
      result.current.undo();
    });
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(1);
    });
    act(() => {
      result.current.jumpToIndex(0);
    });
    await waitFor(() => {
      expect(result.current.canUndo).toBe(false);
    });
  });

  it("applyMoveAll 批量移动一次入栈可撤销", async () => {
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });
    const a = result.current.events[0];
    const b = result.current.events[1];
    const historyLen = result.current.history.length;
    act(() => {
      result.current.applyMoveAll([
        { id: a.id, date: a.date, time: "12:00", endTime: a.endTime },
        { id: b.id, date: b.date, time: "13:00", endTime: b.endTime },
      ]);
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === a.id)?.time).toBe("12:00");
      // 一次批量移动只产生一条历史
      expect(result.current.history.length).toBe(historyLen + 1);
    });
    act(() => {
      result.current.undo();
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === a.id)?.time).toBe(a.time);
    });
  });

  it("setEventColors 批量设色一次入栈，撤销恢复", async () => {
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });
    const a = result.current.events[0];
    const b = result.current.events[1];
    const historyLen = result.current.history.length;
    act(() => {
      result.current.setEventColors([a.id, b.id], "#ef4444");
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === a.id)?.color).toBe("#ef4444");
      expect(result.current.events.find((e) => e.id === b.id)?.color).toBe("#ef4444");
      expect(result.current.history.length).toBe(historyLen + 1);
    });
    act(() => {
      result.current.undo();
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === a.id)?.color).toBeUndefined();
    });
  });

  it("persists across remounts", async () => {
    const first = renderHook(() => useEvents());
    await waitFor(() => {
      expect(first.result.current.events.length).toBeGreaterThan(0);
    });
    act(() => {
      first.result.current.addEvent({ title: "持久化测试", date: "2026-08-09" });
    });
    await waitFor(() => {
      expect(first.result.current.events.some((e) => e.title === "持久化测试")).toBe(true);
    });
    first.unmount();

    const second = renderHook(() => useEvents());
    await waitFor(() => {
      expect(second.result.current.events.some((e) => e.title === "持久化测试")).toBe(true);
    });
    expect(localStorage.getItem(STORAGE_KEY)).toContain("持久化测试");
  });
});
