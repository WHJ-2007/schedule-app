import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSavedView, saveView, DEFAULT_VIEW, VIEW_STORAGE_KEY } from "./views";

describe("views", () => {
  beforeEach(() => localStorage.clear());

  it("空存储回退默认 month", () => {
    expect(getSavedView()).toBe(DEFAULT_VIEW);
    expect(DEFAULT_VIEW).toBe("month");
  });

  it("非法值回退默认", () => {
    localStorage.setItem(VIEW_STORAGE_KEY, "decade");
    expect(getSavedView()).toBe("month");
  });

  it("save/load 往返", () => {
    saveView("week");
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe("week");
    expect(getSavedView()).toBe("week");
  });

  it("localStorage 不可用时回退默认", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(getSavedView()).toBe("month");
    spy.mockRestore();
  });
});
