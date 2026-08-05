import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEvents } from "./use-events";
import { STORAGE_KEY } from "./events";

// jsdom 26 自带 fetch 会发真实请求：默认拒绝（走 localStorage 回退），持久化测试内 mock 成功路径
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline")))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it("applyMoveAll 重复日程整组平移：until 同步移动、频率保留，撤销恢复", async () => {
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });
    const ev = result.current.events[0];
    act(() => {
      result.current.updateEvent(ev.id, {
        repeat: { freq: "daily", until: "2026-08-09", interval: 2 },
      });
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === ev.id)?.repeat).toEqual({
        freq: "daily",
        until: "2026-08-09",
        interval: 2,
      });
    });
    act(() => {
      result.current.applyMoveAll([{ id: ev.id, date: "2026-08-05", until: "2026-08-11" }]);
    });
    await waitFor(() => {
      const moved = result.current.events.find((e) => e.id === ev.id);
      expect(moved?.date).toBe("2026-08-05");
      // 截止日平移 +2 天，频率与间隔不变 → 重复跨度保持
      expect(moved?.repeat).toEqual({ freq: "daily", until: "2026-08-11", interval: 2 });
    });
    act(() => {
      result.current.undo();
    });
    await waitFor(() => {
      const back = result.current.events.find((e) => e.id === ev.id);
      expect(back?.date).toBe(ev.date);
      expect(back?.repeat).toEqual({ freq: "daily", until: "2026-08-09", interval: 2 });
    });
  });

  it("updateEvents 批量更新一次入栈，撤销恢复", async () => {
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });
    const a = result.current.events[0];
    const b = result.current.events[1];
    const historyLen = result.current.history.length;
    act(() => {
      result.current.updateEvents([a.id, b.id], { done: true });
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === a.id)?.done).toBe(true);
      expect(result.current.events.find((e) => e.id === b.id)?.done).toBe(true);
      expect(result.current.history.length).toBe(historyLen + 1);
    });
    act(() => {
      result.current.undo();
    });
    await waitFor(() => {
      expect(result.current.events.find((e) => e.id === a.id)?.done).toBe(false);
    });
  });

  it("从文件恢复历史栈：停留在保存的 index 位置", async () => {
    const restored = [
      {
        events: [{ id: "a", title: "旧版本", date: "2026-08-03", time: "09:00", description: "", done: false }],
        at: 1,
      },
      {
        events: [{ id: "b", title: "新版本", date: "2026-08-04", time: "10:00", description: "", done: false }],
        at: 2,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ entries: restored, index: 0 }),
        } as Response)
      )
    );
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events[0]?.title).toBe("旧版本");
    });
    expect(result.current.index).toBe(0); // 撤销过：停留在 index 0，可重做
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    act(() => {
      result.current.redo();
    });
    await waitFor(() => {
      expect(result.current.events[0]?.title).toBe("新版本");
    });
  });

  it("操作后防抖写回文件（含 entries 与 index），undo 也写回", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [], index: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0); // mount 恢复完成
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/history"); // mount 时读取
    act(() => {
      result.current.addEvent({ title: "待写回", date: "2026-08-05", time: "10:00" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700)); // 防抖 600ms
    });
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
    expect(post).toBeDefined();
    expect(JSON.parse(String(post![1].body)).index).toBe(1);
    act(() => {
      result.current.undo();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    const post2 = fetchMock.mock.calls.findLast((c) => c[1]?.method === "POST");
    expect(JSON.parse(String(post2![1].body)).index).toBe(0);
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
