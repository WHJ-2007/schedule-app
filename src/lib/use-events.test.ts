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
