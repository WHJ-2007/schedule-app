import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { useEvents } from "./use-events";
import { STORAGE_KEY } from "./events";
import { invoke } from "@tauri-apps/api/core";

// 持久化走 history-storage：Tauri invoke 失败回退 localStorage。
// 默认 mock invoke 返回 undefined（load 走 localStorage 空回退），持久化测试内 mock 成功路径
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  localStorage.clear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

afterEach(() => {
  // 卸载组件触发 effect cleanup，取消防抖 timer——否则上一测试的 timer 会在下一测试触发并污染 fetch mock
  cleanup();
  vi.unstubAllGlobals();
});

// mount 恢复完成信号：history 从空变为初始快照（应用不再生成示例日程，初始 events 为空）
async function waitMounted(result: { current: { history: unknown[] } }) {
  await waitFor(() => {
    expect(result.current.history.length).toBeGreaterThan(0);
  });
}

describe("useEvents", () => {
  it("mount 后不生成示例日程，列表为空", async () => {
    const { result } = renderHook(() => useEvents());
    await waitMounted(result);
    expect(result.current.events).toEqual([]);
    // 保存回 localStorage 的是空列表，而非自动生成的示例日程
    expect(localStorage.getItem(STORAGE_KEY)).toBe("[]");
  });

  it("adds an event", async () => {
    const { result } = renderHook(() => useEvents());
    await waitMounted(result);
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
    await waitMounted(result);
    act(() => {
      result.current.addEvent({ title: "初始", date: "2026-08-05", time: "10:00" });
    });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
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
    await waitMounted(result);
    act(() => {
      result.current.addEvent({ title: "初始", date: "2026-08-05", time: "10:00" });
    });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
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
    await waitMounted(result);
    act(() => {
      result.current.addEvent({ title: "待撤销", date: "2026-08-05", time: "10:00" });
    });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });
    const before = result.current.events.length;
    act(() => {
      result.current.addEvent({ title: "第二条", date: "2026-08-06", time: "10:00" });
    });
    await waitFor(() => {
      expect(result.current.events.length).toBe(before + 1);
    });
    act(() => {
      result.current.undo();
    });
    await waitFor(() => {
      expect(result.current.events.some((e) => e.title === "第二条")).toBe(false);
      expect(result.current.events.length).toBe(before);
    });
    act(() => {
      result.current.redo();
    });
    await waitFor(() => {
      expect(result.current.events.some((e) => e.title === "第二条")).toBe(true);
    });
  });

  it("删除后 undo 恢复，撤销后再编辑截断 future", async () => {
    const { result } = renderHook(() => useEvents());
    await waitMounted(result);
    act(() => {
      result.current.addEvent({ title: "初始", date: "2026-08-05", time: "10:00" });
    });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
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
    await waitMounted(result);
    act(() => {
      result.current.addEvent({ title: "初始", date: "2026-08-05", time: "10:00" });
    });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });
    act(() => {
      result.current.replaceEvents([{ id: "x", title: "导入", date: "2026-08-05", time: "", description: "", done: false }]);
    });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("导入");
    });
    act(() => {
      result.current.undo();
    });
    await waitFor(() => {
      expect(result.current.events[0]?.title).toBe("初始");
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
    await waitMounted(result);
    act(() => {
      result.current.addEvent({ title: "A", date: "2026-08-05", time: "10:00", endTime: "11:00" });
      result.current.addEvent({ title: "B", date: "2026-08-05", time: "12:00", endTime: "13:00" });
    });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(2);
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
      expect(result.current.events.find((e) => e.id === a.id)?.time).toBe("10:00");
    });
  });

  it("applyMoveAll 重复日程整组平移：until 同步移动、频率保留，撤销恢复", async () => {
    const { result } = renderHook(() => useEvents());
    await waitMounted(result);
    act(() => {
      result.current.addEvent({ title: "重复", date: "2026-08-05", time: "10:00" });
    });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
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
    await waitMounted(result);
    act(() => {
      result.current.addEvent({ title: "A", date: "2026-08-05", time: "10:00" });
      result.current.addEvent({ title: "B", date: "2026-08-05", time: "12:00" });
    });
    await waitFor(() => {
      expect(result.current.events).toHaveLength(2);
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
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_history") return Promise.resolve({ entries: restored, index: 0 });
      return Promise.resolve(undefined);
    });
    vi.stubGlobal("__TAURI_INTERNALS__", {}); // 模拟 Tauri 运行时，走 invoke 异步路径
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
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "load_history") return Promise.resolve({ entries: [], index: 0 });
      return Promise.resolve(undefined);
    });
    vi.stubGlobal("__TAURI_INTERNALS__", {}); // 模拟 Tauri 运行时，走 invoke 异步路径
    const { result } = renderHook(() => useEvents());
    await waitFor(() => {
      expect(result.current.history.length).toBe(1); // mount 恢复完成
    });
    expect(invokeMock).toHaveBeenCalledWith("load_history"); // mount 时读取
    act(() => {
      result.current.addEvent({ title: "待写回", date: "2026-08-05", time: "10:00" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700)); // 防抖 600ms
    });
    const save = invokeMock.mock.calls.find((c) => c[0] === "save_history");
    expect(save).toBeDefined();
    expect((save![1] as { index: number }).index).toBe(1);
    act(() => {
      result.current.undo();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    const save2 = invokeMock.mock.calls.filter((c) => c[0] === "save_history").at(-1);
    expect((save2![1] as { index: number }).index).toBe(0);
  });

  it("persists across remounts", async () => {
    const first = renderHook(() => useEvents());
    await waitMounted(first.result);
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
