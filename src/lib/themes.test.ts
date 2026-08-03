import { describe, it, expect, afterEach } from "vitest";
import {
  THEMES,
  DEFAULT_THEME_PATH,
  THEME_STORAGE_KEY,
  getSavedThemePath,
  saveThemePath,
} from "@/lib/themes";

afterEach(() => {
  localStorage.clear();
});

describe("themes", () => {
  it("保留恰好 2 个主题，编号为 1/6", () => {
    expect(THEMES).toHaveLength(2);
    expect(THEMES.map((t) => t.n)).toEqual([1, 6]);
  });

  it("路径唯一且与编号一致", () => {
    const paths = THEMES.map((t) => t.path);
    expect(new Set(paths).size).toBe(2);
    for (const t of THEMES) expect(t.path).toBe(`/style-${t.n}`);
  });

  it("未保存时返回默认路径", () => {
    expect(getSavedThemePath()).toBe(DEFAULT_THEME_PATH);
  });

  it("保存后读回有效路径", () => {
    saveThemePath("/style-6");
    expect(getSavedThemePath()).toBe("/style-6");
  });

  it("已删除主题/垃圾值回退默认", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "/style-2");
    expect(getSavedThemePath()).toBe(DEFAULT_THEME_PATH);
    localStorage.setItem(THEME_STORAGE_KEY, "garbage");
    expect(getSavedThemePath()).toBe(DEFAULT_THEME_PATH);
  });
});
