import { describe, it, expect } from "vitest";
import {
  CHANGELOG,
  LOG_PAGE_SIZE,
  getChangelogPage,
  getChangelogPageCount,
} from "@/lib/changelog";

describe("changelog", () => {
  it("至少有一条版本记录", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it("版本号为日期时间格式", () => {
    for (const e of CHANGELOG) expect(e.version).toMatch(/^\d{8}-\d{4}$/);
  });

  it("最新版本在前（按版本号倒序）", () => {
    const versions = CHANGELOG.map((e) => e.version);
    const sorted = [...versions].sort((a, b) => b.localeCompare(a));
    expect(versions).toEqual(sorted);
  });

  it("标题与改动列表非空", () => {
    for (const e of CHANGELOG) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.changes.length).toBeGreaterThan(0);
    }
  });

  it("分页覆盖全部条目且不多出", () => {
    const covered = getChangelogPageCount() * LOG_PAGE_SIZE;
    expect(covered).toBeGreaterThanOrEqual(CHANGELOG.length);
    expect(covered - LOG_PAGE_SIZE).toBeLessThan(CHANGELOG.length);
  });

  it("第 1 页返回最新条目", () => {
    const page = getChangelogPage(1);
    expect(page[0].version).toBe(CHANGELOG[0].version);
    expect(page.length).toBeLessThanOrEqual(LOG_PAGE_SIZE);
  });

  it("越界页号返回空数组", () => {
    expect(getChangelogPage(getChangelogPageCount() + 1)).toEqual([]);
    expect(getChangelogPage(0)).toEqual([]);
  });

  it("每页恰好一个版本", () => {
    expect(LOG_PAGE_SIZE).toBe(1);
    for (let p = 1; p <= getChangelogPageCount(); p++) {
      expect(getChangelogPage(p)).toHaveLength(1);
    }
  });
});
